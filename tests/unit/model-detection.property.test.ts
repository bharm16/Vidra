/**
 * Property-based tests for Model Detection Correctness
 *
 * Tests the following correctness property:
 * - Property 1: Model Detection Correctness
 *
 * For any prompt string containing a model identifier pattern (e.g., "gen-4.5",
 * "ray-3", "kling 2.6", "sora 2", "veo 4"), the ModelDetectionService SHALL
 * return the corresponding model ID, and for prompts without any model pattern,
 * it SHALL return null.
 *
 * @module model-detection.property.test
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import { ModelDetectionService } from "@services/video-prompt-analysis/services/detection/ModelDetectionService";

describe("ModelDetectionService Property Tests", () => {
  const service = new ModelDetectionService();

  // Canonical model IDs after the catalog consolidation. The detection
  // service now returns CanonicalPromptModelId — legacy ids like
  // "kling-26" / "veo-4" resolve to "kling-2.1" / "veo-3" respectively
  // through PROMPT_MODEL_ALIASES.
  const poeModelPatterns = {
    "runway-gen45": {
      patterns: ["gen-4.5", "gen4.5", "gen 4.5", "runway gen 4.5"],
      description: "Runway Gen-4.5",
    },
    "luma-ray3": {
      patterns: ["ray-3", "ray3", "ray 3", "luma ray", "luma ray-3"],
      description: "Luma Ray-3",
    },
    "kling-2.1": {
      patterns: ["kling 2.6", "kling2.6", "kling ai 2.6"],
      description: "Kling AI (canonical kling-2.1)",
    },
    "sora-2": {
      patterns: ["sora 2", "sora2", "openai sora 2"],
      description: "OpenAI Sora 2",
    },
    "veo-3": {
      patterns: ["veo 4", "veo4", "google veo 4"],
      description: "Google Veo (canonical veo-3)",
    },
  } as const;

  type PoeModelId = keyof typeof poeModelPatterns;
  const poeModelIds = Object.keys(poeModelPatterns) as PoeModelId[];

  /**
   * Property 1: Model Detection Correctness
   *
   * For any prompt string containing a model identifier pattern,
   * the ModelDetectionService SHALL return the corresponding model ID,
   * and for prompts without any model pattern, it SHALL return null.
   *
   * **Feature: video-model-optimization, Property 1: Model Detection Correctness**
   * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**
   */
  describe("Property 1: Model Detection Correctness", () => {
    /**
     * Requirement 2.1: Runway Gen-4.5 detection
     * WHEN a prompt contains "gen-4.5", "gen4.5", or "runway gen 4.5" patterns,
     * THE ModelDetectionService SHALL detect "runway-gen45" as the target model
     */
    it("detects runway-gen45 from pattern variations", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...poeModelPatterns["runway-gen45"].patterns),
          fc.string({ minLength: 0, maxLength: 50 }),
          fc.string({ minLength: 0, maxLength: 50 }),
          (pattern, prefix, suffix) => {
            const prompt = `${prefix} ${pattern} ${suffix}`.trim();
            const result = service.detectTargetModel(prompt);
            expect(result).toBe("runway-gen45");
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Requirement 2.2: Luma Ray-3 detection
     * WHEN a prompt contains "ray-3", "ray3", or "luma ray" patterns,
     * THE ModelDetectionService SHALL detect "luma-ray3" as the target model
     */
    it("detects luma-ray3 from pattern variations", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...poeModelPatterns["luma-ray3"].patterns),
          fc.string({ minLength: 0, maxLength: 50 }),
          fc.string({ minLength: 0, maxLength: 50 }),
          (pattern, prefix, suffix) => {
            const prompt = `${prefix} ${pattern} ${suffix}`.trim();
            const result = service.detectTargetModel(prompt);
            expect(result).toBe("luma-ray3");
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Requirement 2.3: Kling AI 2.6 detection
     * WHEN a prompt contains "kling 2.6", "kling2.6", or "kling ai 2.6" patterns,
     * THE ModelDetectionService SHALL detect "kling-26" as the target model
     */
    it("detects kling-2.1 from pattern variations", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...poeModelPatterns["kling-2.1"].patterns),
          fc.string({ minLength: 0, maxLength: 50 }),
          fc.string({ minLength: 0, maxLength: 50 }),
          (pattern, prefix, suffix) => {
            const prompt = `${prefix} ${pattern} ${suffix}`.trim();
            const result = service.detectTargetModel(prompt);
            expect(result).toBe("kling-2.1");
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Requirement 2.4: OpenAI Sora 2 detection
     * WHEN a prompt contains "sora 2", "sora2", or "openai sora 2" patterns,
     * THE ModelDetectionService SHALL detect "sora-2" as the target model
     */
    it("detects sora-2 from pattern variations", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...poeModelPatterns["sora-2"].patterns),
          fc.string({ minLength: 0, maxLength: 50 }),
          fc.string({ minLength: 0, maxLength: 50 }),
          (pattern, prefix, suffix) => {
            const prompt = `${prefix} ${pattern} ${suffix}`.trim();
            const result = service.detectTargetModel(prompt);
            expect(result).toBe("sora-2");
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Requirement 2.5: Google Veo 4 detection
     * WHEN a prompt contains "veo 4", "veo4", or "google veo 4" patterns,
     * THE ModelDetectionService SHALL detect "veo-4" as the target model
     */
    it("detects veo-3 from pattern variations", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...poeModelPatterns["veo-3"].patterns),
          fc.string({ minLength: 0, maxLength: 50 }),
          fc.string({ minLength: 0, maxLength: 50 }),
          (pattern, prefix, suffix) => {
            const prompt = `${prefix} ${pattern} ${suffix}`.trim();
            const result = service.detectTargetModel(prompt);
            expect(result).toBe("veo-3");
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Requirement 2.6: No model detected returns null
     * WHEN no model is explicitly detected,
     * THE ModelDetectionService SHALL return null
     */
    it("returns null when no model pattern is detected", () => {
      // Words that should NOT trigger any model detection
      const safeWords = [
        "video",
        "animation",
        "create",
        "generate",
        "beautiful",
        "scene",
        "landscape",
        "person",
        "walking",
        "sunset",
        "ocean",
        "mountain",
        "city",
        "night",
        "day",
      ];

      fc.assert(
        fc.property(
          fc.array(fc.constantFrom(...safeWords), {
            minLength: 1,
            maxLength: 10,
          }),
          (words) => {
            const prompt = words.join(" ");
            const result = service.detectTargetModel(prompt);
            expect(result).toBeNull();
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Detection is case-insensitive
     */
    it("detects models regardless of case", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...poeModelIds),
          fc.constantFrom("upper", "lower", "mixed"),
          (modelId, caseType) => {
            const patterns = poeModelPatterns[modelId].patterns;
            const pattern = patterns[0];

            let testPattern: string;
            switch (caseType) {
              case "upper":
                testPattern = pattern.toUpperCase();
                break;
              case "lower":
                testPattern = pattern.toLowerCase();
                break;
              default:
                testPattern = pattern
                  .split("")
                  .map((c, i) =>
                    i % 2 === 0 ? c.toUpperCase() : c.toLowerCase(),
                  )
                  .join("");
            }

            const result = service.detectTargetModel(testPattern);
            expect(result).toBe(modelId);
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Empty and null inputs return null
     */
    it("returns null for empty, null, or undefined inputs", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(null, undefined, "", "   ", "\t\n"),
          (input) => {
            const result = service.detectTargetModel(
              input as string | null | undefined,
            );
            expect(result).toBeNull();
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * All POE models can be detected with their primary pattern
     */

    /**
     * Model detection returns valid ModelId type
     */
  });
});
