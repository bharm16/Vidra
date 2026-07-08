import { describe, it, expect, beforeEach } from "vitest";
import { AppError } from "@server/types/common";
import type { SessionRecord } from "@server/domain/session/types";
import { ShareService } from "../ShareService";
import type {
  ShareRecord,
  ShareRecordStore,
  ShareSessionReader,
  ShareUrlResolver,
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
          storagePath: "videos/clip.mp4",
          prompt: "a cat surfing",
          model: "sora-2",
        }),
      ),
      urls,
    );

    const { shareId } = await svc.mint("owner", REQ);
    expect(store.records.get(shareId)).toMatchObject({
      storagePath: "videos/clip.mp4",
      description: "a cat surfing",
      model: "sora-2",
    });

    const clip = await svc.resolve(shareId);
    expect(clip).toEqual({
      videoUrl: "https://signed.example/videos/clip.mp4",
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
          { id: "g1", storagePath: "videos/clip.mp4" },
          { userId: "someone-else" },
        ),
      ),
      urls,
    );
    await expect(svc.mint("owner", REQ)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(store.records.size).toBe(0);
  });

  it("rejects an unknown generation id with a 404", async () => {
    const svc = new ShareService(
      store,
      readerFor(sessionWith({ id: "other", storagePath: "x" })),
      urls,
    );
    await expect(svc.mint("owner", REQ)).rejects.toBeInstanceOf(AppError);
  });

  it("rejects a clip with no storage path (unshareable media) with a 400", async () => {
    const svc = new ShareService(
      store,
      readerFor(sessionWith({ id: "g1", prompt: "no media" })),
      urls,
    );
    await expect(svc.mint("owner", REQ)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("falls back to the version's words when the generation has no prompt", async () => {
    const svc = new ShareService(
      store,
      readerFor(
        sessionWith(
          { id: "g1", storagePath: "videos/clip.mp4" },
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
});
