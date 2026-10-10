import { describe, expect, it } from "vitest";
import type { Generation } from "@features/generations/types";
import {
  mergeGenerations,
  mergeMediaUrls,
  pickPreferredUrl,
} from "../generationUrlPreference";

const buildGeneration = (
  id: string,
  mediaUrls: string[],
  thumbnailUrl: string | null = null,
): Generation => ({
  id,
  tier: "draft",
  status: "completed",
  model: "sora-2",
  prompt: "prompt",
  promptVersionId: "v1",
  createdAt: 1,
  completedAt: 2,
  mediaType: "video",
  mediaUrls,
  thumbnailUrl,
});

describe("generationUrlPreference", () => {
  it("prefers the signed URL with later expiry when both are signed", () => {
    const nowMs = Date.UTC(2026, 0, 1, 0, 30, 0);
    const earlier =
      "https://storage.googleapis.com/bucket/video.mp4?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Date=20260101T000000Z&X-Goog-Expires=1800&X-Goog-Signature=abc";
    const later =
      "https://storage.googleapis.com/bucket/video.mp4?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Date=20260101T000000Z&X-Goog-Expires=3600&X-Goog-Signature=def";

    expect(pickPreferredUrl(earlier, later, nowMs)).toBe(later);
    expect(pickPreferredUrl(later, earlier, nowMs)).toBe(later);
  });

  it("mergeMediaUrls keeps local URL when incoming signed URL is near expiry", () => {
    const nowMs = Date.UTC(2026, 0, 1, 0, 59, 0);
    const incomingNearExpiry =
      "https://storage.googleapis.com/bucket/video.mp4?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Date=20260101T000000Z&X-Goog-Expires=3600&X-Goog-Signature=incoming";
    const localFresher =
      "https://storage.googleapis.com/bucket/video.mp4?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Date=20260101T003000Z&X-Goog-Expires=3600&X-Goog-Signature=local";

    const merged = mergeMediaUrls([incomingNearExpiry], [localFresher], nowMs);

    expect(merged).toEqual([localFresher]);
  });

  it("mergeGenerations preserves preferred media and thumbnail URLs for matching IDs", () => {
    const localUnsignedVideo = "https://cdn.example.com/final.mp4";
    const incomingSignedVideo =
      "https://storage.googleapis.com/bucket/final.mp4?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Date=20260101T000000Z&X-Goog-Expires=3600&X-Goog-Signature=signed";
    const localUnsignedThumb = "https://cdn.example.com/final.jpg";
    const incomingSignedThumb =
      "https://storage.googleapis.com/bucket/final.jpg?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Date=20260101T000000Z&X-Goog-Expires=3600&X-Goog-Signature=signed";

    const incoming = [
      buildGeneration("gen-1", [incomingSignedVideo], incomingSignedThumb),
      buildGeneration(
        "gen-2",
        ["https://cdn.example.com/new.mp4"],
        "https://cdn.example.com/new.jpg",
      ),
    ];
    const local = [
      buildGeneration("gen-1", [localUnsignedVideo], localUnsignedThumb),
    ];

    const merged = mergeGenerations(incoming, local);

    expect(merged).toHaveLength(2);
    expect(merged?.[0]?.mediaUrls).toEqual([localUnsignedVideo]);
    expect(merged?.[0]?.thumbnailUrl).toBe(localUnsignedThumb);
    expect(merged?.[1]?.mediaUrls).toEqual(["https://cdn.example.com/new.mp4"]);
  });
});
