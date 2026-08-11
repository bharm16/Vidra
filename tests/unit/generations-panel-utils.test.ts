import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import type { Generation } from "@features/generations/types";
import {
  areGenerationsEqual,
  serializeGeneration,
} from "@features/generations/utils/generationComparison";
import { getGenerationProgressPercent } from "@features/generations/utils/generationProgress";
import {
  buildGeneration,
  createGenerationId,
  resolveGenerationOptions,
} from "@features/generations/utils/generationUtils";

const createGeneration = (overrides: Partial<Generation> = {}): Generation => ({
  id: "gen-1",
  tier: "draft",
  status: "pending",
  model: "wan-2.2",
  prompt: "Test prompt",
  promptVersionId: "version-1",
  createdAt: 1_000,
  completedAt: null,
  mediaType: "video",
  mediaUrls: [],
  thumbnailUrl: null,
  error: null,
  ...overrides,
});

describe("generationComparison utilities", () => {
  describe("error handling", () => {
    it("returns false when only one list is provided", () => {
      const generation = createGeneration();
      expect(areGenerationsEqual([generation], null)).toBe(false);
      expect(areGenerationsEqual(undefined, [generation])).toBe(false);
    });

    it("returns false when list contains a missing entry", () => {
      const generation = createGeneration();
      const left = [generation];
      const right = [undefined as unknown as Generation];
      expect(areGenerationsEqual(left, right)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("returns false when array lengths differ", () => {
      const generation = createGeneration();
      expect(areGenerationsEqual([generation], [generation, generation])).toBe(
        false,
      );
    });
  });

  describe("core behavior", () => {
    it("serializes optional fields with stable null defaults", () => {
      const generation = createGeneration({
        estimatedCost: undefined,
        actualCost: undefined,
        aspectRatio: undefined,
        duration: undefined,
        fps: undefined,
        thumbnailUrl: undefined,
        error: undefined,
        mediaUrls: [],
        mediaAssetIds: undefined,
      });

      const parsed = JSON.parse(serializeGeneration(generation));
      expect(parsed).toMatchObject({
        id: generation.id,
        status: generation.status,
        tier: generation.tier,
        model: generation.model,
        mediaType: generation.mediaType,
        promptVersionId: generation.promptVersionId,
        createdAt: generation.createdAt,
        completedAt: null,
        estimatedCost: null,
        actualCost: null,
        aspectRatio: null,
        duration: null,
        fps: null,
        thumbnailUrl: null,
        error: null,
        mediaUrls: [],
        mediaAssetIds: [],
      });
    });

    it("returns true for identical generation content", () => {
      const left = createGeneration();
      const right = createGeneration();
      expect(areGenerationsEqual([left], [right])).toBe(true);
    });
  });
});

describe("generationProgress utilities", () => {
  describe("error handling", () => {
    it("returns null when status is failed", () => {
      const generation = createGeneration({ status: "failed" });
      expect(getGenerationProgressPercent(generation, Date.now())).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("never exceeds 99% for in-flight generations", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -10_000, max: 120_000 }),
          fc.integer({ min: 0, max: 6 }),
          (offsetMs, urlCount) => {
            const generation = createGeneration({
              status: "generating",
              mediaType: "image-sequence",
              createdAt: 1_000,
              mediaUrls: Array.from(
                { length: urlCount },
                (_, index) => `url-${index}`,
              ),
            });
            const percent = getGenerationProgressPercent(
              generation,
              1_000 + offsetMs,
            );
            expect(percent).not.toBeNull();
            if (percent !== null) {
              expect(percent).toBeGreaterThanOrEqual(0);
              expect(percent).toBeLessThanOrEqual(99);
            }
          },
        ),
      );
    });
  });

  describe("core behavior", () => {
    it("returns 100 when generation is completed", () => {
      const generation = createGeneration({ status: "completed" });
      expect(getGenerationProgressPercent(generation, Date.now())).toBe(100);
    });
  });
});

describe("generationUtils", () => {
  describe("error handling", () => {
    it("falls back to default media type and null credits when model is unknown", () => {
      const generation = buildGeneration("unknown-model", "Prompt", {
        promptVersionId: null,
      });
      expect(generation.mediaType).toBe("video");
      expect(generation.estimatedCost).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("falls back to base values when overrides are null", () => {
      const resolved = resolveGenerationOptions(
        { aspectRatio: "16:9", duration: 8, promptVersionId: "a" },
        { aspectRatio: null, duration: null, promptVersionId: null },
      );

      expect(resolved.aspectRatio).toBe("16:9");
      expect(resolved.duration).toBe(8);
      expect(resolved.promptVersionId).toBe("a");
    });
  });

  describe("core behavior", () => {
    it("builds a generation with config-driven cost and media type", () => {
      const generation = buildGeneration("flux-kontext", "Prompt", {
        promptVersionId: "version-2",
      });

      expect(generation.tier).toBe("draft");
      expect(generation.status).toBe("pending");
      expect(generation.promptVersionId).toBe("version-2");
      expect(generation.mediaType).toBe("image-sequence");
      expect(generation.estimatedCost).toBe(4);
    });

    it("creates deterministic id prefix for new generations", () => {
      const id = createGenerationId();
      expect(id.startsWith("gen-")).toBe(true);
      expect(id.length).toBeGreaterThan(4);
    });
  });
});
