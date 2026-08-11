import { describe, expect, it } from "vitest";
import type {
  PromptHistoryEntry,
  PromptVersionEntry,
  PromptKeyframe,
} from "../../types";
import {
  enforceImmutableKeyframes,
  enforceImmutableVersions,
} from "../immutableMedia";

const buildEntry = (versions: PromptVersionEntry[]): PromptHistoryEntry => ({
  uuid: "entry-1",
  input: "input",
  output: "output",
  versions,
});

describe("immutableMedia utils", () => {
  it("preserves existing preview storagePath and assetId", () => {
    const existing: PromptVersionEntry = {
      versionId: "v1",
      signature: "sig",
      prompt: "prompt",
      timestamp: "now",
      firstFrame: {
        generatedAt: "now",
        imageUrl: "https://old.example.com/image.png",
        storagePath: "users/user1/previews/images/original.webp",
        assetId: "asset-123",
      },
    };
    const incoming: PromptVersionEntry = {
      ...existing,
      firstFrame: {
        generatedAt: "now",
        imageUrl: "https://new.example.com/image.png",
        storagePath: "users/user1/previews/images/overwritten.webp",
        assetId: "asset-999",
      },
    };

    const result = enforceImmutableVersions(buildEntry([existing]), [incoming]);

    expect(result.versions[0]?.firstFrame?.storagePath).toBe(
      "users/user1/previews/images/original.webp",
    );
    expect(result.versions[0]?.firstFrame?.assetId).toBe("asset-123");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("preserves generation mediaAssetIds when incoming differs", () => {
    const existing: PromptVersionEntry = {
      versionId: "v1",
      signature: "sig",
      prompt: "prompt",
      timestamp: "now",
      generations: [
        {
          id: "gen-1",
          tier: "draft",
          status: "completed",
          model: "model",
          prompt: "prompt",
          promptVersionId: null,
          createdAt: 0,
          completedAt: 0,
          mediaType: "video",
          mediaUrls: ["https://old.example.com/video.mp4"],
          mediaAssetIds: ["users/user1/generations/original.mp4"],
        },
      ],
    };
    const incoming: PromptVersionEntry = {
      ...existing,
      generations: [
        (() => {
          const baseGeneration = existing.generations?.[0];
          if (!baseGeneration) {
            throw new Error("Expected base generation");
          }
          return {
            ...baseGeneration,
            mediaAssetIds: ["users/user1/generations/overwritten.mp4"],
            mediaUrls: ["https://new.example.com/video.mp4"],
          };
        })(),
      ],
    };

    const result = enforceImmutableVersions(buildEntry([existing]), [incoming]);
    const generation = result.versions[0]?.generations?.[0];
    expect(generation?.mediaAssetIds).toEqual([
      "users/user1/generations/original.mp4",
    ]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("preserves keyframe storagePath when incoming differs", () => {
    const existing: PromptKeyframe[] = [
      {
        id: "kf-1",
        url: "https://old.example.com/frame.png",
        storagePath: "users/user1/previews/images/original.webp",
      },
    ];
    const incoming: PromptKeyframe[] = [
      {
        id: "kf-1",
        url: "https://new.example.com/frame.png",
        storagePath: "users/user1/previews/images/overwritten.webp",
      },
    ];

    const result = enforceImmutableKeyframes(existing, incoming);
    expect(result.keyframes?.[0]?.storagePath).toBe(
      "users/user1/previews/images/original.webp",
    );
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
