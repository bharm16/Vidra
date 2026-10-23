import { describe, it, expect, beforeEach, vi } from "vitest";
import { ShareError } from "../ShareError";
import type { SessionRecord } from "@server/domain/session/types";
import { ShareService } from "../ShareService";
import { apiKeyUid } from "@utils/apiKeyUser";
import { SessionService } from "@services/sessions/SessionService";
import type {
  ShareRecord,
  ShareRecordStore,
  ShareSessionReader,
  ShareUrlResolver,
  ShareJobReader,
  ShareVideoJob,
} from "../types";

class FakeShareStore implements ShareRecordStore {
  records = new Map<string, ShareRecord>();
  async save(record: ShareRecord): Promise<void> {
    this.records.set(record.shareId, record);
  }
  async get(shareId: string): Promise<ShareRecord | null> {
    return this.records.get(shareId) ?? null;
  }
}

const urls: ShareUrlResolver = {
  async getSharedViewUrl(storagePath: string) {
    return { viewUrl: `https://signed.example/${storagePath}`, expiresAt: "" };
  },
};

function sessionWith(
  generation: Record<string, unknown>,
  { userId = "owner", versionId = "v1", versionPrompt = "version words" } = {},
): SessionRecord {
  return {
    id: "s1",
    userId,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    prompt: {
      input: "in",
      output: "out",
      versions: [
        {
          versionId,
          signature: "sig",
          prompt: versionPrompt,
          timestamp: "t",
          generations: [generation],
        },
      ],
    },
  } as SessionRecord;
}

function readerFor(session: SessionRecord | null): ShareSessionReader {
  return {
    async getSession() {
      return session;
    },
  };
}

const REQ = { sessionId: "s1", generationId: "g1" };
const OWNED_PATH = "users/owner/generations/clip.mp4";

