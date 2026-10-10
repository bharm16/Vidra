/**
 * Property-based tests for Runway Augmentation Trigger Injection
 *
 * Tests the following correctness property:
 * - Property 6 (Runway): Augmentation Trigger Injection
 *
 * For any Runway prompt, the augment phase SHALL inject at least one model-specific trigger
 * into the result, and the output SHALL contain all required triggers for Runway
 * (e.g., "single continuous shot", "fluid motion", "consistent geometry").
 *
 * @module runway-augmentation-triggers.property.test
 *
 * **Feature: video-model-optimization, Property 6 (Runway): Augmentation Trigger Injection**
 * **Validates: Requirements 3.5, 3.6, 3.7**
 */

import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";

import { RunwayStrategy } from "@services/video-prompt-analysis/strategies/RunwayStrategy";

vi.mock(
  "@services/video-prompt-analysis/services/rewriter/VideoPromptLLMRewriter",
  () => ({
    VideoPromptLLMRewriter: class {
      async rewrite(ir: { raw?: string }) {
        return typeof ir?.raw === "string" ? ir.raw : "";
      }
    },
  }),
);

/**
 * Required stability triggers for Runway A2D architecture
 * These MUST be injected by the augment phase
 */
const REQUIRED_STABILITY_TRIGGERS = [
  "single continuous shot",
  "fluid motion",
  "consistent geometry",
] as const;

const CINEMATOGRAPHIC_TRIGGERS = [
  "chromatic aberration",
  "anamorphic lens flare",
  "shallow depth of field",
  "film grain",
  "cinematic lighting",
  "volumetric lighting",
  "lens distortion",
  "bokeh",
] as const;

/**
 * Execute the full pipeline for a strategy
 */
async function executePipeline(
  strategy: RunwayStrategy,
  input: string,
): Promise<{ prompt: string; metadata: { triggersInjected: string[] } }> {
  await strategy.validate(input);
  const normalized = strategy.normalize(input);
  const transformed = await strategy.transform(normalized);
  const augmented = strategy.augment(transformed);

  return {
    prompt:
      typeof augmented.prompt === "string"
        ? augmented.prompt
        : JSON.stringify(augmented.prompt),
    metadata: augmented.metadata,
  };
}

describe("Runway Augmentation Trigger Injection Property Tests", () => {
  const strategy = new RunwayStrategy();

  /**
   * Property 6 (Runway): Augmentation Trigger Injection
   *
   * For any Runway prompt, the augment phase SHALL inject at least one model-specific trigger
   * into the result, and the output SHALL contain all required triggers for Runway.
   *
   * **Feature: video-model-optimization, Property 6 (Runway): Augmentation Trigger Injection**
   * **Validates: Requirements 3.5, 3.6, 3.7**
   */
  describe("Property 6 (Runway): Augmentation Trigger Injection", () => {
    it("injects all three required stability triggers", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .string({ minLength: 5, maxLength: 200 })
            .filter((s) => s.trim().length > 0),
          async (input) => {
            const result = await executePipeline(strategy, input);
            const lowerPrompt = result.prompt.toLowerCase();

            // All three stability triggers must be present
            for (const trigger of REQUIRED_STABILITY_TRIGGERS) {
              expect(lowerPrompt).toContain(trigger.toLowerCase());
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("Suggested Cinematography Is Not Forced", () => {
    it("does not append suggested cinematographic triggers when none are already present", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate strings that don't contain known cinematographic trigger phrases.
          fc.string({ minLength: 5, maxLength: 100 }).filter((s) => {
            const lower = s.toLowerCase();
            return (
              s.trim().length > 0 &&
              !CINEMATOGRAPHIC_TRIGGERS.some((trigger) =>
                lower.includes(trigger.toLowerCase()),
              )
            );
          }),
          async (input) => {
            const result = await executePipeline(strategy, input);
            const lowerPrompt = result.prompt.toLowerCase();

            for (const trigger of CINEMATOGRAPHIC_TRIGGERS) {
              expect(lowerPrompt).not.toContain(trigger.toLowerCase());
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
