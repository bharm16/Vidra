import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createImageUploadHandler } from "@routes/preview/handlers/imageUpload";
import { SessionService } from "@services/sessions/SessionService";
import type { SessionRecord } from "@services/sessions/types";
import type {
  AdmissionIdempotencyPort,
  AdmissionMediaStore,
} from "@services/admission/admitPictureTake";
import { runSupertestOrSkip } from "./test-helpers/supertestSafeRequest";

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
    markFailed: async (recordId) => {
      const existing = records.get(recordId);
      if (!existing) return;
      records.set(recordId, { ...existing, status: "failed" });
    },
  };
}

function createLegacyStorage() {
  return {
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
  const handler = createImageUploadHandler({
    storageService: legacyStorage as never,
    imageAssetStore: mediaStore,
    sessionService: new SessionService(store as never),
    requestIdempotencyService: createIdempotency() as never,
  });

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

    const res = await runSupertestOrSkip(() =>
      request(harness.app).post("/preview/upload").send({
        sessionId: SESSION_ID,
        promptVersionId: "v1",
        admissionKey: "admit-1",
      }),
    );
    if (!res) return;

    expect(res.status).toBe(201);
    expect(typeof res.body?.data?.generationId).toBe("string");
    expect(res.body?.data?.promptVersionId).toBe("v1");
    expect(res.body?.data?.attachment?.state).toBe("attached");

    const takes = takesIn(harness, "v1");
    expect(takes).toHaveLength(1);
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

  it("binds the take to the words-version the REQUEST named, not to the session's newest version", async () => {
    const harness = createHarness();

    const res = await runSupertestOrSkip(() =>
      request(harness.app).post("/preview/upload").send({
        sessionId: SESSION_ID,
        // v2 exists and is newer; the request says v1 and that is what binds.
        promptVersionId: "v1",
        admissionKey: "admit-version",
      }),
    );
    if (!res) return;

    expect(res.status).toBe(201);
    expect(takesIn(harness, "v1")).toHaveLength(1);
    expect(takesIn(harness, "v2")).toHaveLength(0);
  });

  it("returns the same take on a retry with the same admission key", async () => {
    const harness = createHarness();

    const send = () =>
      runSupertestOrSkip(() =>
        request(harness.app).post("/preview/upload").send({
          sessionId: SESSION_ID,
          promptVersionId: "v1",
          admissionKey: "admit-retry",
        }),
      );

    const first = await send();
    const second = await send();
    if (!first || !second) return;

    expect(second.body?.data?.generationId).toBe(
      first.body?.data?.generationId,
    );
    expect(takesIn(harness, "v1")).toHaveLength(1);
    expect(harness.mediaStore.calls).toBe(1);
  });

  it("refuses an admission into a session the creator does not own, and stores nothing", async () => {
    const harness = createHarness("someone-else");

    const res = await runSupertestOrSkip(() =>
      request(harness.app).post("/preview/upload").send({
        sessionId: SESSION_ID,
        promptVersionId: "v1",
        admissionKey: "admit-intruder",
      }),
    );
    if (!res) return;

    expect(res.status).toBe(404);
    expect(harness.mediaStore.calls).toBe(0);
    expect(harness.store.mutate).not.toHaveBeenCalled();
  });

  it("rejects a half-named admission rather than silently falling back to a reference image", async () => {
    const harness = createHarness();

    const res = await runSupertestOrSkip(() =>
      request(harness.app)
        .post("/preview/upload")
        .send({ sessionId: SESSION_ID }),
    );
    if (!res) return;

    expect(res.status).toBe(400);
    expect(harness.mediaStore.calls).toBe(0);
    expect(harness.legacyStorage.uploadBuffer).not.toHaveBeenCalled();
  });

  it("keeps today's behaviour for a reference image that names no destination", async () => {
    const harness = createHarness();

    const res = await runSupertestOrSkip(() =>
      request(harness.app).post("/preview/upload").send({ source: "sidebar" }),
    );
    if (!res) return;

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
