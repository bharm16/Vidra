import { describe, expect, it } from "vitest";
import { SIGNED_URL_TTL_MS } from "@config/signedUrlPolicy";
import type {
  OwnedPictureHandle,
  OwnedPictureResolver,
  ResolvedOwnedPicture,
} from "@services/owned-media";
import type { SessionDto } from "@shared/types/session";
import { remintSessionPictureUrls } from "../remintSessionPictureUrls";

/**
 * The read-path re-mint (issue #125). The owner-checked resolver is injected,
 * so these use a hand-written fake at that seam — the process-external stores
 * it fronts are never touched.
 */

const NOW = Date.parse("2026-09-18T00:00:00.000Z");
const clock = (): number => NOW;
const expectedExpiry = new Date(NOW + SIGNED_URL_TTL_MS.view).toISOString();

/** Mints a deterministic fresh URL for any handle it is given. */
const freshResolver: OwnedPictureResolver = {
  async resolveOwnedPicture(
    _userId: string,
    handle: OwnedPictureHandle,
  ): Promise<ResolvedOwnedPicture | null> {
    const path = handle.storagePath ?? `image-previews/owner/${handle.assetId}`;
    return { storagePath: path, viewUrl: `fresh://${path}` };
  },
};

/** Refuses everything — an unowned or missing object. */
const refusingResolver: OwnedPictureResolver = {
  async resolveOwnedPicture(): Promise<ResolvedOwnedPicture | null> {
    return null;
  },
};

/** A store hiccup mid-read. */
const throwingResolver: OwnedPictureResolver = {
  async resolveOwnedPicture(): Promise<ResolvedOwnedPicture | null> {
    throw new Error("storage unavailable");
  },
};

const sessionWith = (
  generations: Array<Record<string, unknown>>,
): SessionDto => ({
  id: "sess-1",
  userId: "owner-1",
  status: "active",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  prompt: {
    input: "a lighthouse at dusk",
    output: "a lighthouse at dusk",
    versions: [
      {
        versionId: "v-1",
        signature: "sig",
        prompt: "a lighthouse at dusk",
        timestamp: "2026-09-01T00:00:00.000Z",
        generations: generations as never,
      },
    ],
  },
});

const firstGeneration = (dto: SessionDto): Record<string, unknown> =>
  (dto.prompt?.versions?.[0]?.generations?.[0] ?? {}) as Record<
    string,
    unknown
  >;

describe("remintSessionPictureUrls", () => {
  it("re-mints a picture take's URLs and stamps the view-URL expiry", async () => {
    const dto = sessionWith([
      {
        id: "pic-1",
        mediaType: "image",
        status: "completed",
        mediaUrls: ["https://signed/expired?X-Goog-Signature=dead"],
        thumbnailUrl: "https://signed/expired?X-Goog-Signature=dead",
        storagePath: "image-previews/owner-1/pic-1",
        mediaAssetIds: ["asset-1"],
      },
    ]);

    const out = await remintSessionPictureUrls(dto, {
      resolver: freshResolver,
      now: clock,
    });

    const gen = firstGeneration(out);
    expect(gen.mediaUrls).toEqual(["fresh://image-previews/owner-1/pic-1"]);
    expect(gen.thumbnailUrl).toBe("fresh://image-previews/owner-1/pic-1");
    expect(gen.viewUrlExpiresAt).toBe(expectedExpiry);
    // Identity is never touched — only the ephemeral URL moved.
    expect(gen.id).toBe("pic-1");
    expect(gen.storagePath).toBe("image-previews/owner-1/pic-1");
    expect(gen.mediaAssetIds).toEqual(["asset-1"]);
  });

  it("resolves a generated take from its asset id when it records no path", async () => {
    const dto = sessionWith([
      {
        id: "pic-2",
        mediaType: "image",
        status: "completed",
        mediaUrls: ["https://signed/old"],
        mediaAssetIds: ["basename-2"],
      },
    ]);

    const gen = firstGeneration(
      await remintSessionPictureUrls(dto, {
        resolver: freshResolver,
        now: clock,
      }),
    );
    expect(gen.mediaUrls).toEqual(["fresh://image-previews/owner/basename-2"]);
  });

  // Negative path (owner-checked re-mint): a refusal reads as absence — the
  // stored URL is left exactly as it was, never blanked, never thrown.
  it("leaves a picture untouched when the resolver refuses (unowned or missing)", async () => {
    const dto = sessionWith([
      {
        id: "pic-1",
        mediaType: "image",
        status: "completed",
        mediaUrls: ["https://signed/original"],
        thumbnailUrl: "https://signed/original",
        storagePath: "image-previews/someone-else/pic-1",
      },
    ]);

    const gen = firstGeneration(
      await remintSessionPictureUrls(dto, {
        resolver: refusingResolver,
        now: clock,
      }),
    );
    expect(gen.mediaUrls).toEqual(["https://signed/original"]);
    expect(gen.thumbnailUrl).toBe("https://signed/original");
    expect(gen).not.toHaveProperty("viewUrlExpiresAt");
  });

  // A session read must never fail because one picture's mint threw — reopen
  // degrades to the stored URL, never a 500.
  it("keeps the stored URL and never throws when the resolver throws", async () => {
    const dto = sessionWith([
      {
        id: "pic-1",
        mediaType: "image",
        status: "completed",
        mediaUrls: ["https://signed/original"],
        storagePath: "image-previews/owner-1/pic-1",
      },
    ]);

    const gen = firstGeneration(
      await remintSessionPictureUrls(dto, {
        resolver: throwingResolver,
        now: clock,
      }),
    );
    expect(gen.mediaUrls).toEqual(["https://signed/original"]);
    expect(gen).not.toHaveProperty("viewUrlExpiresAt");
  });

  it("never re-mints a clip — the resolver is a picture resolver", async () => {
    const dto = sessionWith([
      {
        id: "clip-1",
        mediaType: "video",
        status: "completed",
        mediaUrls: ["https://signed/clip.mp4"],
        storagePath: "users/owner-1/previews/videos/clip-1",
      },
    ]);

    const gen = firstGeneration(
      await remintSessionPictureUrls(dto, {
        resolver: freshResolver,
        now: clock,
      }),
    );
    expect(gen.mediaUrls).toEqual(["https://signed/clip.mp4"]);
    expect(gen).not.toHaveProperty("viewUrlExpiresAt");
  });

  it("leaves a picture with no durable handle untouched", async () => {
    const dto = sessionWith([
      {
        id: "pic-legacy",
        mediaType: "image",
        status: "completed",
        mediaUrls: ["https://signed/legacy"],
      },
    ]);

    const gen = firstGeneration(
      await remintSessionPictureUrls(dto, {
        resolver: freshResolver,
        now: clock,
      }),
    );
    expect(gen.mediaUrls).toEqual(["https://signed/legacy"]);
  });

  it("returns the same DTO reference when there is nothing to re-mint", async () => {
    const dto = sessionWith([]);
    const out = await remintSessionPictureUrls(dto, {
      resolver: freshResolver,
    });
    expect(out).toBe(dto);
  });

  it("returns a session with no prompt unchanged", async () => {
    const dto: SessionDto = {
      id: "sess-2",
      userId: "owner-1",
      status: "active",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    expect(
      await remintSessionPictureUrls(dto, { resolver: freshResolver }),
    ).toBe(dto);
  });
});
