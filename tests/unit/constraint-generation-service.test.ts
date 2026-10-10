import { describe, it, expect } from "vitest";
import { ConstraintGenerationService } from "@services/video-prompt-analysis/services/analysis/ConstraintGenerationService";

function createService(): ConstraintGenerationService {
  return new ConstraintGenerationService();
}

describe("ConstraintGenerationService", () => {
  // ===========================================================================
  // ERROR HANDLING & INVALID INPUT (~50%)
  // ===========================================================================
  describe("error handling and invalid input", () => {
    it("falls back to phrase mode when forceMode is unknown", () => {
      const service = createService();
      const result = service.getVideoReplacementConstraints(
        { highlightWordCount: 3 },
        { forceMode: "nonexistent_mode_xyz" },
      );
      expect(result.mode).toBe("phrase");
    });

    it("treats unreliable category confidence (below 0.45) as untrusted", () => {
      const service = createService();
      const result = service.getVideoReplacementConstraints({
        highlightedCategory: "lighting",
        highlightedCategoryConfidence: 0.1,
        highlightWordCount: 5,
      });
      // Low confidence means lighting category should not drive mode selection
      expect(result.mode).not.toBe("lighting");
    });

    it("treats null confidence as reliable (trusts the category)", () => {
      const service = createService();
      const result = service.getVideoReplacementConstraints({
        highlightedCategory: "lighting setup",
        highlightedCategoryConfidence: null,
        highlightWordCount: 5,
      });
      expect(result.mode).toBe("lighting");
    });

    it("treats undefined confidence as reliable (trusts the category)", () => {
      const service = createService();
      const result = service.getVideoReplacementConstraints({
        highlightedCategory: "lighting setup",
        highlightWordCount: 5,
      });
      expect(result.mode).toBe("lighting");
    });
  });

  // ===========================================================================
  // EDGE CASES (~30%)
  // ===========================================================================
  describe("edge cases", () => {
    it("minWords is always <= maxWords for all forced modes", () => {
      const service = createService();
      const modes = [
        "micro",
        "lighting",
        "camera",
        "location",
        "style",
        "phrase",
        "sentence",
      ];
      for (const mode of modes) {
        const result = service.getVideoReplacementConstraints(
          { highlightWordCount: 1 },
          { forceMode: mode },
        );
        expect(result.minWords).toBeLessThanOrEqual(result.maxWords);
      }
    });

    it("minWords >= 1 even with 0 word count", () => {
      const service = createService();
      const result = service.getVideoReplacementConstraints(
        { highlightWordCount: 0 },
        { forceMode: "micro" },
      );
      expect(result.minWords).toBeGreaterThanOrEqual(1);
    });

    it("uses phraseRole as slotDescriptor when present", () => {
      const service = createService();
      const result = service.getVideoReplacementConstraints({
        phraseRole: "camera movement",
        highlightWordCount: 3,
      });
      expect(result.slotDescriptor).toBe("camera movement");
    });

    it('uses highlightedCategory + "detail" as slotDescriptor when phraseRole absent', () => {
      const service = createService();
      const result = service.getVideoReplacementConstraints({
        highlightedCategory: "environment",
        highlightWordCount: 3,
      });
      expect(result.slotDescriptor).toBe("environment detail");
    });

    it('defaults slotDescriptor to "visual detail" when both role and category absent', () => {
      const service = createService();
      const result = service.getVideoReplacementConstraints({
        highlightWordCount: 3,
      });
      expect(result.slotDescriptor).toBe("visual detail");
    });

    it("boundary: 3 words is still very short (micro)", () => {
      const service = createService();
      const result = service.getVideoReplacementConstraints({
        highlightWordCount: 3,
        highlightedText: "big red car",
      });
      expect(result.mode).toBe("micro");
    });

    it("boundary: 4 words is not very short (falls through to other rules)", () => {
      const service = createService();
      const result = service.getVideoReplacementConstraints({
        highlightWordCount: 4,
        highlightedText: "the big red car",
      });
      // 4 words, no category match, not a sentence, within phrase threshold
      expect(result.mode).toBe("phrase");
    });
  });

  // ===========================================================================
  // CORE BEHAVIOR - CATEGORY-BASED MODE SELECTION (~20%)
  // ===========================================================================
  describe("category-based auto-selection", () => {
    it("selects micro for subject category", () => {
      const service = createService();
      const result = service.getVideoReplacementConstraints({
        highlightedCategory: "subject description",
        highlightWordCount: 5,
      });
      expect(result.mode).toBe("micro");
    });

    it("selects micro for shot category", () => {
      const service = createService();
      const result = service.getVideoReplacementConstraints({
        highlightedCategory: "shot type",
        highlightWordCount: 5,
      });
      expect(result.mode).toBe("micro");
    });

    it("selects movement phrase mode for camera movement category", () => {
      const service = createService();
      const result = service.getVideoReplacementConstraints({
        highlightedCategory: "camera movement",
        highlightWordCount: 5,
      });
      expect(result.mode).toBe("phrase");
    });

    it("selects camera for framing category", () => {
      const service = createService();
      const result = service.getVideoReplacementConstraints({
        highlightedCategory: "framing choice",
        highlightWordCount: 5,
      });
      expect(result.mode).toBe("camera");
    });

    it("selects location for environment category", () => {
      const service = createService();
      const result = service.getVideoReplacementConstraints({
        highlightedCategory: "environment setting",
        highlightWordCount: 5,
      });
      expect(result.mode).toBe("location");
    });

    it("selects style for style category", () => {
      const service = createService();
      const result = service.getVideoReplacementConstraints({
        highlightedCategory: "style reference",
        highlightWordCount: 5,
      });
      expect(result.mode).toBe("style");
    });

    it("selects style for audio category", () => {
      const service = createService();
      const result = service.getVideoReplacementConstraints({
        highlightedCategory: "audio score",
        highlightWordCount: 5,
      });
      expect(result.mode).toBe("style");
    });

    it("selects sentence for long sentence-like text", () => {
      const service = createService();
      const result = service.getVideoReplacementConstraints({
        highlightWordCount: 15,
        highlightedText:
          "The camera slowly pans across the ruins as golden light filters through broken arches.",
      });
      expect(result.mode).toBe("sentence");
    });

    it("forceMode overrides auto-selection", () => {
      const service = createService();
      const result = service.getVideoReplacementConstraints(
        { highlightedCategory: "lighting", highlightWordCount: 5 },
        { forceMode: "camera" },
      );
      expect(result.mode).toBe("camera");
    });
  });
});
