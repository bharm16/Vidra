/**
 * Regression: a session whose version.preview was clobbered with the clip's
 * own mp4 (legacy write path — the thumbnail extractor used to fall back to
 * "any first media URL") must not hand that video URL to the Library card's
 * <img>. Such a preview is treated as absent: earlier versions may still
 * offer a real still, and a video-only session simply shows the placeholder.
 */
import { describe, expect, it } from "vitest";
import { resolveHistoryThumbnail } from "../historyMedia";
import type { PromptHistoryEntry } from "@features/prompt-optimizer";

const PROXIED_MP4 =
  "/api/storage/proxy?url=https%3A%2F%2Fstorage.googleapis.com%2Fvidra-media-prod%2Fusers%2Fu1%2Fgenerations%2F1785521699821-abc.mp4%3FX-Goog-Expires%3D3600";

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

describe("resolveHistoryThumbnail vs video previews (regression)", () => {
  it("treats an mp4 preview as absent instead of returning it as a cover", () => {
    const entry = entryWith([
      {
        versionId: "v1",
        signature: "s1",
        prompt: "p",
        timestamp: new Date(1000).toISOString(),
        preview: {
          generatedAt: new Date(2000).toISOString(),
          imageUrl: PROXIED_MP4,
          storagePath: "users/u1/generations/1785521699821-abc.mp4",
          assetId: null,
          aspectRatio: null,
          viewUrlExpiresAt: null,
        },
      },
    ]);

    expect(resolveHistoryThumbnail(entry)).toEqual({ url: null });
  });

  it("falls back to an earlier version's real still", () => {
    const entry = entryWith([
      {
        versionId: "v1",
        signature: "s1",
        prompt: "p",
        timestamp: new Date(1000).toISOString(),
        preview: {
          generatedAt: new Date(1500).toISOString(),
          imageUrl: "https://storage.example.com/users/u1/frames/frame.webp",
          storagePath: "users/u1/frames/frame.webp",
          assetId: null,
          aspectRatio: null,
          viewUrlExpiresAt: null,
        },
      },
      {
        versionId: "v2",
        signature: "s2",
        prompt: "p2",
        timestamp: new Date(2000).toISOString(),
        preview: {
          generatedAt: new Date(2500).toISOString(),
          imageUrl: PROXIED_MP4,
          storagePath: "users/u1/generations/1785521699821-abc.mp4",
          assetId: null,
          aspectRatio: null,
          viewUrlExpiresAt: null,
        },
      },
    ]);

    expect(resolveHistoryThumbnail(entry).url).toBe(
      "https://storage.example.com/users/u1/frames/frame.webp",
    );
  });
});
