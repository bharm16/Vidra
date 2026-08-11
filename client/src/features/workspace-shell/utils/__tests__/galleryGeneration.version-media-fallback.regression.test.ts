import { describe, expect, it } from "vitest";
import { buildGalleryGenerationEntries } from "../galleryGeneration";

describe("regression: gallery fallback when generations are missing from version payload", () => {
  it("builds a gallery entry from version-level preview/video metadata", () => {
    const entries = buildGalleryGenerationEntries({
      versions: [
        {
          versionId: "v-corrupted",
          signature: "sig-corrupted",
          prompt: "A cinematic shot of a baby driving a tiny car.",
          timestamp: "2026-02-21T12:00:00.000Z",
          firstFrame: {
            generatedAt: "2026-02-21T12:00:00.000Z",
            imageUrl:
              "https://storage.example.com/users/u1/previews/images/preview.webp",
            storagePath: "users/u1/previews/images/preview.webp",
            assetId: "asset-preview-1",
          },
          video: {
            generatedAt: "2026-02-21T12:00:00.000Z",
            videoUrl: "/api/preview/video/content/asset-video-1",
            model: "sora",
            storagePath: "users/u1/generations/videos/render.mp4",
            assetId: "asset-video-1",
            generationParams: { aspect_ratio: "16:9" },
          },
        },
      ],
      runtimeGenerations: [],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.generation.mediaType).toBe("video");
    expect(entries[0]?.gallery.mediaUrl).toBe(
      "/api/preview/video/content/asset-video-1",
    );
    expect(entries[0]?.gallery.thumbnailUrl).toBe(
      "https://storage.example.com/users/u1/previews/images/preview.webp",
    );
  });
});
