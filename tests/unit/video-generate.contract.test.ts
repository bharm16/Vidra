import { registerPreviewRoutes } from "@config/routes/preview.registration";
import { DIContainer } from "@infrastructure/DIContainer";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asyncHandler } from "@middleware/asyncHandler";
import { createVideoGenerateHandler } from "@routes/preview/handlers/videoGenerate";
import { createImageGenerateHandler } from "@routes/preview/handlers/imageGenerate";
import { VideoJobStore } from "@services/video-generation/runtime/VideoJobStore";
import { RequestIdempotencyService } from "@services/admission/idempotency/RequestIdempotencyService";
import { FirestoreCircuitExecutor } from "@services/firestore/FirestoreCircuitExecutor";
import { SessionService } from "@services/sessions/SessionService";
import { InMemorySessionStore } from "../integration/helpers/cross-mode/boundaryDoubles";
import type { SessionRecord } from "@services/sessions/types";
import type { PreviewRoutesServices } from "@routes/types";

// The only module double is Firebase Admin, a process-external boundary. The
// real HTTP handler, idempotency adapter, job adapter and session service run.
const external = vi.hoisted(() => ({ firestore: undefined as unknown }));
vi.mock("@infrastructure/firebaseAdmin", () => ({
  getFirestore: () => external.firestore,
  getAuth: () => ({
    verifyIdToken: async (): Promise<{ uid: string }> => ({ uid: "creator-a" }),
  }),
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: () => Date.now(),
        delete: () => undefined,
      },
    },
  },
}));

type Data = Record<string, unknown>;
interface Ref {
  id: string;
  path: string;
  get: () => Promise<Snapshot>;
  set: (data: Data, options?: { merge: boolean }) => Promise<void>;
}
interface Snapshot {
  exists: boolean;
  data: () => Data | undefined;
}
interface Transaction {
  get: (ref: Ref) => Promise<Snapshot>;
  set: (ref: Ref, data: Data, options?: { merge: boolean }) => void;
  update: (ref: Ref, data: Data) => void;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}
class MemoryFirestore {
  readonly docs = new Map<string, Data>();
  private readonly revisions = new Map<string, number>();
  private nextId = 0;
  failPublication = false;
  ambiguousPublication = false;
  pausePublication: { entered: () => void; release: Promise<void> } | null =
    null;
  collection(name: string): { doc: (id?: string) => Ref } {
    return { doc: (id) => this.ref(`${name}/${id ?? `job-${++this.nextId}`}`) };
  }
  private ref(path: string): Ref {
    return {
      path,
      id: path.split("/").at(-1)!,
      get: async (): Promise<Snapshot> => this.snapshot(path),
      set: async (data, options): Promise<void> => {
        this.write(path, data, options?.merge ?? false);
      },
    };
  }
  private snapshot(path: string): Snapshot {
    const value = this.docs.get(path);
    return {
      exists: value !== undefined,
      data: () => (value ? structuredClone(value) : undefined),
    };
  }
  private write(path: string, data: Data, merge: boolean): void {
    this.docs.set(
      path,
      structuredClone(merge ? { ...this.docs.get(path), ...data } : data),
    );
    this.revisions.set(path, (this.revisions.get(path) ?? 0) + 1);
  }
  async runTransaction<T>(
    callback: (transaction: Transaction) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const reads = new Map<string, number>();
      const writes: Array<{ ref: Ref; data: Data; merge: boolean }> = [];
      const result = await callback({
        get: async (ref): Promise<Snapshot> => {
          reads.set(ref.path, this.revisions.get(ref.path) ?? 0);
          return this.snapshot(ref.path);
        },
        set: (ref, data, options): void => {
          writes.push({ ref, data, merge: options?.merge ?? false });
        },
        update: (ref, data): void => {
          writes.push({ ref, data, merge: true });
        },
      });
      const publishesJob = writes.some(
        (write) =>
          write.ref.path.startsWith("video_jobs/") &&
          write.data.status === "queued",
      );
      if (publishesJob && this.pausePublication) {
        const pause = this.pausePublication;
        this.pausePublication = null;
        pause.entered();
        await pause.release;
      }
      if (
        [...reads].some(
          ([path, revision]) => (this.revisions.get(path) ?? 0) !== revision,
        )
      )
        continue;
      if (publishesJob && this.failPublication)
        throw new Error("Publication denied");
      for (const write of writes)
        this.write(write.ref.path, write.data, write.merge);
      if (publishesJob && this.ambiguousPublication) {
        this.ambiguousPublication = false;
        throw new Error("Commit response lost");
      }
      return result;
    }
    throw new Error("Concurrent transaction could not settle");
  }
  jobs(): Data[] {
    return [...this.docs]
      .filter(([path]) => path.startsWith("video_jobs/"))
      .map(([, data]) => data);
  }
}
const MODEL = "google/veo-3";
const OWNER = "creator-a";
const KEY = "free-intake-1";
let scheduled: Array<() => void>;
let failScheduling: boolean;
let db: MemoryFirestore;

