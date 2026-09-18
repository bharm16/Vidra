import type { Server } from "node:http";
import type { DIContainer } from "@infrastructure/DIContainer";
import { SketchBudgetService } from "@services/sketch-budget/SketchBudgetService";
import type {
  SketchBudgetStore,
  SketchReservation,
} from "@services/sketch-budget/storage/SketchBudgetStore";
import { SketchAllowanceExceededError } from "@services/sketch-budget/storage/SketchBudgetStore";
import {
  contentAddressedObjectId,
  ControlledVideoProvider,
  InMemoryIdempotencyService,
  InMemoryImageAssetStore,
  InMemoryObjectStore,
  InMemorySessionStore,
  InMemoryStorageService,
  InMemoryStudioProjectStore,
  InMemoryVideoJobStore,
  OBJECT_STORE_HOST,
  RefundWitness,
} from "./boundaryDoubles";
import { installOutboundGuard, type OutboundGuard } from "./outboundGuard";
import { CROSS_MODE_CLIP } from "@scripts/replay/goldenScenarios";

/**
 * Boots the REAL app for the cross-mode walkthrough, offline.
 *
 * Two mechanisms, and the difference matters:
 *
 *  - **Recorded** boundaries are served by the replay seams already in the
 *    product (`REPLAY_MODE=replay`): the LLM router, the image preview
 *    provider, the studio image runner, and — new with this walkthrough — the
 *    sketch relay's upstream fetch.
 *  - **Controlled** boundaries are substituted by registration at the same
 *    token production registers its Firestore/GCS adapter at. The services
 *    above them are untouched; that is what makes this a test of the seams
 *    rather than of a parallel implementation.
 *
 * The outbound guard is installed BEFORE the container is built, so a call
 * that escapes either mechanism fails the boot rather than quietly working.
 *
 * The full table is `docs/architecture/cross-mode-golden-path.md`.
 */

export const CROSS_MODE_API_KEY = "replay-cross-mode-key";
/** apiAuth mints `api-key:<key>` as the principal (see @utils/apiKeyUser). */
export const CROSS_MODE_USER_ID = `api-key:${CROSS_MODE_API_KEY}`;

/** Deleted before the container is built: no live LLM client can exist. */
const LLM_ENV_KEYS = [
  "OPENAI_API_KEY",
  "GROQ_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
] as const;

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

export interface ApiResponse {
  status: number;
  json: Record<string, unknown>;
}

export interface CrossModeHarness {
  readonly baseUrl: string;
  readonly container: DIContainer;
  readonly guard: OutboundGuard;
  readonly sessions: InMemorySessionStore;
  readonly jobs: InMemoryVideoJobStore;
  readonly videoProvider: ControlledVideoProvider;
  readonly refunds: RefundWitness;
  readonly studioProjects: InMemoryStudioProjectStore;
  readonly storage: InMemoryStorageService;
  readonly images: InMemoryImageAssetStore;
  post(path: string, body: unknown): Promise<ApiResponse>;
  patch(path: string, body: unknown): Promise<ApiResponse>;
  get(path: string): Promise<ApiResponse>;
  /** The raw text of an NDJSON route, line by line. */
  postNdjson(path: string, body: unknown): Promise<string[]>;
  close(): Promise<void>;
}

