import { describe, it, expect, beforeEach, vi } from "vitest";
import { KlingStrategy } from "../KlingStrategy";
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
    modelId: "kling-2.1",
    pipelineVersion: "2.0.0",
    phases: [],
    warnings: [],
    tokensStripped: [],
    triggersInjected: [],
  },
});

describe("KlingStrategy", () => {
  let strategy: KlingStrategy;

  beforeEach(() => {
    strategy = new KlingStrategy();
  });

  describe("normalize - generic sound term stripping", () => {
    it('strips standalone "sound" when no compound phrases present', () => {
      const result = strategy.normalize("the bright sound fills the room");
      expect(result).not.toMatch(/\bsound\b/i);
    });

    it('preserves compound audio phrases like "city sounds"', () => {
      const result = strategy.normalize("city sounds echo through the alley");
      expect(result.toLowerCase()).toContain("city sounds");
    });

    it('preserves "sound of" constructions via lookahead', () => {
      const result = strategy.normalize("the sound of rain on the roof");
      expect(result).toContain("sound of");
    });

    it('preserves "sound effect" constructions via lookahead', () => {
      const result = strategy.normalize("add a sound effect for thunder");
      expect(result).toContain("sound effect");
    });
  });

  describe("normalize - visual quality token stripping from audio sections", () => {
    it("strips visual quality tokens from explicitly labeled sound sections", () => {
      // Use "sfx:" prefix which is not in GENERIC_SOUND_TERMS and won't be stripped
      const result = strategy.normalize(
        "sfx: 4k crisp thunder clap in the background area",
      );
      // The "4k" inside an audio section should be stripped
      expect(result).toContain("thunder");
      expect(result).not.toMatch(/\b(?:4k|crisp)\b/i);
    });

    it("preserves visual quality tokens outside audio sections", () => {
      const result = strategy.normalize(
        "a cinematic 4k landscape with vivid colors",
      );
      expect(result).toContain("4k");
      expect(result).toContain("cinematic");
    });
  });

  describe("augment - conditional audio constraints", () => {
    it("does not inject audio triggers when prompt does not request audio", () => {
      strategy.normalize("A warrior stands in heavy rain");
      const result = strategy.augment(
        makeResult("A warrior stands in heavy rain"),
      );
      expect(result.metadata.triggersInjected).toEqual([]);
      expect(result.prompt).toBe("A warrior stands in heavy rain");
    });

    it("injects audio quality constraints when audio is requested", () => {
      strategy.normalize('Character says "hello" with dialogue audio');
      const result = strategy.augment(
        makeResult('Character says "hello" with dialogue audio'),
      );
      expect(result.prompt).toContain("natural speech");
      expect(result.prompt).toContain("high fidelity audio");
    });
  });
});
