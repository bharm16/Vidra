import { asyncHandler } from "@middleware/asyncHandler";
import { createOwnedPictureResolver } from "@services/owned-media";
import { createPendingReferenceAdmissionHandler } from "@routes/preview/handlers/pendingReferenceAdmission";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createImageUploadHandler } from "@routes/preview/handlers/imageUpload";
import { SessionService } from "@services/sessions/SessionService";
import type { SessionRecord } from "@services/sessions/types";
import type {
  AdmissionIdempotencyPort,
  AdmissionMediaStore,
} from "@services/admission/admitPictureTake";
import { runSupertestRequest } from "./test-helpers/supertestRequest";

/**
 * Uploading a first frame INSIDE a session admits it as a take — issue #86,
 * ADR-0022 decisions 1 and 2.
 *
 * Before this, an uploaded first frame was a `keyframes[]` entry on the session
 * prompt: no take identity, no node in the space, and a clip animated from it
 * carried no ancestor. The route now has two paths, and the shape of the
 * request chooses between them:
 *
 *  - names a session + words-version + admission key → a picture take with
 *    origin `upload`, durable bytes, and a server-assigned identity;
 *  - names none of them → the pre-ADR reference-image behaviour, unchanged.
 *
 * That second case is load-bearing: reference images that are not the first
 * frame must keep working exactly as they did, so it is pinned here rather
 * than left to inference.
 *
 * Seam: a real Express app over the real handler and the real `SessionService`.
 * The doubles are GCS (`imageAssetStore`), Firestore (the session store and the
 * idempotency store) and the legacy storage service — process-external, every
 * one. No `vi.mock`.
 */

const OWNER = "user-1";
const SESSION_ID = "session-1";

// A real 1×1 PNG: the handler sniffs the magic bytes before it stores anything.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function sessionRecord(): SessionRecord {
  return {
    id: SESSION_ID,
    userId: OWNER,
    status: "active",
    createdAt: new Date("2026-09-17T00:00:00.000Z"),
    updatedAt: new Date("2026-09-17T00:00:00.000Z"),
    hasContinuity: false,
    prompt: {
      input: "a runner",
      output: "a runner on a rain-slicked street",
      versions: [
        {
          versionId: "v1",
          signature: "sig-1",
          prompt: "a runner on a rain-slicked street",
          timestamp: "2026-09-17T00:00:00.000Z",
        },
        {
          versionId: "v2",
          signature: "sig-2",
          prompt: "a runner at dawn",
          timestamp: "2026-09-17T00:01:00.000Z",
        },
      ],
    },
  };
}

function createSessionStore() {
  let current = sessionRecord();
  return {
    current: (): SessionRecord => current,
    get: vi.fn(async () => current),
    save: vi.fn(async (next: SessionRecord) => {
      current = next;
    }),
    mutate: vi.fn(
      async (
        _sessionId: string,
        mutator: (record: SessionRecord) => SessionRecord,
      ): Promise<SessionRecord> => {
        current = mutator(current);
        return current;
      },
    ),
    delete: vi.fn(),
    findByPromptUuid: vi.fn(async () => null),
  };
}

function createMediaStore(): AdmissionMediaStore & { calls: number } {
  const store = {
    calls: 0,
    storeFromBuffer: async (
      _buffer: Buffer,
      _contentType: string,
      userId: string,
    ) => {
      store.calls += 1;
      return {
        id: `asset-${store.calls}`,
        storagePath: `image-previews/${userId}/asset-${store.calls}`,
        url: `https://storage.example.com/asset-${store.calls}`,
      };
    },
  };
  return store;
}

function createIdempotency(): AdmissionIdempotencyPort {
  const records = new Map<
    string,
    {
      payloadHash: string;
      status: "pending" | "completed" | "failed";
      snapshot?: { statusCode: number; body: Record<string, unknown> };
    }
  >();
  return {
    claimRequest: async ({ userId, route, key, payload }) => {
      const recordId = `${userId}|${route}|${key}`;
      const payloadHash = JSON.stringify(payload);
      const existing = records.get(recordId);
      if (!existing) {
        records.set(recordId, { payloadHash, status: "pending" });
        return { state: "claimed", recordId };
      }
      if (existing.payloadHash !== payloadHash)
        return { state: "conflict", recordId };
      if (existing.status === "completed" && existing.snapshot)
        return { state: "replay", recordId, snapshot: existing.snapshot };
      return { state: "in_progress", recordId };
    },
    markCompleted: async ({ recordId, snapshot }) => {
      const existing = records.get(recordId);
      if (!existing) return;
      records.set(recordId, { ...existing, status: "completed", snapshot });
    },
    getResponseReceipt: async ({ userId, route, key }) => {
      const recordId = `${userId}|${route}|${key}`;
      const snapshot = records.get(recordId)?.snapshot;
      return snapshot ? { recordId, snapshot } : null;
    },
    markFailed: async (recordId) => {
      const existing = records.get(recordId);
      if (!existing) return;
      records.set(recordId, { ...existing, status: "failed" });
    },
  };
}

