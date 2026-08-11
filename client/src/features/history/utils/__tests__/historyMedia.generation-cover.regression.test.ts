import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { resolveHistoryThumbnail } from "../historyMedia";
import { isLikelyVideoUrl } from "@features/workspace-shell/utils/takePosterUrl";
import type { PromptHistoryEntry } from "@features/prompt-optimizer";
import type { Generation } from "@features/prompt-optimizer/types/domain/generation";

/**
 * Regression (ADR-0011 D4): takes are server-persisted generation records —
 * a session authored through the current loop stores its still as a
 * completed image generation on the version, and writes NO legacy
 * `version.firstFrame`. The Library cover must resolve from those records;
 * reading only `preview` left every current-loop session blank.
 */

const baseGeneration = (overrides: Partial<Generation>): Generation =>
  ({
    id: "gen-1",
    tier: "draft",
    status: "completed",
    model: "flux-schnell",
    prompt: "a clockmaker",
    promptVersionId: "v-1",
    createdAt: 1,
    completedAt: 2,
    mediaType: "image",
    mediaUrls: [],
    ...overrides,
  }) as Generation;

const entryWith = (
  versions: PromptHistoryEntry["versions"],
): PromptHistoryEntry =>
  ({
    input: "a clockmaker",
    output: "a clockmaker adjusts",
    versions,
  }) as PromptHistoryEntry;

describe("regression: Library covers resolve from persisted generation records", () => {
  it("a completed image generation with no legacy preview becomes the cover", () => {
    const entry = entryWith([
      {
        versionId: "v-1",
        signature: "sig",
        prompt: "a clockmaker",
        timestamp: "2026-07-31T00:00:00.000Z",
        generations: [
          baseGeneration({
            mediaUrls: ["https://storage.googleapis.com/bucket/frame.webp"],
            mediaAssetIds: ["asset-img-1"],
          }),
        ],
      },
    ]);

    const resolved = resolveHistoryThumbnail(entry);
    expect(resolved.url).toBe(
      "https://storage.googleapis.com/bucket/frame.webp",
    );
    expect(resolved.assetId).toBe("asset-img-1");
  });

  it("a completed clip contributes its poster still — never its own mp4 or the clip asset id", () => {
    const entry = entryWith([
      {
        versionId: "v-1",
        signature: "sig",
        prompt: "a clockmaker",
        timestamp: "2026-07-31T00:00:00.000Z",
        generations: [
          baseGeneration({
            mediaType: "video",
            mediaUrls: ["https://storage.googleapis.com/bucket/clip.mp4"],
            mediaAssetIds: ["asset-vid-1"],
            thumbnailUrl: "https://storage.googleapis.com/bucket/poster.webp",
          }),
        ],
      },
    ]);

    const resolved = resolveHistoryThumbnail(entry);
    expect(resolved.url).toBe(
      "https://storage.googleapis.com/bucket/poster.webp",
    );
    // The only asset id on a clip record is the clip itself; re-signing it
    // would put an mp4 in an <img>. The poster URL stands alone.
    expect(resolved.assetId ?? null).toBeNull();
  });

  it("a clip whose recorded poster is itself a video contributes nothing", () => {
    const entry = entryWith([
      {
        versionId: "v-1",
        signature: "sig",
        prompt: "a clockmaker",
        timestamp: "2026-07-31T00:00:00.000Z",
        generations: [
          baseGeneration({
            mediaType: "video",
            mediaUrls: ["https://storage.googleapis.com/bucket/clip.mp4"],
            thumbnailUrl: "https://storage.googleapis.com/bucket/clip.mp4",
          }),
        ],
      },
    ]);

    expect(resolveHistoryThumbnail(entry).url).toBeNull();
  });

  it("the legacy version.firstFrame still wins when both exist", () => {
    const entry = entryWith([
      {
        versionId: "v-1",
        signature: "sig",
        prompt: "a clockmaker",
        timestamp: "2026-07-31T00:00:00.000Z",
        firstFrame: {
          imageUrl: "https://storage.googleapis.com/bucket/legacy.webp",
          generatedAt: "2026-07-31T00:00:00.000Z",
        },
        generations: [
          baseGeneration({
            mediaUrls: ["https://storage.googleapis.com/bucket/frame.webp"],
          }),
        ],
      },
    ]);

    expect(resolveHistoryThumbnail(entry).url).toBe(
      "https://storage.googleapis.com/bucket/legacy.webp",
    );
  });

  it("for any entry, a resolved cover URL is never a video", () => {
    const urlArb = fc.oneof(
      fc.constant("https://storage.googleapis.com/bucket/still.webp"),
      fc.constant("https://storage.googleapis.com/bucket/clip.mp4"),
      fc.constant("https://host/api/preview/video/content/abc"),
      fc.constant(""),
    );
    const generationArb = fc.record({
      mediaType: fc.constantFrom("image" as const, "video" as const),
      status: fc.constantFrom("completed" as const, "pending" as const),
      mediaUrls: fc.array(urlArb, { maxLength: 2 }),
      thumbnailUrl: fc.option(urlArb, { nil: undefined }),
    });
    fc.assert(
      fc.property(
        fc.array(generationArb, { maxLength: 3 }),
        fc.option(urlArb, { nil: undefined }),
        (gens, previewUrl) => {
          const entry = entryWith([
            {
              versionId: "v-1",
              signature: "sig",
              prompt: "p",
              timestamp: "2026-07-31T00:00:00.000Z",
              ...(previewUrl === undefined
                ? {}
                : {
                    firstFrame: {
                      imageUrl: previewUrl,
                      generatedAt: "2026-07-31T00:00:00.000Z",
                    },
                  }),
              generations: gens.map((g, i) =>
                baseGeneration({ ...g, id: `gen-${i}` }),
              ),
            },
          ]);
          const resolved = resolveHistoryThumbnail(entry);
          if (typeof resolved.url === "string" && resolved.url) {
            expect(isLikelyVideoUrl(resolved.url)).toBe(false);
          }
        },
      ),
      { numRuns: 120 },
    );
  });
});
