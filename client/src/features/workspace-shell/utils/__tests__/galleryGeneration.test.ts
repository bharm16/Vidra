import { describe, expect, it } from "vitest";
import { buildGalleryGenerationEntries } from "../galleryGeneration";
import type { Generation } from "@features/generations/types";

const createGeneration = (overrides: Partial<Generation> = {}): Generation => ({
  id: "gen-1",
  tier: "render",
  status: "completed",
  model: "sora",
  prompt: "Prompt",
  promptVersionId: "version-1",
  createdAt: 1000,
  completedAt: 2000,
  mediaType: "video",
  mediaUrls: [],
  ...overrides,
});

// The poster *rules* live with `resolveTakePosterUrl` (see takePosterUrl.test).
// What is only testable here is the wiring: the builder hands the version's
// preview image to the resolver as the last-resort still.
describe("buildGalleryGenerationEntries", () => {
  it("offers the version preview image when a generation has no still of its own", () => {
    const entries = buildGalleryGenerationEntries({
      versions: [
        {
          versionId: "v1",
          signature: "sig",
          prompt: "Prompt",
          timestamp: "2026-02-20T18:00:00.000Z",
          preview: {
            generatedAt: "2026-02-20T18:00:00.000Z",
            imageUrl:
              "https://storage.example.com/users/u1/previews/images/version-thumb.webp",
          },
          generations: [
            createGeneration({
              mediaType: "video",
              thumbnailUrl: null,
              mediaUrls: ["/api/preview/video/content/asset-1"],
            }),
          ],
        },
      ],
      runtimeGenerations: [],
    });

    expect(entries[0]?.gallery.thumbnailUrl).toBe(
      "https://storage.example.com/users/u1/previews/images/version-thumb.webp",
    );
  });

  // A storyboard used to be rewritten to a `"preview"` tier, which made the
  // gallery say "Preview" for something generated at the render tier — being
  // an image-sequence is a media type, not a tier.
  it("keeps a storyboard's own tier instead of retiering it", () => {
    const entries = buildGalleryGenerationEntries({
      versions: [],
      runtimeGenerations: [
        createGeneration({
          id: "storyboard-1",
          tier: "render",
          mediaType: "image-sequence",
          mediaUrls: ["https://storage.example.com/frame-1.webp"],
        }),
        createGeneration({
          id: "draft-1",
          tier: "draft",
          mediaUrls: ["https://storage.example.com/clip-1.mp4"],
        }),
      ],
    });

    const tierById = new Map(
      entries.map((entry) => [entry.gallery.id, entry.gallery.tier]),
    );
    expect(tierById.get("storyboard-1")).toBe("render");
    expect(tierById.get("draft-1")).toBe("draft");
  });
});