function createLegacyStorage() {
  return {
    getViewUrl: vi.fn(async () => ({
      viewUrl: "https://storage.googleapis.com/reference.png",
    })),
    uploadBuffer: vi.fn(async () => ({
      storagePath: "generations/user-1/legacy.png",
      viewUrl: "https://storage.example.com/legacy.png",
      expiresAt: "2026-09-18T00:00:00.000Z",
      sizeBytes: PNG.length,
      contentType: "image/png",
    })),
  };
}

interface Harness {
  app: express.Express;
  store: ReturnType<typeof createSessionStore>;
  mediaStore: ReturnType<typeof createMediaStore>;
  legacyStorage: ReturnType<typeof createLegacyStorage>;
}

function createHarness(userId: string = OWNER): Harness {
  const store = createSessionStore();
  const mediaStore = createMediaStore();
  const legacyStorage = createLegacyStorage();
  const services = {
    storageService: legacyStorage as never,
    imageAssetStore: mediaStore,
    ownedPictureResolver: createOwnedPictureResolver({
      imageAssets: {
        getPublicUrl: async () => "https://storage.example.com/fresh-take",
      },
      userStorage: legacyStorage as never,
    }),
    sessionService: new SessionService(store as never),
    requestIdempotencyService: createIdempotency() as never,
  };
  const handler = createImageUploadHandler(services);

  const app = express();
  app.use((req, _res, next) => {
    const r = req as express.Request & {
      user?: { uid?: string };
      file?: Express.Multer.File;
    };
    r.user = { uid: userId };
    // Stands in for multer: `readUploadBuffer` prefers `file.buffer`, so the
    // handler runs against real bytes without touching disk.
    r.file = {
      mimetype: "image/png",
      originalname: "frame.png",
      buffer: PNG,
    } as Express.Multer.File;
    next();
  });
  app.use(express.json());
  app.post("/preview/upload", handler);
  app.post(
    "/preview/upload/admit-reference",
    asyncHandler(createPendingReferenceAdmissionHandler(services)),
  );

  return { app, store, mediaStore, legacyStorage };
}

function takesIn(harness: Harness, versionId: string) {
  return (
    harness.store
      .current()
      .prompt?.versions?.find((entry) => entry.versionId === versionId)
      ?.generations ?? []
  );
}

describe("POST /preview/upload — first-frame admission (issue #86)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("admits an uploaded first frame as a picture take under the named words-version", async () => {
    const harness = createHarness();

    const res = await runSupertestRequest(() =>
      request(harness.app).post("/preview/upload").send({
        sessionId: SESSION_ID,
        promptVersionId: "v1",
        admissionKey: "admit-1",
      }),
    );

    expect(res.status).toBe(201);
    expect(typeof res.body?.data?.generationId).toBe("string");
    expect(res.body?.data?.promptVersionId).toBe("v1");
    expect(res.body?.data?.attachment?.state).toBe("attached");

    const takes = takesIn(harness, "v1");
    expect(takes).toHaveLength(1);
    expect(takesIn(harness, "v2")).toHaveLength(0);
    const record = takes[0] as Record<string, unknown>;
    expect(record.id).toBe(res.body.data.generationId);
    expect(record.origin).toBe("upload");
    expect(record.mediaType).toBe("image");
    expect(record.productionProvenance).toEqual({ state: "unknown" });
    expect(record.ancestorGenerationId).toBeNull();
    // Durable under the creator's own storage, not only an expiring URL.
    expect(record.storagePath).toBe(`image-previews/${OWNER}/asset-1`);
    expect(record.mediaAssetIds).toEqual(["asset-1"]);
    // The legacy reference-image path was not taken.
    expect(harness.legacyStorage.uploadBuffer).not.toHaveBeenCalled();
  });

  it("returns the same take on a retry with the same admission key", async () => {
    const harness = createHarness();

    const send = () =>
      runSupertestRequest(() =>
        request(harness.app).post("/preview/upload").send({
          sessionId: SESSION_ID,
          promptVersionId: "v1",
          admissionKey: "admit-retry",
        }),
      );

    const first = await send();
    const second = await send();

    expect(second.body?.data?.generationId).toBe(
      first.body?.data?.generationId,
    );
    expect(takesIn(harness, "v1")).toHaveLength(1);
    expect(harness.mediaStore.calls).toBe(1);
  });

  it("refuses an admission into a session the creator does not own, and stores nothing", async () => {
    const harness = createHarness("someone-else");

    const res = await runSupertestRequest(() =>
      request(harness.app).post("/preview/upload").send({
        sessionId: SESSION_ID,
        promptVersionId: "v1",
        admissionKey: "admit-intruder",
      }),
    );

    expect(res.status).toBe(404);
    expect(harness.mediaStore.calls).toBe(0);
    expect(harness.store.mutate).not.toHaveBeenCalled();
  });

  it("rejects a half-named admission rather than silently falling back to a reference image", async () => {
    const harness = createHarness();

    const res = await runSupertestRequest(() =>
      request(harness.app)
        .post("/preview/upload")
        .send({ sessionId: SESSION_ID }),
    );

    expect(res.status).toBe(400);
    expect(harness.mediaStore.calls).toBe(0);
    expect(harness.legacyStorage.uploadBuffer).not.toHaveBeenCalled();
  });

  it("keeps today's behaviour for a reference image that names no destination", async () => {
    const harness = createHarness();

    const res = await runSupertestRequest(() =>
      request(harness.app).post("/preview/upload").send({ source: "sidebar" }),
    );

    expect(res.status).toBe(201);
    expect(res.body?.data?.imageUrl).toBe(
      "https://storage.example.com/legacy.png",
    );
    // No take identity, no admission, no session write.
    expect(res.body?.data?.generationId).toBeUndefined();
    expect(res.body?.data?.attachment).toBeUndefined();
    expect(harness.mediaStore.calls).toBe(0);
    expect(harness.store.mutate).not.toHaveBeenCalled();
    expect(harness.legacyStorage.uploadBuffer).toHaveBeenCalledTimes(1);
  });
});

