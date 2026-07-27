import { describe, expect, it } from "vitest";

import { RelaxedF1Evaluator } from "@llm/span-labeling/evaluation/RelaxedF1Evaluator";

const evaluator = new RelaxedF1Evaluator();

describe("RelaxedF1Evaluator", () => {
  it("returns 0 IoU for invalid span inputs", () => {
    expect(
      evaluator.calculateIoU(
        { start: Number.NaN, end: 1 },
        { start: 0, end: 1 },
      ),
    ).toBe(0);
    expect(evaluator.calculateIoU({ start: 0, end: 1 }, { start: 0 })).toBe(0);
  });

  it("calculates intersection over union for overlapping spans", () => {
    const iou = evaluator.calculateIoU(
      { start: 0, end: 4 },
      { start: 2, end: 6 },
    );
    expect(iou).toBeCloseTo(2 / 6, 4);
  });

  it("treats role mismatches as non-matches in relaxed F1", () => {
    const result = evaluator.evaluateSpans(
      [{ start: 0, end: 4, role: "subject" }],
      [{ start: 1, end: 5, role: "action" }],
      0.2,
    );

    expect(result.truePositives).toBe(0);
    expect(result.falsePositives).toBe(1);
    expect(result.falseNegatives).toBe(1);
    expect(result.f1).toBe(0);
  });

  it("calculates fragmentation when a ground-truth span splits into multiple predictions", () => {
    const result = evaluator.calculateFragmentationRate(
      [
        { start: 0, end: 4, role: "action.movement", text: "run" },
        { start: 5, end: 9, role: "action.movement", text: "jump" },
      ],
      [{ start: 0, end: 9, role: "action.movement", text: "run jump" }],
      0.1,
      true,
    );

    expect(result.fragmentedCount).toBe(1);
    expect(result.rate).toBe(1);
    expect(result.examples[0]?.fragments).toHaveLength(2);
  });

  it("computes over-extraction for unmatched predictions", () => {
    const result = evaluator.calculateOverExtractionRate(
      [{ start: 0, end: 4, role: "style.aesthetic", text: "noir" }],
      [{ start: 10, end: 14, role: "style.aesthetic", text: "bright" }],
      0.5,
    );

    expect(result.spuriousCount).toBe(1);
    expect(result.rate).toBe(1);
  });

  it("updates confusion matrix with missed and spurious spans", () => {
    const matrix = evaluator.updateConfusionMatrix(
      {},
      [
        { start: 0, end: 4, role: "subject.identity", text: "cat" },
        { start: 10, end: 14, role: "style.aesthetic", text: "noir" },
      ],
      [{ start: 0, end: 4, role: "subject.identity", text: "cat" }],
      0.5,
    );

    expect(matrix["subject.identity"]?.["subject.identity"]).toBe(1);
    expect(matrix["<spurious>"]?.["style.aesthetic"]).toBe(1);
  });

  it("calculates taxonomy accuracy over spatial matches", () => {
    const result = evaluator.evaluateTaxonomyAccuracy(
      [{ start: 0, end: 4, role: "subject.identity", text: "cat" }],
      [{ start: 0, end: 4, role: "action.movement", text: "cat" }],
      0.5,
    );

    expect(result.total).toBe(1);
    expect(result.correct).toBe(0);
    expect(result.accuracy).toBe(0);
  });
});

describe("RelaxedF1Evaluator typed metrics", () => {
  it("reports the same F1 whether or not spans carry extra fields", () => {
    const base = evaluator.evaluateSpans(
      [{ start: 0, end: 3, role: "style.aesthetic", text: "noir" }],
      [{ start: 0, end: 3, role: "style.aesthetic", text: "noir" }],
    );
    const withConfidence = evaluator.evaluateSpans(
      [
        {
          start: 0,
          end: 3,
          role: "style.aesthetic",
          text: "noir",
          confidence: 0.8,
        },
      ],
      [
        {
          start: 0,
          end: 3,
          role: "style.aesthetic",
          text: "noir",
          confidence: 0.8,
        },
      ],
    );

    expect(withConfidence.f1).toBe(base.f1);
    expect(withConfidence.truePositives).toBe(base.truePositives);
  });
});