export async function startCrossModeHarness(): Promise<CrossModeHarness> {
  const envBackup = new Map<string, string | undefined>();
  const setEnv = (key: string, value: string | undefined): void => {
    if (!envBackup.has(key)) envBackup.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };

  setEnv("NODE_ENV", "test");
  setEnv("PORT", "0");
  setEnv("REPLAY_MODE", "replay");
  setEnv("ALLOWED_API_KEYS", CROSS_MODE_API_KEY);
  setEnv("API_KEY", undefined);
  setEnv("ENABLE_STUDIO", "true");
  // Both of these gate a surface into existence, and neither is a live call
  // under REPLAY_MODE=replay: the studio image runner and the sketch relay's
  // upstream are both wrapped by seams. The guard, not a missing key, is what
  // proves nothing reached the network.
  setEnv("REPLICATE_API_TOKEN", "replay-only-not-a-credential");
  setEnv("FAL_KEY", "replay-only-not-a-credential");
  for (const key of LLM_ENV_KEYS) setEnv(key, undefined);
  // Google's application-default credential discovery pings the GCE metadata
  // server when it finds no credentials. Nothing here needs GCP — every
  // Firestore/GCS adapter below is substituted — so the discovery is turned
  // off at its own switch rather than left to be blocked by the guard.
  setEnv("METADATA_SERVER_DETECTION", "none");

  const objects = new InMemoryObjectStore();
  // The provider's own copy of the clip, before the required durable copy
  // moves it into the creator's storage — the same two-step the live pipeline
  // performs, with both steps inside the process.
  objects.put("provider/cross-mode-clip.mp4", {
    buffer: Buffer.from("cross-mode-clip-bytes"),
    contentType: "video/mp4",
  });
  const guard = installOutboundGuard({
    routes: { [OBJECT_STORE_HOST]: objects.serve },
  });

  // Dynamic imports: ModelConfig and friends snapshot env at module load, so
  // nothing server-side may be imported before the env above is in place.
  const { configureServices, initializeServices } = await import(
    "@config/services.config"
  );
  const { createApp } = await import("@server/app");
  const { startServer } = await import("@server/server");

  const container = await configureServices();

  const sessions = new InMemorySessionStore();
  const idempotency = new InMemoryIdempotencyService();
  const jobs = new InMemoryVideoJobStore();
  const videoProvider = new ControlledVideoProvider(CROSS_MODE_CLIP);
  const refunds = new RefundWitness();
  const studioProjects = new InMemoryStudioProjectStore();
  // Deterministic, order-independent object ids: a studio turn's request key
  // embeds its project images' storage paths, and those images are stored in
  // parallel — so a content-addressed id is what keeps the cassette
  // reproducible across runs (see `ObjectIdMint`). The default fresh ids are
  // what the storage-adapter conformance suite (#138) checks instead.
  const storage = new InMemoryStorageService(objects, contentAddressedObjectId);
  const images = new InMemoryImageAssetStore(objects);
  const config = container.resolve<{
    fal: { sketchDailyCapCents: number; sketchFrameCostMillicents: number };
  }>("config");

  // Substitution by registration, at the tokens production registers its
  // Firestore/GCS adapters at.
  container.registerValue("sessionStore", sessions);
  container.registerValue("imageAssetStore", images);
  container.registerValue("storageService", storage);
  container.registerValue("requestIdempotencyService", idempotency);
  container.registerValue("videoJobStore", jobs);
  container.registerValue("studioProjectStore", studioProjects);
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

  const headers = {
    "content-type": "application/json",
    "x-api-key": CROSS_MODE_API_KEY,
  };

  return {
    baseUrl,
    container,
    guard,
    sessions,
    jobs,
    videoProvider,
    refunds,
    studioProjects,
    storage,
    images,
    async post(path: string, body: unknown): Promise<ApiResponse> {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      return {
        status: response.status,
        json: (await response.json()) as Record<string, unknown>,
      };
    },
    async patch(path: string, body: unknown): Promise<ApiResponse> {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body),
      });
      return {
        status: response.status,
        json: (await response.json()) as Record<string, unknown>,
      };
    },
    async get(path: string): Promise<ApiResponse> {
      const response = await fetch(`${baseUrl}${path}`, { headers });
      return {
        status: response.status,
        json: (await response.json()) as Record<string, unknown>,
      };
    },
    async postNdjson(path: string, body: unknown): Promise<string[]> {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const text = await response.text();
      return text.split("\n").filter((line) => line.length > 0);
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
