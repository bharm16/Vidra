/**
 * Regression: legacy previews carry a real image url but the CLIP's own mp4
 * in `storagePath`/`assetId` (the same write path that once clobbered
 * imageUrl). MediaUrlResolver prefers storagePath, so once the image url's
 * signature expired it happily re-signed the VIDEO and handed a fresh mp4
 * to the Library card's <img> — a permanently broken cover.
 *
 * Invariant: identifiers that point at video media never travel on an image
 * thumbnail ref; only the image url (still rescuable via the media proxy)
 * survives such records.
 */
import { describe, expect, it } from "vitest";
import { resolveHistoryThumbnail } from "../historyMedia";
import type { PromptHistoryEntry } from "@features/prompt-optimizer";

const IMAGE_URL =
  "https://storage.googleapis.com/vidra-media-prod/image-previews/1785521699000-still.webp?X-Goog-Signature=abc&X-Goog-Expires=3600";

const entryWith = (
  versions: PromptHistoryEntry["versions"],
): PromptHistoryEntry =>
  ({
    id: "session_1",
    uuid: "uuid-1",
    input: "in",
    output: "out",
    versions,
  }) as PromptHistoryEntry;

const versionWithPreview = (preview: {
  storagePath: string;
  assetId: string;
}): NonNullable<PromptHistoryEntry["versions"]>[number] => ({
  versionId: "v1",
  signature: "s1",
  prompt: "p",
  timestamp: new Date(1000).toISOString(),
  firstFrame: {
    generatedAt: new Date(2000).toISOString(),
    imageUrl: IMAGE_URL,
    storagePath: preview.storagePath,
    assetId: preview.assetId,
    aspectRatio: null,
    viewUrlExpiresAt: null,
  },
});

describe("resolveHistoryThumbnail vs video storage paths (regression)", () => {
  it("drops an mp4 storagePath and its asset id from an image thumbnail ref", () => {
    const entry = entryWith([
      versionWithPreview({
        storagePath: "users/u1/generations/1785521699821-abc.mp4",
        assetId: "video-asset-1",
      }),
    ]);

    expect(resolveHistoryThumbnail(entry)).toEqual({
      url: IMAGE_URL,
      storagePath: null,
      assetId: null,
    });
  });

  it("keeps image-pointing identifiers intact", () => {
    const entry = entryWith([
      versionWithPreview({
        storagePath: "users/u1/previews/images/1785521699000-still.webp",
        assetId: "image-asset-1",
      }),
    ]);

    expect(resolveHistoryThumbnail(entry)).toEqual({
      url: IMAGE_URL,
      storagePath: "users/u1/previews/images/1785521699000-still.webp",
      assetId: "image-asset-1",
    });
  });
});
