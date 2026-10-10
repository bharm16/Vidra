import { describe, it, expect, beforeEach, vi } from "vitest";
import { SoraStrategy } from "../SoraStrategy";
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
    modelId: "sora-2",
    pipelineVersion: "2.0.0",
    phases: [],
    warnings: [],
    tokensStripped: [],
    triggersInjected: [],
  },
});

describe("SoraStrategy", () => {
  let strategy: SoraStrategy;

  beforeEach(() => {
    strategy = new SoraStrategy();
  });

  describe("augment - natural prose cleanup", () => {
    it("removes timestamped shot syntax", () => {
      const result = strategy.augment(
        makeResult("Shot 1 (0-4s): a ball bounces. Shot 2 (4-8s): it lands."),
      );
      const prompt = result.prompt as string;
      expect(prompt).not.toContain("Shot 1");
      expect(prompt).not.toContain("(0-4s)");
    });

    it("does not inject forced physics triggers", () => {
      const result = strategy.augment(makeResult("A ball bouncing off a wall"));
      const prompt = result.prompt as string;
      expect(prompt).not.toContain("Newtonian physics");
      expect(prompt).not.toContain("momentum conservation");
      expect(prompt).not.toContain("response_format: json_object");
      expect(result.metadata.triggersInjected).toEqual([]);
    });
  });
});
