import { describe, it, expect, beforeEach, vi } from "vitest";
import { WanStrategy } from "../WanStrategy";
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

const makeResult = (
  prompt: string,
  negativePrompt?: string,
): PromptOptimizationResult => ({
  prompt,
  ...(negativePrompt !== undefined ? { negativePrompt } : {}),
  metadata: {
    modelId: "wan-2.2",
    pipelineVersion: "2.0.0",
    phases: [],
    warnings: [],
    tokensStripped: [],
    triggersInjected: [],
  },
});

describe("WanStrategy", () => {
  let strategy: WanStrategy;

  beforeEach(() => {
    strategy = new WanStrategy();
  });

  describe("augment - negative prompt handling", () => {
    it("returns default negative prompt when not set on result", () => {
      const input = makeResult("A dragon flying over mountains");
      const result = strategy.augment(input);
      expect(result.negativePrompt).toBeDefined();
      expect(result.negativePrompt).toContain("morphing");
      expect(result.negativePrompt).toContain("distorted");
      expect(result.negativePrompt).toContain("blurry");
      expect(result.negativePrompt).toContain("watermark");
      expect(result.negativePrompt).toContain("low quality");
    });

    it("preserves existing negative prompt from result", () => {
      const input = makeResult("test", "custom negative prompt");
      const result = strategy.augment(input);
      expect(result.negativePrompt).toBe("custom negative prompt");
    });
  });
});
