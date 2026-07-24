import { describe, it, expect } from "vitest";
import { validateDecisionReferences } from "../validateDecision";
import type { StudioDecision } from "../types";

const IMAGES = new Set(["img-1", "img-2"]);

const editDecision = (sourceImageIds: string[]): StudioDecision => ({
  action: "edit",
  instruction: "make it bolder",
  sourceImageIds,
  suggestions: ["a", "b", "c"],
});

describe("validateDecisionReferences", () => {
  it("accepts an edit whose sources all exist in the project", () => {
    expect(validateDecisionReferences(editDecision(["img-1"]), IMAGES)).toEqual(
      { ok: true },
    );
  });

  it("rejects an edit referencing an image from outside the project", () => {
    const result = validateDecisionReferences(
      editDecision(["img-1", "img-999"]),
      IMAGES,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("img-999");
  });

  it("rejects an empty sourceImageIds array", () => {
    expect(validateDecisionReferences(editDecision([]), IMAGES).ok).toBe(false);
  });

  it("rejects more than 14 source images", () => {
    const ids = Array.from({ length: 15 }, () => "img-1");
    expect(validateDecisionReferences(editDecision(ids), IMAGES).ok).toBe(
      false,
    );
  });

  it("rejects a transform on a foreign image", () => {
    const decision: StudioDecision = {
      action: "transform",
      operation: "remove_background",
      sourceImageId: "img-999",
      suggestions: ["a", "b", "c"],
    };
    expect(validateDecisionReferences(decision, IMAGES).ok).toBe(false);
  });

  it("caps clarify at 2 questions", () => {
    const decision: StudioDecision = {
      action: "clarify",
      questions: [
        { text: "q1", quickPicks: [] },
        { text: "q2", quickPicks: [] },
        { text: "q3", quickPicks: [] },
      ],
    };
    expect(validateDecisionReferences(decision, IMAGES).ok).toBe(false);
  });

  it("passes generate decisions through untouched", () => {
    const decision: StudioDecision = {
      action: "generate",
      basePrompt: "p",
      variants: ["a", "b", "c", "d"],
      capability: "design",
      suggestions: ["a", "b", "c"],
    };
    expect(validateDecisionReferences(decision, IMAGES)).toEqual({ ok: true });
  });
});
