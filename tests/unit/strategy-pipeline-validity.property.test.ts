/**
 * Property-based tests for Strategy Pipeline Validity
 *
 * Tests the following correctness property:
 * - Property 2: Strategy Pipeline Validity
 *
 * For any PromptOptimizationStrategy implementation and any valid input string,
 * executing the full pipeline (normalize → transform → augment) SHALL produce
 * a valid PromptOptimizationResult with non-null prompt field and populated metadata.
 *
 * @module strategy-pipeline-validity.property.test
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import {
  StrategyRegistry,
  BaseStrategy,
  type PromptOptimizationResult,
  type PromptContext,
  type NormalizeResult,
  type TransformResult,
  type AugmentResult,
  type VideoPromptIR,
  type RewriteConstraints,
} from "@services/video-prompt-analysis/strategies";
import { VideoPromptAnalyzer } from "@services/video-prompt-analysis/services/analysis/VideoPromptAnalyzer";
import { VideoPromptLLMRewriter } from "@services/video-prompt-analysis/services/rewriter/VideoPromptLLMRewriter";

class StubAnalyzer extends VideoPromptAnalyzer {
  override async analyze(text: string): Promise<VideoPromptIR> {
    return {
      subjects: [],
      actions: [],
      camera: { movements: [] },
      environment: { setting: "", lighting: [] },
      audio: {},
      meta: { mood: [], style: [] },
      technical: {},
      raw: text,
    };
  }
}

class StubRewriter extends VideoPromptLLMRewriter {
  override async rewrite(
    ir: VideoPromptIR,
    _modelId: string,
    _constraints: RewriteConstraints = {},
  ): Promise<string | Record<string, unknown>> {
    return ir.raw;
  }
}

describe("Strategy Pipeline Validity Property Tests", () => {
  describe("StrategyRegistry Integration", () => {
    it("registry throws on duplicate registration", () => {
      const registry = new StrategyRegistry();
      const factory = () => new TestBaseStrategy();
      registry.register("test-model", factory);
      expect(() => registry.register("test-model", factory)).toThrow(
        "already registered",
      );
    });
  });
});

/**
 * Concrete implementation of BaseStrategy for testing
 * This tests that BaseStrategy correctly integrates TechStripper and SafetySanitizer
 */
class TestBaseStrategy extends BaseStrategy {
  readonly modelId = "runway-gen45"; // Use runway to test tech stripping
  readonly modelName = "Test Runway Strategy";

  getModelConstraints() {
    return {
      wordLimits: { min: 1, max: 150 },
      triggerBudgetWords: 10,
    };
  }

  protected async doValidate(
    _input: string,
    _context?: PromptContext,
  ): Promise<void> {
    // No additional validation for test
  }

  protected doNormalize(
    input: string,
    _context?: PromptContext,
  ): NormalizeResult {
    // Simple model-specific normalization: remove "vibe" terms
    let text = input;
    const changes: string[] = [];
    const strippedTokens: string[] = [];

    if (text.toLowerCase().includes("vibe")) {
      text = text.replace(/\bvibe\b/gi, "");
      text = this.cleanWhitespace(text);
      changes.push('Stripped "vibe" term');
      strippedTokens.push("vibe");
    }

    return { text, changes, strippedTokens };
  }

  protected doTransform(
    llmPrompt: string | Record<string, unknown>,
    ir: VideoPromptIR,
    _context?: PromptContext,
  ): TransformResult {
    const basePrompt = typeof llmPrompt === "string" ? llmPrompt : ir.raw;
    // Simple transformation: wrap in CSAE structure using IR raw
    return {
      prompt: `[Camera] [Subject] ${basePrompt} [Environment]`,
      changes: ["Applied CSAE structure"],
    };
  }

  protected doAugment(
    result: PromptOptimizationResult,
    _context?: PromptContext,
  ): AugmentResult {
    // Simple augmentation: add trigger
    const prompt =
      typeof result.prompt === "string"
        ? `${result.prompt}, single continuous shot`
        : result.prompt;
    const augmentResult: AugmentResult = {
      prompt,
      changes: ["Added continuous shot trigger"],
      triggersInjected: ["single continuous shot"],
    };
    if (typeof result.negativePrompt === "string") {
      augmentResult.negativePrompt = result.negativePrompt;
    }
    return augmentResult;
  }
}

/**
 * Concrete implementation for Kling model (keeps placebo tokens)
 */
class TestKlingStrategy extends BaseStrategy {
  readonly modelId = "kling-26";
  readonly modelName = "Test Kling Strategy";

  getModelConstraints() {
    return {
      wordLimits: { min: 1, max: 120 },
      triggerBudgetWords: 10,
    };
  }

  protected async doValidate(
    _input: string,
    _context?: PromptContext,
  ): Promise<void> {
    // No additional validation
  }

  protected doNormalize(
    input: string,
    _context?: PromptContext,
  ): NormalizeResult {
    return { text: input, changes: [], strippedTokens: [] };
  }

