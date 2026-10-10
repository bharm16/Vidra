import { describe, it, expect } from "vitest";
import { extractBasicHeuristics } from "@services/video-prompt-analysis/services/analysis/HeuristicIrExtractor";
import { createEmptyIR } from "@services/video-prompt-analysis/services/analysis/IrFactory";
import type { VideoPromptIR } from "@services/video-prompt-analysis/types";

function extractFromText(text: string): VideoPromptIR {
  const ir = createEmptyIR(text);
  extractBasicHeuristics(text, ir);
  return ir;
}

describe("HeuristicIrExtractor - extractBasicHeuristics", () => {
  // ===========================================================================
  // ERROR HANDLING & EDGE CASES (~50%)
  // ===========================================================================
  describe("error handling and edge cases", () => {
    it("does not add duplicate camera movements when text repeats", () => {
      const ir = extractFromText("pan left and then pan left again");
      const panLeftCount = ir.camera.movements.filter(
        (m) => m === "pan left",
      ).length;
      expect(panLeftCount).toBe(1);
    });

    it("does not add duplicate subjects when mentioned multiple times", () => {
      const ir = extractFromText(
        "a man sees another man walking toward the man",
      );
      const manCount = ir.subjects.filter(
        (s) => s.text.toLowerCase() === "man",
      ).length;
      expect(manCount).toBe(1);
    });

    it("preserves existing IR data when adding new findings", () => {
      const ir = createEmptyIR("some text");
      ir.subjects.push({ text: "existing subject", attributes: [] });
      ir.camera.shotType = "existing shot";
      extractBasicHeuristics("a woman running in neon light", ir);
      // Should keep existing and add new
      expect(ir.subjects.some((s) => s.text === "existing subject")).toBe(true);
      expect(ir.subjects.some((s) => s.text === "woman")).toBe(true);
      expect(ir.camera.shotType).toBe("existing shot"); // not overwritten
    });
  });

  // ===========================================================================
  // CAMERA EXTRACTION (~15%)
  // ===========================================================================
  describe("camera extraction", () => {
    it("extracts specific compound movements like dolly in", () => {
      const ir = extractFromText("dolly in on the face of the subject");
      expect(ir.camera.movements).toContain("dolly in");
    });

    it("prioritizes longer shot type matches (extreme close up over close up)", () => {
      const ir = extractFromText("An extreme close up of the eye");
      expect(ir.camera.shotType).toBe("extreme close-up");
    });

    it("extracts birds eye view angle", () => {
      const ir = extractFromText("bird's eye view of the city");
      expect(ir.camera.angle).toBe("bird's eye view");
    });
  });

  // ===========================================================================
  // ENVIRONMENT EXTRACTION (~10%)
  // ===========================================================================
  describe("environment extraction", () => {
    it("extracts lighting terms", () => {
      const ir = extractFromText("Scene lit by golden hour sunlight");
      expect(ir.environment.lighting).toContain("golden hour");
      expect(ir.environment.lighting).toContain("sunlight");
    });

    it("extracts weather conditions", () => {
      const ir = extractFromText("A foggy morning in the valley");
      expect(ir.environment.weather).toBe("foggy");
    });

    it("extracts setting from prepositional phrases", () => {
      const ir = extractFromText("in a dark alley at midnight");
      expect(ir.environment.setting).toContain("dark alley");
    });

    it("does not set non-setting words as setting", () => {
      const ir = extractFromText("in the morning light");
      // "morning" is in the nonSettings list, should not be used
      expect(ir.environment.setting).not.toBe("morning");
    });
  });

  // ===========================================================================
  // SUBJECT & ACTION EXTRACTION (~15%)
  // ===========================================================================
  describe("subject extraction", () => {
    it("does not add camera/style terms as NLP-fallback subjects", () => {
      const ir = extractFromText(
        "wide angle shot with vintage style rendering",
      );
      // These contain "shot", "view", "angle", "style", "render" - all filtered
      const hasFilteredTerm = ir.subjects.some(
        (s) =>
          s.text.includes("shot") ||
          s.text.includes("view") ||
          s.text.includes("angle") ||
          s.text.includes("style") ||
          s.text.includes("render"),
      );
      expect(hasFilteredTerm).toBe(false);
    });
  });

  describe("action extraction", () => {
    it("extracts multiple actions", () => {
      const ir = extractFromText("running and jumping over obstacles");
      expect(ir.actions).toContain("running");
      expect(ir.actions).toContain("jumping");
    });
  });

  // ===========================================================================
  // STYLE EXTRACTION (~10%)
  // ===========================================================================
  describe("style extraction", () => {
    it("extracts multiple style keywords", () => {
      const ir = extractFromText("noir vintage aesthetic");
      expect(ir.meta.style).toContain("noir");
      expect(ir.meta.style).toContain("vintage");
    });
  });
});
