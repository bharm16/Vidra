import { describe, it, expect } from "vitest";
import { SectionDetectionService } from "@services/video-prompt-analysis/services/detection/SectionDetectionService";

function createService(): SectionDetectionService {
  return new SectionDetectionService();
}

describe("SectionDetectionService", () => {
  // ===========================================================================
  // ERROR HANDLING & INVALID INPUT (~50%)
  // ===========================================================================
  describe("error handling - detectSection", () => {
    it("defaults to main_prompt when highlight not found and no strong signals", () => {
      const service = createService();
      // When all scores are 0, main_prompt is the default
      // But position scoring may give non-zero scores; the highlight must be at the start
      // to avoid middle-position bonus for technical_specs
      const result = service.detectSection("xyz", "xyz unrelated", "");
      // Position < 0.3 = early = +1 for main_prompt
      expect(result).toBe("main_prompt");
    });
  });

  describe("error handling - getSectionConstraints", () => {
    it("returns null for unknown section name", () => {
      const service = createService();
      expect(service.getSectionConstraints("nonexistent_section")).toBeNull();
    });
  });

  describe("error handling - getSectionGuidance", () => {
    it("returns empty array for unknown section", () => {
      const service = createService();
      expect(service.getSectionGuidance("unknown", "camera")).toEqual([]);
    });
  });

  // ===========================================================================
  // EDGE CASES (~30%)
  // ===========================================================================
  describe("edge cases", () => {
    it("header in contextBefore is strong signal (10 points) vs header in prompt (3 points)", () => {
      const service = createService();
      // "technical specs" in contextBefore should strongly signal technical_specs
      const result = service.detectSection(
        "duration: 5s",
        "scene description\ntechnical specs\nduration: 5s",
        "technical specs",
      );
      expect(result).toBe("technical_specs");
    });
  });

  // ===========================================================================
  // CORE BEHAVIOR (~20%)
  // ===========================================================================
  describe("section detection", () => {
    it("detects alternatives from header keyword", () => {
      const service = createService();
      const result = service.detectSection(
        "different angle",
        "main scene\nalternative approaches\ndifferent angle",
        "alternative approaches",
      );
      expect(result).toBe("alternatives");
    });

    it("detects style_direction from header keyword", () => {
      const service = createService();
      const result = service.detectSection(
        "film noir",
        "scene text\nvisual style\nfilm noir aesthetic",
        "visual style",
      );
      expect(result).toBe("style_direction");
    });
  });

  describe("getSectionGuidance", () => {
    it("returns narrative guidance for main_prompt", () => {
      const service = createService();
      const guidance = service.getSectionGuidance("main_prompt", "general");
      expect(guidance.length).toBeGreaterThan(0);
      expect(guidance.some((g) => g.includes("descriptive"))).toBe(true);
    });

    it("returns technical guidance for technical_specs with camera category", () => {
      const service = createService();
      const guidance = service.getSectionGuidance("technical_specs", "camera");
      expect(guidance.length).toBeGreaterThan(0);
      expect(
        guidance.some((g) => g.includes("lens") || g.includes("aperture")),
      ).toBe(true);
    });

    it("returns lighting guidance for technical_specs with lighting category", () => {
      const service = createService();
      const guidance = service.getSectionGuidance(
        "technical_specs",
        "lighting",
      );
      expect(guidance.length).toBeGreaterThan(0);
      expect(guidance.some((g) => g.includes("color temp"))).toBe(true);
    });

    it("returns action-specific guidance for main_prompt with action category", () => {
      const service = createService();
      const guidance = service.getSectionGuidance("main_prompt", "action");
      expect(guidance.some((g) => g.includes("cinematic detail"))).toBe(true);
    });

    it("returns alternatives guidance for alternatives section", () => {
      const service = createService();
      const guidance = service.getSectionGuidance("alternatives", "general");
      expect(
        guidance.some((g) => g.includes("different creative directions")),
      ).toBe(true);
    });

    it("returns style-specific guidance for style_direction with style category", () => {
      const service = createService();
      const guidance = service.getSectionGuidance("style_direction", "style");
      expect(
        guidance.some((g) => g.includes("noir") || g.includes("surrealism")),
      ).toBe(true);
    });
  });
});
