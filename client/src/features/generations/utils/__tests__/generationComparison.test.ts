import { describe, it, expect } from "vitest";
import type { Generation } from "@features/generations/types";
import { areGenerationsEqual } from "../generationComparison";

const createGeneration = (overrides: Partial<Generation> = {}): Generation => ({
  id: "gen-123",
  tier: "draft",
  status: "completed",
  model: "wan-2.2",
  prompt: "A cat walking",
  promptVersionId: "v1",
  createdAt: 1700000000000,
  completedAt: 1700000001000,
  mediaType: "video",
  mediaUrls: ["https://example.com/video.mp4"],
  ...overrides,
});

describe("areGenerationsEqual", () => {
  describe("edge cases", () => {
    it("returns true when one is null and other is undefined", () => {
      expect(areGenerationsEqual(null, undefined)).toBe(true);
    });

    it("returns false when left is null but right has elements", () => {
      expect(areGenerationsEqual(null, [createGeneration()])).toBe(false);
    });

    it("returns false when arrays have different lengths", () => {
      const gen1 = createGeneration({ id: "gen-1" });
      const gen2 = createGeneration({ id: "gen-2" });

      expect(areGenerationsEqual([gen1], [gen1, gen2])).toBe(false);
    });

    it("returns false when arrays have same elements in different order", () => {
      const gen1 = createGeneration({ id: "gen-1", createdAt: 1 });
      const gen2 = createGeneration({ id: "gen-2", createdAt: 2 });

      expect(areGenerationsEqual([gen1, gen2], [gen2, gen1])).toBe(false);
    });
  });

  describe("core behavior", () => {
    it("returns true for structurally identical but different object references", () => {
      const gen1 = createGeneration({ id: "gen-1", status: "completed" });
      const gen2 = createGeneration({ id: "gen-1", status: "completed" });

      expect(gen1).not.toBe(gen2); // Different references
      expect(areGenerationsEqual([gen1], [gen2])).toBe(true);
    });

    it("detects difference in last element", () => {
      const gen1 = createGeneration({ id: "gen-1" });
      const gen2a = createGeneration({ id: "gen-2", mediaUrls: ["url-a"] });
      const gen2b = createGeneration({ id: "gen-2", mediaUrls: ["url-b"] });

      expect(areGenerationsEqual([gen1, gen2a], [gen1, gen2b])).toBe(false);
    });

    it("treats server queue status updates as persisted state changes", () => {
      const queued = createGeneration({
        status: "generating",
        serverProgress: 5,
        serverJobStatus: "queued",
      });
      const rendering = createGeneration({
        status: "generating",
        serverProgress: 40,
        serverJobStatus: "processing",
      });

      expect(areGenerationsEqual([queued], [rendering])).toBe(false);
    });
  });
});
