import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveGenerationOptions, buildGeneration } from "../generationUtils";
import { getModelConfig } from "../../config/generationConfig";
import type { GenerationParams } from "../../types";

vi.mock("../../config/generationConfig", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../config/generationConfig")>();
  return {
    ...actual,
    getModelConfig: vi.fn(),
  };
});

describe("resolveGenerationOptions", () => {
  describe("edge cases", () => {
    it("treats null and undefined as fallthrough values with nullish coalescing", () => {
      const base: GenerationParams = { aspectRatio: "16:9" };
      const overrides: GenerationParams = { aspectRatio: null };

      const result = resolveGenerationOptions(base, overrides);

      // null in overrides falls through to base due to ?? operator
      expect(result.aspectRatio).toBe("16:9");
    });
  });

  describe("core behavior", () => {
    it("prefers override values over base values", () => {
      const base: GenerationParams = {
        aspectRatio: "16:9",
        duration: 5,
      };
      const overrides: GenerationParams = {
        aspectRatio: "9:16",
        duration: 10,
      };

      const result = resolveGenerationOptions(base, overrides);

      expect(result.aspectRatio).toBe("9:16");
      expect(result.duration).toBe(10);
    });

    it("merges generationParams from overrides", () => {
      const base: GenerationParams = {
        generationParams: { seed: 123 },
      };
      const overrides: GenerationParams = {
        generationParams: { seed: 456, motion: "slow" },
      };

      const result = resolveGenerationOptions(base, overrides);

      // Override replaces entirely, not merges
      expect(result.generationParams).toEqual({ seed: 456, motion: "slow" });
    });
  });
});

describe("buildGeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(1700000000000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("core behavior", () => {
    // ADR-0021: the tier IS the model choice, so it is derived rather than
    // passed in. Before this, the render button could resolve to the draft
    // model and still stamp `tier: "render"` on a wan clip.
    it("derives tier from the model rather than taking it as a parameter", () => {
      vi.mocked(getModelConfig).mockReturnValue({
        label: "Test",
        credits: 10,
        eta: "1m",
        mediaType: "video",
      });

      expect(buildGeneration("wan-2.5", "prompt", {}).tier).toBe("draft");
      expect(buildGeneration("sora-2", "prompt", {}).tier).toBe("render");
      expect(buildGeneration("google/veo-3", "prompt", {}).tier).toBe("render");
    });

    it("treats a model outside the render table as draft", () => {
      vi.mocked(getModelConfig).mockReturnValue(null);

      expect(buildGeneration("unknown-model", "prompt", {}).tier).toBe("draft");
    });

    it("generates unique ID for each generation", () => {
      vi.mocked(getModelConfig).mockReturnValue({
        label: "Test",
        credits: 10,
        eta: "1m",
        mediaType: "video",
      });

      const gen1 = buildGeneration("model", "prompt", {});
      const gen2 = buildGeneration("model", "prompt", {});

      expect(gen1.id).not.toBe(gen2.id);
      expect(gen1.id).toMatch(/^gen-/);
      expect(gen2.id).toMatch(/^gen-/);
    });
  });
});