describe("pending reference admission (issue #119)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const input = {
    storagePath: "users/user-1/previews/images/reference.png",
    sessionId: SESSION_ID,
    promptVersionId: "v1",
    admissionKey: "reference-1",
  };
  it("refuses a sign-in change between file choice and pending upload before storing the file", async () => {
    const harness = createHarness("other");
    const result = await request(harness.app)
      .post("/preview/upload")
      .send({
        source: "pending-first-frame",
        metadata: { expectedCreatorId: OWNER },
      });
    expect(result.status).toBe(409);
    expect(harness.legacyStorage.uploadBuffer).not.toHaveBeenCalled();
    expect(harness.mediaStore.calls).toBe(0);
  });
  it("copies owned reference bytes into one take after explicit words association; retry replays", async () => {
    const harness = createHarness();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new Uint8Array(PNG), {
            headers: { "content-type": "image/png" },
          }),
      ),
    );
    const first = await request(harness.app)
      .post("/preview/upload/admit-reference")
      .send(input);
    const replay = await request(harness.app)
      .post("/preview/upload/admit-reference")
      .send(input);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(first.body.data.generationId).toBe(replay.body.data.generationId);
    expect(harness.mediaStore.calls).toBe(1);
    expect(takesIn(harness, "v1")).toHaveLength(1);
    expect(takesIn(harness, "v1")[0]).toMatchObject({
      prompt: "a runner on a rain-slicked street",
      origin: "upload",
      productionProvenance: { state: "unknown" },
    });
    expect(harness.legacyStorage.uploadBuffer).not.toHaveBeenCalled();
  });
  it("resumes a lost-response receipt without the staging image or current words, reminting the take URL", async () => {
    const harness = createHarness();
    const fetch = vi.fn(
      async () =>
        new Response(new Uint8Array(PNG), {
          headers: { "content-type": "image/png" },
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const first = await request(harness.app)
      .post("/preview/upload/admit-reference")
      .send(input);
    expect(first.status).toBe(201);
    await harness.store.mutate(SESSION_ID, (session) => ({
      ...session,
      prompt: { input: "", output: "", versions: [] },
    }));
    harness.legacyStorage.getViewUrl.mockRejectedValueOnce(
      new Error("staging object removed"),
    );
    const replay = await request(harness.app)
      .post("/preview/upload/admit-reference")
      .send(input);
    expect(replay.status).toBe(201);
    expect(replay.body.data.generationId).toBe(first.body.data.generationId);
    expect(replay.body.data.imageUrl).toBe(
      "https://storage.example.com/fresh-take",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(harness.legacyStorage.getViewUrl).toHaveBeenCalledTimes(1);
    expect(harness.mediaStore.calls).toBe(1);
  });
  it("repairs a failed attachment from its receipt with the same take after staging media disappears", async () => {
    const harness = createHarness();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new Uint8Array(PNG), {
            headers: { "content-type": "image/png" },
          }),
      ),
    );
    harness.store.mutate.mockRejectedValueOnce(
      new Error("Firestore unavailable"),
    );
    const failed = await request(harness.app)
      .post("/preview/upload/admit-reference")
      .send(input);
    expect(failed.status).toBe(201);
    expect(failed.body.data.attachment.state).toBe("failed");
    expect(failed.body.data.generationId).toBeUndefined();
    harness.legacyStorage.getViewUrl.mockRejectedValueOnce(
      new Error("staging removed"),
    );
    const repaired = await request(harness.app)
      .post("/preview/upload/admit-reference")
      .send(input);
    expect(repaired.status).toBe(201);
    expect(repaired.body.data.attachment.state).toBe("attached");
    expect(repaired.body.data.generationId).toBe(
      failed.body.data.attachment.generationId,
    );
    expect(harness.mediaStore.calls).toBe(1);
    expect(harness.legacyStorage.getViewUrl).toHaveBeenCalledTimes(1);
    expect(takesIn(harness, "v1")).toHaveLength(1);
  });
  it("does not treat the admitted copy as the original pending reference under the same key", async () => {
    const harness = createHarness();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new Uint8Array(PNG), {
            headers: { "content-type": "image/png" },
          }),
      ),
    );
    const first = await request(harness.app)
      .post("/preview/upload/admit-reference")
      .send(input);
    expect(first.status).toBe(201);
    const differentSource = await request(harness.app)
      .post("/preview/upload/admit-reference")
      .send({ ...input, storagePath: first.body.data.storagePath });
    expect(differentSource.status).toBe(404);
    expect(harness.mediaStore.calls).toBe(1);
    expect(harness.legacyStorage.getViewUrl).toHaveBeenCalledTimes(1);
  });
  it.each([
    { storagePath: "users/user-1/previews/images/another.png" },
    { promptVersionId: "v2" },
    { sessionId: "session-other" },
  ])(
    "rejects a receipt reused with different original source/destination (%j)",
    async (change) => {
      const harness = createHarness();
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(new Uint8Array(PNG), {
              headers: { "content-type": "image/png" },
            }),
        ),
      );
      expect(
        (
          await request(harness.app)
            .post("/preview/upload/admit-reference")
            .send(input)
        ).status,
      ).toBe(201);
      const conflict = await request(harness.app)
        .post("/preview/upload/admit-reference")
        .send({ ...input, ...change });
      expect(conflict.status).toBe(409);
      expect(harness.mediaStore.calls).toBe(1);
      expect(harness.legacyStorage.getViewUrl).toHaveBeenCalledTimes(1);
    },
  );
  it("rejects another creator's reference before signing, reading or storing it", async () => {
    const harness = createHarness();
    const result = await request(harness.app)
      .post("/preview/upload/admit-reference")
      .send({
        ...input,
        storagePath: "users/other/previews/images/reference.png",
      });
    expect(result.status).toBe(404);
    expect(harness.legacyStorage.getViewUrl).not.toHaveBeenCalled();
    expect(harness.mediaStore.calls).toBe(0);
    expect(harness.store.mutate).not.toHaveBeenCalled();
  });
  it("rejects another creator's destination even when the reference is owned", async () => {
    // The request creator is "other"; the destination session belongs to OWNER.
    const harness = createHarness("other");
    const result = await request(harness.app)
      .post("/preview/upload/admit-reference")
      .send({
        ...input,
        storagePath: "users/other/previews/images/reference.png",
      });
    expect(result.status).toBe(404);
    expect(harness.legacyStorage.getViewUrl).not.toHaveBeenCalled();
    expect(harness.mediaStore.calls).toBe(0);
  });
  it.each([undefined, "missing", "v1"])(
    "keeps the reference unadmitted when associated words do not resolve (%s)",
    async (promptVersionId) => {
      const harness = createHarness();
      if (promptVersionId === "v1") {
        await harness.store.mutate(SESSION_ID, (session) => ({
          ...session,
          prompt: {
            input: session.prompt?.input ?? "",
            output: session.prompt?.output ?? "",
            ...session.prompt,
            versions: [
              {
                versionId: "v1",
                signature: "empty",
                prompt: "  ",
                timestamp: new Date().toISOString(),
              },
            ],
          },
        }));
      }
      const result = await request(harness.app)
        .post("/preview/upload/admit-reference")
        .send({ ...input, promptVersionId });
      expect(result.status).toBe(promptVersionId ? 409 : 400);
      expect(harness.legacyStorage.getViewUrl).not.toHaveBeenCalled();
      expect(harness.mediaStore.calls).toBe(0);
      expect(takesIn(harness, "v1")).toHaveLength(0);
    },
  );
});
