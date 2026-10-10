import { describe, expect, it } from "vitest";
import { ConstraintGenerationService } from "../ConstraintGenerationService";

describe("ConstraintGenerationService grammar-aware routing regression", () => {
  const service = new ConstraintGenerationService();

  it("routes action.movement spans to verb mode", () => {
    const result = service.getVideoReplacementConstraints({
      highlightWordCount: 2,
      highlightedText: "swaying gently",
      highlightedCategory: "action.movement",
      highlightedCategoryConfidence: 0.8,
    });

    expect(result.mode).toBe("verb");
    expect(result.formRequirement).toContain("verb phrase");
  });

  it("routes very-short style spans to adjective mode", () => {
    const result = service.getVideoReplacementConstraints({
      highlightWordCount: 1,
      highlightedText: "warm",
      highlightedCategory: "style.aesthetic",
      highlightedCategoryConfidence: 0.6,
    });

    expect(result.mode).toBe("adjective");
    expect(result.formRequirement).toContain("adjective");
  });

  it("routes longer style spans to style mode (not adjective)", () => {
    const result = service.getVideoReplacementConstraints({
      highlightWordCount: 5,
      highlightedText: "cinematic golden hour look",
      highlightedCategory: "style.aesthetic",
      highlightedCategoryConfidence: 0.8,
    });

    expect(result.mode).toBe("style");
  });

  it("routes subject spans to micro mode (noun phrases)", () => {
    const result = service.getVideoReplacementConstraints({
      highlightWordCount: 2,
      highlightedText: "young girl",
      highlightedCategory: "subject.appearance",
      highlightedCategoryConfidence: 0.9,
    });

    expect(result.mode).toBe("micro");
  });

  // --- Short-span category routing regression (prevents highlightIsVeryShort catch-all) ---

  it("routes short lighting.quality spans to adjective mode, not micro", () => {
    const result = service.getVideoReplacementConstraints({
      highlightWordCount: 1,
      highlightedText: "Warm",
      highlightedCategory: "lighting.quality",
      highlightedCategoryConfidence: 0.8,
    });

    expect(result.mode).toBe("adjective");
    expect(result.formRequirement).toContain("adjective");
  });

  it("routes longer lighting spans to lighting mode", () => {
    const result = service.getVideoReplacementConstraints({
      highlightWordCount: 5,
      highlightedText: "warm golden hour side light",
      highlightedCategory: "lighting.source",
      highlightedCategoryConfidence: 0.85,
    });

    expect(result.mode).toBe("lighting");
  });

  it("routes short camera.angle spans to angle-only micro mode", () => {
    const result = service.getVideoReplacementConstraints({
      highlightWordCount: 2,
      highlightedText: "low angle",
      highlightedCategory: "camera.angle",
      highlightedCategoryConfidence: 0.9,
    });

    expect(result.mode).toBe("micro");
    expect(result.formRequirement).toContain(
      "camera angle or viewpoint phrase only",
    );
  });

  it("routes camera movement spans to movement-only phrase mode", () => {
    const result = service.getVideoReplacementConstraints({
      highlightWordCount: 3,
      highlightedText: "slowly zooming in",
      highlightedCategory: "camera.movement",
      highlightedCategoryConfidence: 0.9,
    });

    expect(result.mode).toBe("phrase");
    expect(result.formRequirement).toContain("camera movement phrase only");
  });

  it("routes lighting.timeOfDay spans to adjective mode with time-only constraints", () => {
    const result = service.getVideoReplacementConstraints({
      highlightWordCount: 3,
      highlightedText: "golden hour sunlight",
      highlightedCategory: "lighting.timeOfDay",
      highlightedCategoryConfidence: 0.95,
    });

    expect(result.mode).toBe("adjective");
    expect(result.formRequirement).toContain("time-of-day");
  });

  it("routes environment.context spans to in-scene phrase constraints", () => {
    const result = service.getVideoReplacementConstraints({
      highlightWordCount: 3,
      highlightedText: "car's front window",
      highlightedCategory: "environment.context",
      highlightedCategoryConfidence: 0.95,
    });

    expect(result.mode).toBe("phrase");
    expect(result.formRequirement).toContain("in-scene environmental context");
  });

  // --- Adjective mode maxWords floor regression (prevents hard filter from rejecting AI output) ---

  it("adjective mode gives maxWords >= 5 for 1-word spans", () => {
    const result = service.getVideoReplacementConstraints({
      highlightWordCount: 1,
      highlightedText: "Warm",
      highlightedCategory: "lighting.quality",
      highlightedCategoryConfidence: 0.8,
    });

    expect(result.mode).toBe("adjective");
    expect(result.maxWords).toBe(5);
  });

  it("adjective mode gives maxWords >= 5 for 2-word spans", () => {
    const result = service.getVideoReplacementConstraints({
      highlightWordCount: 2,
      highlightedText: "golden hour",
      highlightedCategory: "lighting.colorTemp",
      highlightedCategoryConfidence: 0.7,
    });

    expect(result.mode).toBe("adjective");
    expect(result.maxWords).toBe(5);
  });

  it("style adjective spans allow maxWords up to 8 for richer style phrasing", () => {
    const result = service.getVideoReplacementConstraints({
      highlightWordCount: 3,
      highlightedText: "vintage film grain",
      highlightedCategory: "style.aesthetic",
      highlightedCategoryConfidence: 0.7,
    });

    expect(result.mode).toBe("adjective");
    expect(result.maxWords).toBe(8);
  });

  it("overrides shot.type focus guidance to require different shot sizes", () => {
    const result = service.getVideoReplacementConstraints({
      highlightWordCount: 2,
      highlightedText: "medium close",
      highlightedCategory: "shot.type",
      highlightedCategoryConfidence: 0.9,
    });

    const joinedFocus = (result.focusGuidance || []).join(" | ");
    expect(result.mode).toBe("micro");
    expect(joinedFocus).toContain("DIFFERENT shot size");
    expect(joinedFocus).not.toContain("wardrobe");
  });
});