describe("ShareService", () => {
  let store: FakeShareStore;
  beforeEach(() => {
    store = new FakeShareStore();
  });

  it("mints a share denormalizing the clip's storage path, description, and model, then resolves a fresh URL", async () => {
    const svc = new ShareService(
      store,
      readerFor(
        sessionWith({
          id: "g1",
          storagePath: OWNED_PATH,
          prompt: "a cat surfing",
          model: "sora-2",
        }),
      ),
      urls,
    );

    const { shareId } = await svc.mint("owner", REQ);
    expect(store.records.get(shareId)).toMatchObject({
      storagePath: OWNED_PATH,
      schemaVersion: "public-clip/v2",
      ownerId: "owner",
      sessionId: "s1",
      generationId: "g1",
      resource: { kind: "owner-path" },
      description: "a cat surfing",
      model: "sora-2",
    });

    const clip = await svc.resolve(shareId);
    expect(clip).toEqual({
      videoUrl: `https://signed.example/${OWNED_PATH}`,
      description: "a cat surfing",
      model: "sora-2",
      createdAt: expect.any(String),
    });
  });

  it("rejects a non-owner with a 404 (indistinguishable from a missing session)", async () => {
    const svc = new ShareService(
      store,
      readerFor(
        sessionWith(
          { id: "g1", storagePath: OWNED_PATH },
          { userId: "someone-else" },
        ),
      ),
      urls,
    );
    const err = await svc.mint("owner", REQ).then(
      () => null,
      (e: unknown) => e as ShareError,
    );
    expect(err).toBeInstanceOf(ShareError);
    expect(err?.code).toBe("SHARE_CLIP_NOT_FOUND");
    expect(err?.getHttpStatus()).toBe(404);
    expect(store.records.size).toBe(0);
  });

  it("rejects an unknown generation id with a 404", async () => {
    const svc = new ShareService(
      store,
      readerFor(sessionWith({ id: "other", storagePath: "x" })),
      urls,
    );
    await expect(svc.mint("owner", REQ)).rejects.toBeInstanceOf(ShareError);
  });

  it("rejects a clip with no storage path (unshareable media) with a 400", async () => {
    const svc = new ShareService(
      store,
      readerFor(sessionWith({ id: "g1", prompt: "no media" })),
      urls,
    );
    const err = await svc.mint("owner", REQ).then(
      () => null,
      (e: unknown) => e as ShareError,
    );
    expect(err).toBeInstanceOf(ShareError);
    expect(err?.code).toBe("SHARE_NO_MEDIA");
    expect(err?.getHttpStatus()).toBe(400);
  });

  it("falls back to the version's words when the generation has no prompt", async () => {
    const svc = new ShareService(
      store,
      readerFor(
        sessionWith(
          { id: "g1", storagePath: OWNED_PATH },
          { versionPrompt: "the version prose" },
        ),
      ),
      urls,
    );
    const { shareId } = await svc.mint("owner", REQ);
    expect(store.records.get(shareId)?.description).toBe("the version prose");
  });

  it("resolves null for an unknown share id", async () => {
    const svc = new ShareService(store, readerFor(null), urls);
    expect(await svc.resolve("nope")).toBeNull();
  });

  it.each(["users/foreign/generations/private.mp4", "users/owner/generations/../foreign/private.mp4", "video-previews/unproven"])("refuses a mutable session claim to unowned or noncanonical media", async storagePath => {
    const sign = vi.fn();
    const service = new ShareService(store, readerFor(sessionWith({ id: "g1", storagePath })), { getSharedViewUrl: sign });
    await expect(service.mint("owner", REQ)).rejects.toMatchObject({ code: "SHARE_CLIP_NOT_FOUND" });
    expect(store.records.size).toBe(0);
    expect(sign).not.toHaveBeenCalled();
  });

  it("refuses foreign media introduced through both session creation and a new take append", async () => {
    const records = new Map<string, SessionRecord>();
    const sessionStore = {
      findByPromptUuid: async () => null,
      save: async (session: SessionRecord) => { records.set(session.id, session); },
      get: async (id: string) => records.get(id) ?? null,
      mutate: async (id: string, update: (current: SessionRecord) => SessionRecord) => {
        const current = records.get(id);
        if (!current) return null;
        const next = update(current); records.set(id, next); return next;
      },
    };
    const sessions = new SessionService(sessionStore as never);
    const created = await sessions.createPromptSession("owner", { prompt: { input: "", output: "", versions: [{ versionId: "v1", signature: "sig", timestamp: "t", prompt: "", generations: [{ id: "forged", storagePath: "users/foreign/generations/private.mp4" }] }] } });
    const sign = vi.fn();
    const service = new ShareService(store, sessions, { getSharedViewUrl: sign });
    await expect(service.mint("owner", { sessionId: created.id, generationId: "forged" })).rejects.toMatchObject({ code: "SHARE_CLIP_NOT_FOUND" });
    await sessions.appendGenerationToVersion("owner", created.id, "v1", { id: "appended", storagePath: "users/foreign/generations/another.mp4" });
    await expect(service.mint("owner", { sessionId: created.id, generationId: "appended" })).rejects.toMatchObject({ code: "SHARE_CLIP_NOT_FOUND" });
    expect(sign).not.toHaveBeenCalled();
  });

  it("rechecks the stored ownership proof and rejects unproven old shares", async () => {
    const sign = vi.fn();
    const service = new ShareService(store, readerFor(sessionWith({ id: "g1", storagePath: OWNED_PATH })), { getSharedViewUrl: sign });
    const { shareId } = await service.mint("owner", REQ);
    const record = store.records.get(shareId)!;
    store.records.set(shareId, { ...record, storagePath: "users/foreign/generations/private.mp4" });
    expect(await service.resolve(shareId)).toBeNull();
    store.records.set(shareId, { shareId, storagePath: OWNED_PATH, description: "old", model: null, createdAt: record.createdAt } as ShareRecord);
    expect(await service.resolve(shareId)).toBeNull();
    expect(sign).not.toHaveBeenCalled();
  });

  it("keeps a proved owned clip independent of later mutable session edits", async () => {
    const session = sessionWith({ id: "g1", storagePath: OWNED_PATH });
    const service = new ShareService(store, readerFor(session), urls);
    const { shareId } = await service.mint("owner", REQ);
    session.prompt!.versions![0]!.generations![0]!.storagePath = "users/foreign/generations/private.mp4";
    expect((await service.resolve(shareId))?.videoUrl).toBe(`https://signed.example/${OWNED_PATH}`);
  });

  it("does not expose raw API keys through new public URLs and refuses legacy identity data", async () => {
    const credential = "configured-test-secret";
    const owner = apiKeyUid(credential);
    const path = `users/${owner}/previews/videos/clip.mp4`;
    const service = new ShareService(store, readerFor(sessionWith({ id: "g1", storagePath: path }, { userId: owner })), urls);
    const { shareId } = await service.mint(owner, REQ);
    expect(JSON.stringify(await service.resolve(shareId))).not.toContain(credential);
    for (const old of [`api-key:${credential}`, `api-key:v1:${"a".repeat(64)}`, "api-key-v1:not-a-principal"]) {
      await expect(service.mint(old, REQ)).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    }
  });
});