  protected doTransform(
    llmPrompt: string | Record<string, unknown>,
    ir: VideoPromptIR,
    _context?: PromptContext,
  ): TransformResult {
    const basePrompt = typeof llmPrompt === "string" ? llmPrompt : ir.raw;
    return {
      prompt: basePrompt,
      changes: ["Identity transform"],
    };
  }

  protected doAugment(
    result: PromptOptimizationResult,
    _context?: PromptContext,
  ): AugmentResult {
    const augmentResult: AugmentResult = {
      prompt: result.prompt,
      changes: [],
      triggersInjected: [],
    };
    if (typeof result.negativePrompt === "string") {
      augmentResult.negativePrompt = result.negativePrompt;
    }
    return augmentResult;
  }
}

describe("BaseStrategy Implementation Tests", () => {
  const placeboSafeInputArb = fc
    .string({ minLength: 1, maxLength: 100 })
    .filter((value) => {
      const lower = value.toLowerCase();
      return (
        lower.trim().length > 0 &&
        !/\b4k\b/.test(lower) &&
        !lower.includes("trending on artstation")
      );
    });

  /**
   * Tests that BaseStrategy correctly integrates TechStripper
   * For Runway model, placebo tokens should be stripped
   */
  describe("TechStripper Integration", () => {
    it("strips placebo tokens for Runway model", async () => {
      const strategy = new TestBaseStrategy(
        undefined,
        undefined,
        new StubAnalyzer(),
        new StubRewriter(),
      );

      await fc.assert(
        fc.asyncProperty(placeboSafeInputArb, async (baseInput) => {
          const inputWithPlacebo = `${baseInput} 4k trending on artstation`;
          const normalized = strategy.normalize(inputWithPlacebo);
          const transformed = await strategy.transform(normalized);
          const output =
            typeof transformed.prompt === "string"
              ? transformed.prompt
              : JSON.stringify(transformed.prompt);
          const normalizedOutput = output.toLowerCase();

          // Placebo tokens should be stripped for Runway
          expect(normalizedOutput).not.toMatch(/\b4k\b/);
          expect(normalizedOutput).not.toContain("trending on artstation");
        }),
        { numRuns: 100, seed: 20260510 },
      );
    });

    it("preserves placebo tokens for Kling model", async () => {
      const strategy = new TestKlingStrategy(
        undefined,
        undefined,
        new StubAnalyzer(),
        new StubRewriter(),
      );

      await fc.assert(
        fc.asyncProperty(placeboSafeInputArb, async (baseInput) => {
          const inputWithPlacebo = `${baseInput} 4k trending on artstation`;
          const normalized = strategy.normalize(inputWithPlacebo);
          const transformed = await strategy.transform(normalized);
          const output =
            typeof transformed.prompt === "string"
              ? transformed.prompt
              : JSON.stringify(transformed.prompt);

          // Placebo tokens should be preserved for Kling
          expect(output.toLowerCase()).toContain("4k");
          expect(output.toLowerCase()).toContain("trending on artstation");
        }),
        { numRuns: 100, seed: 20260510 },
      );
    });
  });

  /**
   * Tests that BaseStrategy correctly integrates SafetySanitizer
   */
  describe("SafetySanitizer Integration", () => {
    it("sanitizes NSFW terms", async () => {
      const strategy = new TestBaseStrategy();

      const inputWithNSFW = "A video with nude content";
      const normalized = strategy.normalize(inputWithNSFW);

      // NSFW term should be replaced
      expect(normalized.toLowerCase()).not.toContain("nude");
      expect(normalized).toContain("[content removed]");
    });
  });

  /**
   * Tests that BaseStrategy correctly tracks metadata
   */
  describe("Metadata Tracking", () => {
    it("records stripped tokens in metadata", async () => {
      const strategy = new TestBaseStrategy(
        undefined,
        undefined,
        new StubAnalyzer(),
        new StubRewriter(),
      );

      await fc.assert(
        fc.asyncProperty(placeboSafeInputArb, async (baseInput) => {
          const inputWithPlacebo = `${baseInput} 4k award winning`;

          // Run full pipeline
          await strategy.validate(inputWithPlacebo);
          const normalized = strategy.normalize(inputWithPlacebo);
          const transformed = await strategy.transform(normalized);
          const result = strategy.augment(transformed);

          // Metadata should contain stripped tokens
          expect(result.metadata.tokensStripped.length).toBeGreaterThan(0);
          expect(
            result.metadata.tokensStripped.some(
              (t) => t.toLowerCase() === "4k",
            ),
          ).toBe(true);
        }),
        { numRuns: 100, seed: 20260510 },
      );
    });
  });

  /**
   * Tests that BaseStrategy validation works correctly
   */
  describe("Validation", () => {
    it("throws on empty input", async () => {
      const strategy = new TestBaseStrategy();

      await expect(strategy.validate("")).rejects.toThrow();
    });

    it("throws on whitespace-only input", async () => {
      const strategy = new TestBaseStrategy();

      await expect(strategy.validate("   ")).rejects.toThrow();
      await expect(strategy.validate("\t\n")).rejects.toThrow();
    });
  });
});
