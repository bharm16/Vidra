import type { Server } from "node:http";
import type { DIContainer } from "@infrastructure/DIContainer";
import type { SessionService } from "@services/sessions/SessionService";
import type { RequestIdempotencyService } from "@services/video-generation/jobs/RequestIdempotencyService";
import { SketchBudgetService } from "@services/sketch-budget/SketchBudgetService";
import type {
  SketchBudgetStore,
  SketchReservation,
} from "@services/sketch-budget/storage/SketchBudgetStore";
import { SketchAllowanceExceededError } from "@services/sketch-budget/storage/SketchBudgetStore";
import {
  asBucket,
  ControlledBucket,
  controlledStorage,
} from "../storage-conformance/controlledBucket";
import { installOutboundGuard, type OutboundGuard } from "./outboundGuard";
import type { AcceptLiveOutputSessionPort } from "@services/admission/acceptLiveOutput";

/**
 * The cross-mode harness booted on the REAL adapters (issue #142).
 *
 * `harness.ts` — the offline walkthrough — substitutes every persistence
 * boundary with an in-memory double. This harness keeps the doubles ONLY for
 * the process-external GENERATION boundaries (the recorded replay seams) and
 * runs the writes against what production runs against:
 *
 *  - **Firestore, real.** `sessionStore`, `requestIdempotencyService` (the
 *    admission receipt), `studioProjectStore`, `videoJobStore` and the sketch
 *    budget store are the production Firestore adapters, driven against the
 *    FIRESTORE EMULATOR (`FIRESTORE_EMULATOR_HOST`). Nothing is substituted —
 *    `configureServices()` registers exactly what production registers.
 *  - **Storage, production-shaped.** `storageService` and `imageAssetStore`
 *    are the production `StorageService` and `GcsImageAssetStore` classes —
 *    id minting, owner-scoped paths, precondition writes and expiring signed
 *    URLs all run their real code — over the #138 CONTROLLED BUCKET, which
 *    sits exactly where GCS sits. The bucket's signed URLs are served by the
 *    outbound guard's route table (the way a signed-URL GET would be), so a
 *    bridge copy fetches its source over `fetch` without leaving the process.
 *  - **Authentication, real.** Besides the replay API-key bypass, requests can
 *    authenticate with a Firebase ID token minted by the AUTH EMULATOR
 *    (`FIREBASE_AUTH_EMULATOR_HOST`) — `apiAuth` verifies it with
 *    `getAuth().verifyIdToken`, so ownership runs under real authentication.
 *
 * Both emulator variables must be set (CI's job sets them; `firebase
 * emulators:exec --only firestore,auth` exports them). Without them the suite
 * skips rather than fakes a pass — see the test file.
 */

/** The replay API-key bypass principal this harness authenticates as. */
export const REAL_ADAPTER_API_KEY = "real-adapter-replay-key";
/** apiAuth mints `api-key:<key>` as the principal (see @utils/apiKeyUser). */
export const REAL_ADAPTER_USER_ID = `api-key:${REAL_ADAPTER_API_KEY}`;

/** The signed-URL host the production minter emits for the controlled bucket. */
export const GCS_URL_HOST = "storage.googleapis.com";

const LLM_ENV_KEYS = [
  "OPENAI_API_KEY",
  "GROQ_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
] as const;

/** Whether the suite's environment can run the real Firestore adapter. */
export function firestoreEmulatorConfigured(): boolean {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST);
}

/** Whether the Auth emulator is reachable for real token verification. */
export function authEmulatorConfigured(): boolean {
  return Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
}

class InMemorySketchBudgetStore implements SketchBudgetStore {
  private readonly reserved = new Map<string, number>();

  reserve(reservation: SketchReservation): Promise<void> {
    const key = `${reservation.userId}|${reservation.day}`;
    const already = this.reserved.get(key) ?? 0;
    const next = already + reservation.millicents;
    if (next > reservation.capMillicents) {
      return Promise.reject(
        new SketchAllowanceExceededError(
          already,
          reservation.millicents,
          reservation.capMillicents,
        ),
      );
    }
    this.reserved.set(key, next);
    return Promise.resolve();
  }
}

/**
 * A Firebase identity created in the AUTH EMULATOR, holding a verified ID
 * token: the exact credential `apiAuth` checks with `verifyIdToken`.
 */
export interface FirebaseIdentity {
  readonly uid: string;
  readonly idToken: string;
}

/**
 * Mint a real, emulated Firebase identity: the user is created through the
 * Admin SDK against the Auth emulator, a custom token is exchanged for an ID
 * token at the emulator's Identity Toolkit surface, and the result verifies
 * through the same `getAuth().verifyIdToken` the API's auth middleware runs.
 */