describe("authoritative video-job sharing", () => {
  const path = "video-previews/asset-1";
  const job = (): ShareVideoJob => ({ id: "g1", userId: "owner", sessionId: "s1", promptVersionId: "v1", status: "completed", result: { assetId: "asset-1", storagePath: path, videoUrl: "https://preview.test/asset-1", contentType: "video/mp4" } });
  const setup = (record = job(), generationId = "g1") => {
    const store = new FakeShareStore();
    const jobs: ShareJobReader = { getJob: vi.fn(async id => id === record.id ? record : null), findJobByAssetId: vi.fn(async () => record) };
    const sign = vi.fn(async (storagePath: string) => ({ viewUrl: `https://signed.test/${storagePath}`, expiresAt: "" }));
    const service = new ShareService(store, readerFor(sessionWith({ id: generationId, storagePath: path, mediaAssetIds: ["asset-1"] })), { getSharedViewUrl: sign }, jobs);
    return { service, store, jobs, sign };
  };
  it("proves a non-owner-namespaced clip through the completed job and rechecks it on resolve", async () => {
    const { service, store, jobs, sign } = setup();
    const { shareId } = await service.mint("owner", REQ);
    expect(store.records.get(shareId)?.resource).toEqual({ kind: "video-job", jobId: "g1", assetId: "asset-1" });
    expect((await service.resolve(shareId))?.videoUrl).toBe(`https://signed.test/${path}`);
    vi.mocked(jobs.getJob).mockResolvedValueOnce({ ...job(), userId: "foreign" });
    sign.mockClear();
    expect(await service.resolve(shareId)).toBeNull();
    expect(sign).not.toHaveBeenCalled();
  });
  it("supports an older take ID through the authoritative result's asset ID", async () => {
    const { service, jobs } = setup(job(), "legacy-take");
    const { shareId } = await service.mint("owner", { ...REQ, generationId: "legacy-take" });
    expect(jobs.findJobByAssetId).toHaveBeenCalledWith("asset-1");
    expect(await service.resolve(shareId)).not.toBeNull();
  });
  it.each([
    { ...job(), userId: "foreign" },
    { ...job(), sessionId: "foreign-session" },
    { ...job(), promptVersionId: "foreign-version" },
    { ...job(), status: "processing" as const },
    { ...job(), result: { ...job().result!, storagePath: "video-previews/other" } },
  ])("refuses a mismatched authoritative job", async record => {
    const { service, sign } = setup(record);
    await expect(service.mint("owner", REQ)).rejects.toMatchObject({ code: "SHARE_CLIP_NOT_FOUND" });
    expect(sign).not.toHaveBeenCalled();
  });
});
