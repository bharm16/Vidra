import { describe, it, expect, beforeEach, vi } from "vitest";
import { LumaStrategy } from "../LumaStrategy";
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
    modelId: "luma-ray3",
    pipelineVersion: "2.0.0",
    phases: [],
    warnings: [],
    tokensStripped: [],
    triggersInjected: [],
  },
});

describe("LumaStrategy", () => {
  let strategy: LumaStrategy;

  beforeEach(() => {
    strategy = new LumaStrategy();
  });

  describe("normalize - loop term stripping when loop:true", () => {
    it("strips multiple loop terms in a single pass", () => {
      const result = strategy.normalize(
        "a seamless looping infinite endless loop animation",
        { userIntent: "test", apiParams: { loop: true } },
      );
      expect(result).not.toMatch(/\bseamless\b/i);
      expect(result).not.toMatch(/\blooping\b/i);
      expect(result).not.toMatch(/\binfinite\b/i);
      expect(result).not.toMatch(/\b(?:endless|loop)\b/i);
      expect(result).toContain("animation");
    });
  });

  describe("normalize - preserves loop terms when loop flag is absent or false", () => {
    it('preserves "loop" when no apiParams provided', () => {
      const result = strategy.normalize("create a perfect loop animation");
      expect(result).toContain("loop");
    });

    it('preserves "loop" when apiParams.loop is false', () => {
      const result = strategy.normalize("a seamless loop video", {
        userIntent: "test",
        apiParams: { loop: false },
      });
      expect(result).toContain("loop");
      expect(result).toContain("seamless");
    });
  });

  describe("normalize - preserves non-loop content", () => {
    it("returns input mostly unchanged when no loop flag", () => {
      const input = "a cat sits on a wall in golden hour light";
      const result = strategy.normalize(input);
      expect(result).toContain("cat");
      expect(result).toContain("golden hour");
      expect(result).toContain("wall");
    });
  });

  describe("augment - passthrough behavior", () => {
    it("returns prompt unchanged (HDR triggers delegated to LLM)", () => {
      const input = makeResult(
        "A sunset over mountains with dramatic lighting",
      );
      const result = strategy.augment(input);
      expect(result.prompt).toBe(
        "A sunset over mountains with dramatic lighting",
      );
    });
  });
});
