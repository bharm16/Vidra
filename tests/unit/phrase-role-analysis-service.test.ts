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
  });

  // ===========================================================================
  // CORE BEHAVIOR - CATEGORY MAPPING (~20%)
  // ===========================================================================
  describe("explicit category mapping", () => {
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
