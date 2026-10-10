import { describe, it, expect, beforeEach, vi } from "vitest";
import { RunwayStrategy } from "../RunwayStrategy";
import type { PromptOptimizationResult } from "../types";

vi.mock("../../utils/TechStripper", () => ({
  TechStripper: class {
    strip(text: string) {
      return { text, tokensWereStripped: false, strippedTokens: [] };
    }
  },
  techStripper: {
    strip(text: string) {
      return { text, tokensWereStripped: false, strippedTokens: [] };
    },
  },
}));
vi.mock("../../utils/SafetySanitizer", () => ({
  SafetySanitizer: class {
    sanitize(text: string) {
      return { text, wasModified: false, replacements: [] };
    }
  },
  safetySanitizer: {
    sanitize(text: string) {
      return { text, wasModified: false, replacements: [] };
    },
  },
}));
vi.mock("../../services/analysis/VideoPromptAnalyzer", () => ({
  VideoPromptAnalyzer: class {
    async analyze() {
      return {};
    }
  },
}));
vi.mock("../../services/rewriter/VideoPromptLLMRewriter", () => ({
  VideoPromptLLMRewriter: class {
    async rewrite() {
      return "";
    }
  },
}));

const makeResult = (prompt: string): PromptOptimizationResult => ({
  prompt,
  metadata: {
    modelId: "runway-gen45",
    pipelineVersion: "2.0.0",
    phases: [],
    warnings: [],
    tokensStripped: [],
    triggersInjected: [],
  },
});

describe("RunwayStrategy", () => {
  let strategy: RunwayStrategy;

  beforeEach(() => {
    strategy = new RunwayStrategy();
  });

  describe("normalize - morphing/blur term stripping", () => {
    it('strips "morphing" from standard prompts', () => {
      const result = strategy.normalize("a face morphing into another face");
      expect(result).not.toMatch(/\bmorphing\b/i);
    });

    it("strips multiple terms in one pass", () => {
      const result = strategy.normalize("a foggy misty hazy valley");
      expect(result).not.toMatch(/\bfoggy\b/i);
      expect(result).not.toMatch(/\bmisty\b/i);
      expect(result).not.toMatch(/\bhazy\b/i);
    });
  });

  describe("normalize - preserves blur/morph when explicit style request", () => {
    it('preserves blur when "style: blur" pattern detected', () => {
      const result = strategy.normalize("style: artistic blur on the edges");
      expect(result).toContain("blur");
    });

    it('preserves morph when "intentional morph" pattern detected', () => {
      const result = strategy.normalize(
        "intentional morph transition between scenes",
      );
      expect(result).toContain("morph");
    });

    it('preserves blur when "blur effect" pattern detected', () => {
      const result = strategy.normalize(
        "apply a blur effect to the background",
      );
      expect(result).toContain("blur");
    });

    it('preserves morph when "blur aesthetic" pattern detected', () => {
      const result = strategy.normalize("this has a blur aesthetic quality");
      expect(result).toContain("blur");
    });
  });

  describe("normalize - preserves non-morphing content", () => {
    it("preserves non-morphing terms", () => {
      const result = strategy.normalize(
        "a sharp cinematic tracking shot of a runner",
      );
      expect(result).toContain("sharp");
      expect(result).toContain("cinematic");
      expect(result).toContain("runner");
    });
  });

  describe("transform - fallback behavior", () => {
    it("falls back deterministically when LLM rewrite fails", async () => {
      const fallbackStrategy = new RunwayStrategy({
        analyzer: {
          analyze: vi.fn(async () => ({
            subjects: [],
            actions: [],
            camera: { movements: [] },
            environment: { setting: "", lighting: [] },
            audio: {},
            meta: { mood: [], style: [] },
            technical: {},
            raw: "fallback raw prompt",
          })),
        } as never,
        llmRewriter: {
          rewrite: vi.fn(async () => {
            throw new Error("gateway unavailable");
          }),
        } as never,
      });

      fallbackStrategy.normalize("fallback raw prompt");
      const transformed = await fallbackStrategy.transform(
        "fallback raw prompt",
      );

      expect(transformed.prompt).toContain("fallback raw prompt");
      expect(
        transformed.metadata.warnings.some((warning) =>
          warning.includes("LLM rewrite unavailable"),
        ),
      ).toBe(true);
    });
  });

  describe("augment - trigger injection", () => {
    it("injects stability triggers when missing", () => {
      const input = makeResult("Dolly in: a woman walks through a garden");
      const result = strategy.augment(input);
      expect(result.prompt).toContain("single continuous shot");
      expect(result.prompt).toContain("fluid motion");
      expect(result.prompt).toContain("consistent geometry");
    });

    it("does not duplicate triggers already present", () => {
      strategy.normalize("test");
      const input = makeResult(
        "A single continuous shot with fluid motion and consistent geometry, cinematic lighting",
      );
      const result = strategy.augment(input);
      // Should not duplicate existing triggers
      const occurrences = (
        (result.prompt as string).match(/single continuous shot/g) || []
      ).length;
      expect(occurrences).toBe(1);
    });

    it("skips triggers with semantic overlap (concept already present)", () => {
      strategy.normalize("test");
      const input = makeResult(
        "A cinematic tracking shot with Fujifilm Pro 400H grain, fluid motion through a garden",
      );
      const result = strategy.augment(input);
      // "film grain" trigger should be skipped because "grain" (4+ chars) already appears in prompt
      const prompt = result.prompt as string;
      const filmGrainOccurrences = (prompt.match(/film grain/gi) || []).length;
      expect(filmGrainOccurrences).toBe(0);
    });
  });
});
