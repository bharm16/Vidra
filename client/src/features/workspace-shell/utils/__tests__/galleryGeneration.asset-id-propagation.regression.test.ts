import { describe, expect, it } from "vitest";
import { buildGalleryGenerationEntries } from "../galleryGeneration";
import type { Generation } from "@features/generations/types";

describe("regression: gallery propagates asset IDs for URL resolution", () => {
  it("propagates mediaAssetId from generation.mediaAssetIds to gallery entries", () => {
    const generation: Generation = {
      id: "gen-image-1",
      tier: "render",
      status: "completed",
      model: "flux-schnell",
      prompt: "A golden retriever on a beach",
      promptVersionId: "v1",
      createdAt: Date.now() - 60_000,
      completedAt: Date.now() - 55_000,
      mediaType: "image",
      mediaUrls: [
        "https://storage.googleapis.com/bucket/preview-images/u1/asset-img-1?X-Goog-Signature=expired",
      ],
      mediaAssetIds: ["asset-img-1"],
    };

    const entries = buildGalleryGenerationEntries({
      versions: [
        {
          versionId: "v1",
          signature: "sig-1",
          prompt: "A golden retriever on a beach",
          timestamp: new Date(Date.now() - 60_000).toISOString(),
          generations: [generation],
        },
      ],
      runtimeGenerations: [],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.gallery.mediaAssetId).toBe("asset-img-1");
    // For images, thumbnailAssetId mirrors mediaAssetId (the image IS the thumbnail)
    expect(entries[0]?.gallery.thumbnailAssetId).toBe("asset-img-1");
  });

  it("propagates version preview assetId as thumbnailAssetId for video generations", () => {
    const generation: Generation = {
      id: "gen-video-1",
      tier: "draft",
      status: "completed",
      model: "wan-2.5",
      prompt: "A baby driving a race car",
      promptVersionId: "v2",
      createdAt: Date.now() - 120_000,
      completedAt: Date.now() - 100_000,
      mediaType: "video",
      mediaUrls: ["/api/preview/video/content/asset-video-1"],
      mediaAssetIds: ["asset-video-1"],
      thumbnailUrl: null,
    };

    const entries = buildGalleryGenerationEntries({
      versions: [
        {
          versionId: "v2",
          signature: "sig-2",
          prompt: "A baby driving a race car",
          timestamp: new Date(Date.now() - 120_000).toISOString(),
          firstFrame: {
            generatedAt: new Date(Date.now() - 130_000).toISOString(),
            imageUrl:
              "https://storage.googleapis.com/bucket/preview-images/u1/asset-thumb-1?X-Goog-Signature=expired",
            assetId: "asset-thumb-1",
          },
          generations: [generation],
        },
      ],
      runtimeGenerations: [],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.gallery.mediaAssetId).toBe("asset-video-1");
    expect(entries[0]?.gallery.thumbnailAssetId).toBe("asset-thumb-1");
  });

  it("provides mediaAssetId for runtime-only generations without version data", () => {
    const generation: Generation = {
      id: "gen-runtime-1",
      tier: "draft",
      status: "completed",
      model: "wan-2.5",
      prompt: "A sunset over mountains",
      promptVersionId: null,
      createdAt: Date.now() - 5_000,
      completedAt: Date.now() - 2_000,
      mediaType: "video",
      mediaUrls: ["/api/preview/video/content/asset-rt-1"],
      mediaAssetIds: ["asset-rt-1"],
    };

    const entries = buildGalleryGenerationEntries({
      versions: [],
      runtimeGenerations: [generation],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.gallery.mediaAssetId).toBe("asset-rt-1");
    // No version preview, so thumbnailAssetId is null for videos
    expect(entries[0]?.gallery.thumbnailAssetId).toBeNull();
  });

  it("handles generations without mediaAssetIds gracefully", () => {
    const generation: Generation = {
      id: "gen-legacy-1",
      tier: "render",
      status: "completed",
      model: "flux-schnell",
      prompt: "A cat sleeping",
      promptVersionId: "v3",
      createdAt: Date.now() - 300_000,
      completedAt: Date.now() - 295_000,
      mediaType: "image",
      mediaUrls: [
        "https://storage.googleapis.com/bucket/preview-images/u1/legacy-asset?X-Goog-Signature=expired",
      ],
      // No mediaAssetIds — legacy generation
    };

    const entries = buildGalleryGenerationEntries({
      versions: [
        {
          versionId: "v3",
          signature: "sig-3",
          prompt: "A cat sleeping",
          timestamp: new Date(Date.now() - 300_000).toISOString(),
          generations: [generation],
        },
      ],
      runtimeGenerations: [],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.gallery.mediaAssetId).toBeNull();
    expect(entries[0]?.gallery.thumbnailAssetId).toBeNull();
  });
});
