import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";

import { useGenerationsTimeline } from "@features/generations/hooks/useGenerationsTimeline";
import type { Generation } from "@features/generations/types";
import type { PromptVersionEntry } from "@features/prompt-optimizer/types/domain/prompt-session";

const createGeneration = (overrides: Partial<Generation> = {}): Generation => ({
  id: "gen-1",
  tier: "draft",
  status: "completed",
  model: "wan-2.2",
  prompt: "Prompt",
  promptVersionId: "version-1",
  createdAt: 1_000,
  completedAt: 1_500,
  mediaType: "video",
  mediaUrls: ["https://cdn/video.mp4"],
  thumbnailUrl: null,
  error: null,
  ...overrides,
});

describe("useGenerationsTimeline", () => {
  describe("error handling", () => {
    it("skips generations with mismatched prompt version ids", () => {
      const versions: PromptVersionEntry[] = [
        {
          versionId: "version-1",
          label: "V1",
          signature: "sig-1",
          prompt: "Prompt",
          timestamp: new Date(1_000).toISOString(),
          generations: [createGeneration({ promptVersionId: "other" })],
        },
      ];

      const { result } = renderHook(() => useGenerationsTimeline({ versions }));

      expect(result.current).toEqual([]);
    });
  });

  describe("edge cases", () => {
    it("deduplicates generations by id", () => {
      const generation = createGeneration();
      const versions: PromptVersionEntry[] = [
        {
          versionId: "version-1",
          label: "V1",
          signature: "sig-1",
          prompt: "Prompt",
          timestamp: new Date(1_000).toISOString(),
          generations: [generation, generation],
        },
      ];

      const { result } = renderHook(() => useGenerationsTimeline({ versions }));

      const generationItems = result.current.filter(
        (item) => item.type === "generation",
      );
      expect(generationItems).toHaveLength(1);
    });
  });

  describe("core behavior", () => {
    it("adds version dividers and sorts by creation date", () => {
      const versions: PromptVersionEntry[] = [
        {
          versionId: "version-1",
          label: "V1",
          signature: "sig-1",
          prompt: "Prompt",
          timestamp: new Date(1_000).toISOString(),
          generations: [createGeneration({ id: "gen-1", createdAt: 1_000 })],
        },
        {
          versionId: "version-2",
          label: "V2",
          signature: "sig-2",
          prompt: "Prompt",
          timestamp: new Date(2_000).toISOString(),
          generations: [
            createGeneration({
              id: "gen-2",
              createdAt: 2_000,
              promptVersionId: "version-2",
            }),
          ],
        },
      ];

      const { result } = renderHook(() => useGenerationsTimeline({ versions }));

      expect(result.current[0]).toMatchObject({
        type: "divider",
        versionId: "version-2",
        promptChanged: false,
      });
      expect(result.current[1]).toMatchObject({
        type: "generation",
        generation: expect.objectContaining({ id: "gen-2" }),
      });
      expect(result.current[2]).toMatchObject({
        type: "divider",
        versionId: "version-1",
        promptChanged: true,
      });
      expect(result.current[3]).toMatchObject({
        type: "generation",
        generation: expect.objectContaining({ id: "gen-1" }),
      });
    });
  });
});