async function harness(): Promise<{
  app: express.Express;
  jobs: VideoJobStore;
  receipts: RequestIdempotencyService;
  credits: {
    reserveCredits: ReturnType<typeof vi.fn>;
    refundCredits: ReturnType<typeof vi.fn>;
    getBalance: ReturnType<typeof vi.fn>;
  };
  generateVideo: ReturnType<typeof vi.fn>;
  generatePicture: ReturnType<typeof vi.fn>;
  services: PreviewRoutesServices;
}> {
  const executor = new FirestoreCircuitExecutor({
    maxRetries: 0,
    volumeThreshold: 1000,
  });
  const jobs = new VideoJobStore(executor);
  const receipts = new RequestIdempotencyService(executor);
  const sessions = new InMemorySessionStore();
  await sessions.save({
    id: "session-a",
    userId: OWNER,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    hasContinuity: false,
    prompt: {
      input: "A city",
      output: "A city",
      versions: [
        {
          versionId: "v1",
          signature: "s1",
          prompt: "A city",
          timestamp: new Date().toISOString(),
          generations: [],
        },
      ],
    },
  } satisfies SessionRecord);
  const credits = {
    reserveCredits: vi.fn(async () => false),
    refundCredits: vi.fn(async () => {
      throw new Error("No credits may be refunded in free validation");
    }),
    getBalance: vi.fn(async () => 0),
  };
  const generateVideo = vi.fn(async () => ({
    videoUrl: "https://cdn.example.com/clip.mp4",
    assetId: "clip-a",
    contentType: "video/mp4",
    status: "completed",
    inputMode: "t2v",
  }));
  const generatePicture = vi.fn(async () => ({
    imageUrl: "https://cdn.example.com/picture.png",
    metadata: {
      model: "flux-schnell",
      aspectRatio: "1:1",
      duration: 1,
      generatedAt: new Date().toISOString(),
    },
  }));
  const services = {
    videoJobStore: jobs,
    requestIdempotencyService: receipts,
    userCreditService: credits as never,
    videoGenerationService: {
      getModelAvailability: () => ({ available: true, resolvedModelId: MODEL }),
      getAvailabilitySnapshot: () => ({
        availableModelIds: [MODEL],
        unavailableModels: [],
      }),
      generateVideo,
    } as never,
    imageGenerationService: {
      generatePreview: generatePicture,
      getImageUrl: async (): Promise<string> =>
        "https://cdn.example.com/owned-image.png",
    } as never,
    sessionService: new SessionService(sessions as never),
    storageService: {
      saveFromUrl: async (uid: string, _url: string, kind: string) => ({
        storagePath: `users/${uid}/${kind}/asset`,
        viewUrl: "https://storage.example.com/media",
        expiresAt: "2099-01-01T00:00:00Z",
        sizeBytes: 10,
      }),
    } as never,
  } satisfies PreviewRoutesServices;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const uid = req.get("X-Test-User");
    if (uid)
      (req as express.Request & { user?: { uid: string } }).user = { uid };
    next();
  });
  app.post("/video", asyncHandler(createVideoGenerateHandler(services)));
  app.post("/picture", asyncHandler(createImageGenerateHandler(services)));
  return {
    app,
    jobs,
    receipts,
    credits,
    generateVideo,
    generatePicture,
    services,
  };
}
function clip(app: express.Express, body: Data = {}, user = OWNER, key = KEY) {
  return request(app)
    .post("/video")
    .set("X-Test-User", user)
    .set("Idempotency-Key", key)
    .send({ prompt: "A city at night", model: MODEL, ...body });
}
beforeEach(() => {
  db = new MemoryFirestore();
  external.firestore = db;
  scheduled = [];
  failScheduling = false;
  const timer = globalThis.setTimeout.bind(globalThis);
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((
    callback: () => void,
    timeout?: number,
    ...args: unknown[]
  ) => {
    if (timeout === 300) {
      if (failScheduling) throw new Error("Scheduling unavailable");
      scheduled.push(callback);
      return timer(() => {}, 0);
    }
    return timer(callback, timeout, ...args);
  }) as typeof setTimeout);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("free generation HTTP intake (#124, ADR-0023)", () => {
  it("registration keeps active POSTs and all GETs free/read-only when legacy credit grant throws", async () => {
    const h = await harness();
    const ensureStarterGrant = vi.fn(async (): Promise<never> => {
      throw new Error("Credit store unavailable");
    });
    const container = new DIContainer();
    const values: Record<string, unknown> = {
      imageGenerationService: h.services.imageGenerationService,
      videoGenerationService: h.services.videoGenerationService,
      videoJobStore: h.jobs,
      requestIdempotencyService: h.receipts,
      userCreditService: { ...h.credits, ensureStarterGrant },
      sessionService: h.services.sessionService,
      storageService: h.services.storageService,
      videoContentAccessService: null,
      imageAssetStore: {
        getPublicUrl: async (): Promise<string> =>
          "https://cdn.example.com/image.png",
      },
      owedTakeAttachmentStore: null,
    };
    for (const [name, value] of Object.entries(values))
      container.registerValue(name, value);
    const app = express();
    app.use(express.json());
    registerPreviewRoutes(app, container);
    // Availability is registered separately in the application; the shared
    // preview mount must pass through without minting any starter grant.
    app.get("/api/preview/available", (_req, res) => {
      res.json({ success: true });
    });
    const auth = { Authorization: "Bearer external-auth-fixture" };
    const accepted = await request(app)
      .post("/api/preview/video/generate")
      .set(auth)
      .set("Idempotency-Key", "registered-video")
      .send({ prompt: "A city", model: MODEL });
    expect(accepted.status).toBe(202);
    expect(
      (
        await request(app)
          .post("/api/preview/generate")
          .set(auth)
          .set("Idempotency-Key", "registered-picture")
          .send({ prompt: "A city" })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .get(`/api/preview/video/jobs/${accepted.body.jobId}`)
          .set(auth)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .get("/api/preview/image/view?assetId=owned")
          .set(auth)
      ).status,
    ).toBe(200);
    expect(
      (await request(app).get("/api/preview/available").set(auth)).status,
    ).toBe(200);
    expect(ensureStarterGrant).not.toHaveBeenCalled();
    expect((await request(app).get("/api/preview/available")).status).toBe(401);
    for (const path of [
      "/api/preview/face-swap",
      "/api/preview/generate/storyboard",
    ]) {
      const retired = await request(app).post(path).set(auth).send({});
      expect(retired.status).toBe(404);
    }
    expect(ensureStarterGrant).not.toHaveBeenCalled();
  });
  it("accepts signed-in clip and picture requests with zero balance and never uses credit ports", async () => {
    const h = await harness();
    const video = await clip(h.app);
    const picture = await request(h.app)
      .post("/picture")
      .set("X-Test-User", OWNER)
      .set("Idempotency-Key", "picture-1")
      .send({ prompt: "A city" });
    expect(video.status).toBe(202);
    expect(picture.status).toBe(200);
    expect(db.jobs()).toHaveLength(1);
    expect(db.jobs()[0]?.creditsReserved).toBe(0);
    expect(video.body).not.toHaveProperty("creditsDeducted");
    expect(video.body).not.toHaveProperty("remainingCredits");
    expect(h.credits.reserveCredits).not.toHaveBeenCalled();
    expect(h.credits.refundCredits).not.toHaveBeenCalled();
    expect(h.credits.getBalance).not.toHaveBeenCalled();
  });
  it("runs an accepted free job through the real inline worker without credit/refund operations", async () => {
    const h = await harness();
    const accepted = await clip(h.app);
    expect(accepted.status).toBe(202);
    scheduled[0]!();
    await expect
      .poll(async () => (await h.jobs.getJob(accepted.body.jobId))?.status)
      .toBe("completed");
    expect(h.generateVideo).toHaveBeenCalledTimes(1);
    expect(h.credits.reserveCredits).not.toHaveBeenCalled();
    expect(h.credits.refundCredits).not.toHaveBeenCalled();
  });
  it("keeps terminal provider failure bookkeeping for free jobs without issuing a refund", async () => {
    const h = await harness();
    h.generateVideo.mockRejectedValueOnce(
      new Error("Invalid provider request"),
    );
    const accepted = await clip(h.app);
    scheduled[0]!();
    await expect
      .poll(async () => (await h.jobs.getJob(accepted.body.jobId))?.status)
      .toBe("failed");
    expect(
      [...db.docs.keys()].some((path) => path.startsWith("video_job_dlq/")),
    ).toBe(true);
    expect(h.credits.refundCredits).not.toHaveBeenCalled();
  });
  it("stores the replay receipt atomically before scheduling, and a lost response replays one job", async () => {
    const h = await harness();
    const first = await clip(h.app);
    const replay = await clip(h.app);
    expect(first.status).toBe(202);
    expect(replay.body).toEqual(first.body);
    expect(db.jobs()).toHaveLength(1);
    const receipt = await h.receipts.getResponseSnapshot({
      userId: OWNER,
      route: "/api/preview/video/generate",
      key: KEY,
    });
    expect(receipt?.body).toEqual(first.body);
    expect(scheduled).toHaveLength(1);
  });
  it("failed scheduling preserves the accepted job and completed receipt, without charge or recreation", async () => {
    const h = await harness();
    failScheduling = true;
    const first = await clip(h.app);
    const replay = await clip(h.app);
    expect(first.status).toBe(202);
    expect(replay.body).toEqual(first.body);
    expect(db.jobs()).toHaveLength(1);
    expect(h.credits.refundCredits).not.toHaveBeenCalled();
    expect(h.generateVideo).not.toHaveBeenCalled();
  });
  it("failed publication exposes no job and leaves its claim closed to an immediate duplicate", async () => {
    const h = await harness();
    db.failPublication = true;
    expect((await clip(h.app)).status).toBe(503);
    expect(db.jobs()).toHaveLength(0);
    expect(scheduled).toHaveLength(0);
    expect((await clip(h.app)).status).toBe(409);
    expect(h.generateVideo).not.toHaveBeenCalled();
  });
  it("recovers an ambiguous commit from its authoritative receipt instead of recreating a job", async () => {
    const h = await harness();
    db.ambiguousPublication = true;
    const first = await clip(h.app);
    const replay = await clip(h.app);
    expect(first.status).toBe(202);
    expect(replay.body).toEqual(first.body);
    expect(db.jobs()).toHaveLength(1);
  });
  it("a pending-TTL publication loser preserves the winner's receipt and creates no second job", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
    const h = await harness();
    const entered = deferred<void>();
    const release = deferred<void>();
    db.pausePublication = {
      entered: () => entered.resolve(),
      release: release.promise,
    };
    const first = Promise.resolve(clip(h.app));
    await entered.promise;
    vi.setSystemTime(new Date("2026-10-03T12:07:00Z"));
    const winner = await clip(h.app);
    expect(winner.status).toBe(202);
    release.resolve();
    const loser = await first;
    expect(loser.status).toBe(202);
    expect(loser.body).toEqual(winner.body);
    expect(db.jobs()).toHaveLength(1);
    const receipt = await h.receipts.getResponseReceipt({
      userId: OWNER,
      route: "/api/preview/video/generate",
      key: KEY,
    });
    expect(receipt).not.toBeNull();
    await h.receipts.markFailed(
      receipt!.recordId,
      "late losing callback failure",
    );
    expect((await clip(h.app)).body).toEqual(winner.body);
    expect(db.jobs()).toHaveLength(1);
  });
  it.each(["sora-2", "sora-2-pro", "kling-v2-1-master", "luma-ray3"])(
    "refuses excluded %s before provider or publication even when service reports availability",
    async (model) => {
      const h = await harness();
      expect((await clip(h.app, { model })).status).toBe(400);
      expect(db.jobs()).toHaveLength(0);
      expect(scheduled).toHaveLength(0);
      expect(h.generateVideo).not.toHaveBeenCalled();
    },
  );
  it("requires auth/key and refuses a foreign destination before dispatch", async () => {
    const h = await harness();
    expect(
      (
        await request(h.app)
          .post("/video")
          .send({ prompt: "A city", model: MODEL })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(h.app)
          .post("/video")
          .set("X-Test-User", OWNER)
          .send({ prompt: "A city", model: MODEL })
      ).status,
    ).toBe(400);
    expect(
      (
        await clip(
          h.app,
          { sessionId: "session-a", promptVersionId: "v1" },
          "creator-b",
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(h.app)
          .post("/picture")
          .set("X-Test-User", "creator-b")
          .set("Idempotency-Key", "foreign-picture")
          .send({
            prompt: "A city",
            sessionId: "session-a",
            promptVersionId: "v1",
          })
      ).status,
    ).toBe(404);
    expect(db.jobs()).toHaveLength(0);
    expect(h.generatePicture).not.toHaveBeenCalled();
  });
  it("refuses frozen implicit character preprocessing without reserving credits or scheduling", async () => {
    const h = await harness();
    const response = await clip(h.app, {
      characterAssetId: "character-a",
      autoKeyframe: true,
    });
    expect(response.status).toBe(400);
    expect(scheduled).toHaveLength(0);
    expect(h.credits.reserveCredits).not.toHaveBeenCalled();
  });
});
