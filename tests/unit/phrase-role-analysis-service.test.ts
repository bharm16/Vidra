import { describe, it, expect } from "vitest";
import { PhraseRoleAnalysisService } from "@services/video-prompt-analysis/services/analysis/PhraseRoleAnalysisService";

function createService(): PhraseRoleAnalysisService {
  return new PhraseRoleAnalysisService();
}

describe("PhraseRoleAnalysisService", () => {
  // ===========================================================================
  // ERROR HANDLING & INVALID INPUT (~50%)
  // ===========================================================================
  describe("error handling and invalid input", () => {
    it("returns default role for all null inputs", () => {
      const service = createService();
      const result = service.detectVideoPhraseRole(null, null, null, null);
      expect(result).toBe("general visual detail");
    });

    it("returns default role for all undefined inputs", () => {
      const service = createService();
      const result = service.detectVideoPhraseRole(
        undefined,
        undefined,
        undefined,
        undefined,
      );
      expect(result).toBe("general visual detail");
    });

    it("returns default role for empty strings", () => {
      const service = createService();
      const result = service.detectVideoPhraseRole("", "", "", "");
      expect(result).toBe("general visual detail");
    });

    it("returns default role for whitespace-only highlighted text with no category", () => {
      const service = createService();
      const result = service.detectVideoPhraseRole("   ", null, null, null);
      expect(result).toBe("general visual detail");
    });

    it("returns default role when no patterns match any input", () => {
      const service = createService();
      const result = service.detectVideoPhraseRole(
        "xyzzy",
        "unrelated context",
        "more unrelated",
        null,
      );
      expect(result).toBe("general visual detail");
    });

    it("returns default when explicit category does not match any pattern", () => {
      const service = createService();
      const result = service.detectVideoPhraseRole(
        "some text",
        null,
        null,
        "completely_unknown_category",
      );
      // Falls through explicit category mapping, then tries context mapping
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // EDGE CASES (~30%)
  // ===========================================================================
  describe("edge cases", () => {
    it("explicit category takes priority over context-based detection", () => {
      const service = createService();
      // Context suggests camera, but explicit category says lighting
      const result = service.detectVideoPhraseRole(
        "some pan shot",
        "camera tracking",
        "with lens flare",
        "lighting",
      );
      expect(result).toContain("lighting");
    });

    it("context-based detection works when explicit category is null", () => {
      const service = createService();
      // Use context that matches lighting pattern but not subject/character
      const result = service.detectVideoPhraseRole(
        "warm glow",
        "the illumination has",
        "across the wall",
        null,
      );
      expect(result).toContain("lighting");
    });

    it("context pattern detection works when combined context has keywords", () => {
      const service = createService();
      // Use context that matches camera pattern without triggering location
      const result = service.detectVideoPhraseRole(
        "gentle movement",
        "the lens begins to",
        "with focus shift",
        null,
      );
      expect(result).toContain("camera");
    });

    it("normalizes explicit category to lowercase before matching", () => {
      const service = createService();
      const result = service.detectVideoPhraseRole(
        "some text",
        null,
        null,
        "LIGHTING",
      );
      expect(result).toContain("lighting");
    });
  });

  // ===========================================================================
  // CORE BEHAVIOR - CATEGORY MAPPING (~20%)
  // ===========================================================================
  describe("explicit category mapping", () => {
    it('maps "subject" category to subject role', () => {
      const service = createService();
      const result = service.detectVideoPhraseRole(
        "a young woman",
        null,
        null,
        "subject",
      );
      expect(result).toContain("subject");
    });

    it('maps "subject.identity" category to subject role', () => {
      const service = createService();
      const result = service.detectVideoPhraseRole(
        "the hero",
        null,
        null,
        "subject.identity",
      );
      expect(result).toContain("subject");
    });

    it('maps "camera" category to camera role', () => {
      const service = createService();
      const result = service.detectVideoPhraseRole(
        "dolly in",
        null,
        null,
        "camera",
      );
      expect(result).toContain("camera");
    });

    it('maps "lighting" category to lighting role', () => {
      const service = createService();
      const result = service.detectVideoPhraseRole(
        "soft glow",
        null,
        null,
        "lighting",
      );
      expect(result).toContain("lighting");
    });

    it('maps "environment.location" category to location role', () => {
      const service = createService();
      const result = service.detectVideoPhraseRole(
        "dark alley",
        null,
        null,
        "environment.location",
      );
      expect(result).toContain("location");
    });

    it('maps "environment" category to location role', () => {
      const service = createService();
      const result = service.detectVideoPhraseRole(
        "rainy streets",
        null,
        null,
        "environment",
      );
      expect(result).toContain("location");
    });

    it('maps "style" category to style role', () => {
      const service = createService();
      const result = service.detectVideoPhraseRole(
        "film noir",
        null,
        null,
        "style",
      );
      expect(result).toContain("style");
    });

    it('maps "audio" category to audio role', () => {
      const service = createService();
      const result = service.detectVideoPhraseRole(
        "orchestral",
        null,
        null,
        "audio",
      );
      expect(result).toContain("audio");
    });

    it('maps "action" category to action/movement role', () => {
      const service = createService();
      const result = service.detectVideoPhraseRole(
        "running fast",
        null,
        null,
        "action",
      );
      expect(result).toContain("movement");
    });

    it('maps "subject.wardrobe" category to wardrobe role', () => {
      const service = createService();
      const result = service.detectVideoPhraseRole(
        "red jacket",
        null,
        null,
        "subject.wardrobe",
      );
      expect(result).toContain("wardrobe");
    });
  });

  describe("context pattern detection", () => {
    it("detects location from context keywords", () => {
      const service = createService();
      const result = service.detectVideoPhraseRole(
        "dark forest",
        "the setting is a",
        "",
        null,
      );
      expect(result).toContain("location");
    });

    it("detects camera from context keywords", () => {
      const service = createService();
      // Use context without words that match environment/location patterns
      const result = service.detectVideoPhraseRole(
        "slowly moves",
        "the lens tracks",
        "the main element",
        null,
      );
      expect(result).toContain("camera");
    });

    it("detects lighting from context keywords", () => {
      const service = createService();
      const result = service.detectVideoPhraseRole(
        "warm tones",
        "the lighting",
        "creates depth",
        null,
      );
      expect(result).toContain("lighting");
    });

    it("detects character from context keywords", () => {
      const service = createService();
      const result = service.detectVideoPhraseRole(
        "tall",
        "the character is",
        "standing alone",
        null,
      );
      expect(result).toContain("subject");
    });

    it("detects style from context keywords", () => {
      const service = createService();
      const result = service.detectVideoPhraseRole(
        "desaturated",
        "in a style",
        "reminiscent of old cinema",
        null,
      );
      expect(result).toContain("style");
    });

    it("detects audio from context keywords", () => {
      const service = createService();
      // Use context that matches audio pattern without triggering other pattern categories
      const result = service.detectVideoPhraseRole(
        "dramatic strings",
        "the soundtrack begins",
        "to crescendo",
        null,
      );
      expect(result).toContain("audio");
    });
  });
});