export async function createFirebaseIdentity(uid: string): Promise<FirebaseIdentity> {
  const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (!emulatorHost) {
    throw new Error(
      "FIREBASE_AUTH_EMULATOR_HOST is not set; cannot mint a real identity",
    );
  }
  const { getAuth } = await import("@infrastructure/firebaseAdmin");
  const auth = getAuth();
  // Re-runs reuse the emulator: a stale identity from a previous run is
  // replaced rather than allowed to collide.
  try {
    await auth.deleteUser(uid);
  } catch {
    // No such user yet — the create below is the first.
  }
  await auth.createUser({ uid, displayName: uid });

  const customToken = await auth.createCustomToken(uid);
  const response = await fetch(
    `http://${emulatorHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=emulator-suite-api-key`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const body = (await response.json()) as { idToken?: string };
  if (!response.ok || typeof body.idToken !== "string") {
    throw new Error(
      `Auth emulator did not return an ID token: ${JSON.stringify(body)}`,
    );
  }
  return { uid, idToken: body.idToken };
}

export interface ApiResponse {
  status: number;
  json: Record<string, unknown>;
}

/** Headers for one authenticated caller. */
export interface Caller {
  /** Lower-cased header name → value, applied to every request. */
  readonly headers: Readonly<Record<string, string>>;
}

/** The replay API-key bypass caller. */
export function apiKeyCaller(): Caller {
  return { headers: { "x-api-key": REAL_ADAPTER_API_KEY } };
}

/** A Firebase-authenticated caller — verified by `verifyIdToken`, not the bypass. */
export function firebaseCaller(identity: FirebaseIdentity): Caller {
  return { headers: { "x-firebase-token": identity.idToken } };
}

export interface RealAdapterHarness {
  readonly baseUrl: string;
  readonly container: DIContainer;
  readonly guard: OutboundGuard;
  /** The controlled GCS bucket the production storage adapters run against. */
  readonly bucket: ControlledBucket;
  /** Resolved production adapters — the same instances the app uses. */
  readonly sessionService: SessionService;
  readonly requestIdempotency: RequestIdempotencyService;
  post(
    path: string,
    body: unknown,
    caller?: Caller,
  ): Promise<ApiResponse>;
  patch(path: string, body: unknown, caller?: Caller): Promise<ApiResponse>;
  get(path: string, caller?: Caller): Promise<ApiResponse>;
  delete(path: string, caller?: Caller): Promise<ApiResponse>;
  close(): Promise<void>;
}

/**
 * Serve the controlled bucket the way its signed URLs are meant to be served:
 * `GET https://storage.googleapis.com/<bucket>/<object-path>?<signature>` →
 * the object's bytes, or a plain 404 when it does not exist. Signature and
 * expiry enforcement are the ADAPTERS' job (they mint fresh URLs per read);
 * this route exists so a bridge copy's `fetch` of a minted URL has somewhere
 * deterministic to land without a byte leaving the process.
 */
function bucketRoute(bucket: ControlledBucket): (url: string) => Promise<Response> {
  return async (url: string) => {
    const parsed = new URL(url);
    const prefix = `/${bucket.name}/`;
    if (!parsed.pathname.startsWith(prefix)) {
      return new Response("not found", { status: 404 });
    }
    const objectPath = decodeURIComponent(parsed.pathname.slice(prefix.length));
    const object = bucket.read(objectPath);
    if (!object) {
      return new Response("no such object", { status: 404 });
    }
    return new Response(new Uint8Array(object.buffer), {
      status: 200,
      headers: { "content-type": object.contentType },
    });
  };
}

export async function startRealAdapterHarness(): Promise<RealAdapterHarness> {
  const envBackup = new Map<string, string | undefined>();
  const setEnv = (key: string, value: string | undefined): void => {
    if (!envBackup.has(key)) envBackup.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };

  setEnv("NODE_ENV", "test");
  setEnv("PORT", "0");
  // The recorded generation seams (LLM router, image providers, studio runner)
  // stay replayed; the persistence boundaries below do not.
  setEnv("REPLAY_MODE", "replay");
  setEnv("ENABLE_STUDIO", "true");
  setEnv("ALLOWED_API_KEYS", REAL_ADAPTER_API_KEY);
  setEnv("API_KEY", undefined);
  setEnv("REPLICATE_API_TOKEN", "replay-only-not-a-credential");
  setEnv("FAL_KEY", "replay-only-not-a-credential");
  for (const key of LLM_ENV_KEYS) setEnv(key, undefined);
  setEnv("METADATA_SERVER_DETECTION", "none");
  // The project the emulators serve. CI pins it to the `--project` the
  // emulators run under; the default matches this suite's local runner.
  if (!process.env.VITE_FIREBASE_PROJECT_ID) {
    setEnv("VITE_FIREBASE_PROJECT_ID", "demo-xmode");
  }

  const bucket = new ControlledBucket("cross-mode-real-adapters");
  const guard = installOutboundGuard({
    routes: { [GCS_URL_HOST]: bucketRoute(bucket) },
  });

  // Dynamic imports: server modules snapshot env at module load, so nothing
  // server-side may be imported before the env above is in place.
  const { configureServices, initializeServices } = await import(
    "@config/services.config"
  );
  const { createApp } = await import("@server/app");
  const { startServer } = await import("@server/server");

  const container = await configureServices();

  // The ONLY substitutions: the GCS boundary tokens, pointed at the controlled
  // bucket — the same stand-in the #138 conformance suite drives the production
  // adapters against. Every store, adapter and service above them is what
  // production registers: the Firestore adapters resolve against the emulator,
  // StorageService and GcsImageAssetStore against this bucket.
  container.registerValue("gcsStorage", controlledStorage(bucket));
  container.registerValue("gcsBucketName", bucket.name);
  container.registerValue("gcsBucket", asBucket(bucket));
  // The sketch budget store keeps its in-memory double: the daily relay
  // allowance is not one of this suite's writes, and the Firestore-backed
  // production store would add a second emulator dependency for no assertion.
  const config = container.resolve<{
    fal: { sketchDailyCapCents: number; sketchFrameCostMillicents: number };
  }>("config");
  container.registerValue(
    "sketchBudgetService",
    new SketchBudgetService({
      store: new InMemorySketchBudgetStore(),
      dailyCapCents: config.fal.sketchDailyCapCents,
      frameCostMillicents: config.fal.sketchFrameCostMillicents,
      now: () => new Date(),
    }),
  );

  await initializeServices(container);
  const app = createApp(container);
  const server: Server = await startServer(app, container);

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error(`Expected a TCP address, received ${String(address)}`);
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    container,
    guard,
    bucket,
    sessionService: container.resolve<SessionService>("sessionService"),
    requestIdempotency: container.resolve<RequestIdempotencyService>(
      "requestIdempotencyService",
    ),
    async post(
      path: string,
      body: unknown,
      caller: Caller = apiKeyCaller(),
    ): Promise<ApiResponse> {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...caller.headers,
        },
        body: JSON.stringify(body),
      });
      return {
        status: response.status,
        json: (await response.json()) as Record<string, unknown>,
      };
    },
    async patch(
      path: string,
      body: unknown,
      caller: Caller = apiKeyCaller(),
    ): Promise<ApiResponse> {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...caller.headers,
        },
        body: JSON.stringify(body),
      });
      return {
        status: response.status,
        json: (await response.json()) as Record<string, unknown>,
      };
    },
    async get(path: string, caller: Caller = apiKeyCaller()): Promise<ApiResponse> {
      const response = await fetch(`${baseUrl}${path}`, { headers: caller.headers });
      return {
        status: response.status,
        json: (await response.json()) as Record<string, unknown>,
      };
    },
    async delete(
      path: string,
      caller: Caller = apiKeyCaller(),
    ): Promise<ApiResponse> {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "DELETE",
        headers: caller.headers,
      });
      return {
        status: response.status,
        json: (await response.json()) as Record<string, unknown>,
      };
    },
    async close(): Promise<void> {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      guard.restore();
      for (const [key, value] of envBackup) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}

/**
 * A session port whose append fails ONCE, then delegates — the shape of a
 * process dying between the durable admission checkpoint (#128) and the
 * session append. Everything else is delegated to the real service, so the
 * checkpoint is written to the REAL Firestore by the REAL code before the
 * failure lands.
 */
export function sessionServiceFailingAppendOnce(
  real: SessionService,
): AcceptLiveOutputSessionPort {
  let failed = false;
  return {
    requireOwnedSession: (userId, sessionId) =>
      real.requireOwnedSession(userId, sessionId),
    appendGenerationToVersion: (userId, sessionId, promptVersionId, generation) => {
      if (!failed) {
        failed = true;
        return Promise.reject(new Error("process died before the append landed"));
      }
      return real.appendGenerationToVersion(
        userId,
        sessionId,
        promptVersionId,
        generation,
      );
    },
    createPromptSessionAtomically: (userId, sessionId, request) =>
      real.createPromptSessionAtomically(userId, sessionId, request),
    updatePromptForUser: (userId, sessionId, updates) =>
      real.updatePromptForUser(userId, sessionId, updates),
    deleteSessionForUser: (userId, sessionId) =>
      real.deleteSessionForUser(userId, sessionId),
  };
}
