import { describe, expect, it } from "vitest";

import {
  buildBaseline,
  compareToBaseline,
  formatGateResult,
  type Baseline,
  type EvaluationReport,
} from "@scripts/evaluation/baseline-gate";

function makeReport(
  overrides: Partial<EvaluationReport> = {},
): EvaluationReport {
  return {
    summary: {
      relaxedF1: 0.85,
      precision: 0.83,
      recall: 0.87,
      taxonomyAccuracy: 0.92,
    },
    byCategory: {
      "subject.identity": {
        f1: 0.9,
        precision: 0.88,
        recall: 0.92,
        support: 50,
      },
      "camera.movement": {
        f1: 0.8,
        precision: 0.78,
        recall: 0.82,
        support: 30,
      },
      "lighting.quality": {
        f1: 0.85,
        precision: 0.83,
        recall: 0.87,
        support: 20,
      },
    },
    ...overrides,
  };
}

function makeBaseline(report: EvaluationReport = makeReport()): Baseline {
  return buildBaseline(report, { provider: "groq", commit: "abc123" });
}

describe("compareToBaseline", () => {
  describe("happy path", () => {
    it("passes when drop is within tolerance", () => {
      const baseline = makeBaseline();
      const slightlyWorse = makeReport({
        summary: {
          relaxedF1: 0.84, // -0.01, within default 0.02 tolerance
          precision: 0.82,
          recall: 0.86,
          taxonomyAccuracy: 0.91,
        },
      });

      const result = compareToBaseline(slightlyWorse, baseline);
      expect(result.passed).toBe(true);
    });
  });

  describe("overall F1 regression", () => {
    it("flags a drop greater than tolerance", () => {
      const baseline = makeBaseline();
      const regressed = makeReport({
        summary: {
          relaxedF1: 0.8, // -0.05, exceeds default 0.02
          precision: 0.78,
          recall: 0.82,
          taxonomyAccuracy: 0.92,
        },
      });

      const result = compareToBaseline(regressed, baseline);
      expect(result.passed).toBe(false);
      expect(result.regressions).toHaveLength(1);
      expect(result.regressions[0]).toMatchObject({
        kind: "overall_f1",
        scope: "overall",
        baseline: 0.85,
        current: 0.8,
      });
    });

    it("respects custom tolerance", () => {
      const baseline = makeBaseline();
      const regressed = makeReport({
        summary: {
          relaxedF1: 0.8,
          precision: 0.78,
          recall: 0.82,
          taxonomyAccuracy: 0.92,
        },
      });

      // With looser tolerance (0.10), the same drop now passes
      const result = compareToBaseline(regressed, baseline, {
        overallF1Tolerance: 0.1,
      });
      expect(result.passed).toBe(true);
    });
  });

  describe("per-category F1 regression", () => {
    it("flags a category drop exceeding per-category tolerance", () => {
      const baseline = makeBaseline();
      const regressed = makeReport({
        byCategory: {
          "subject.identity": {
            f1: 0.9,
            precision: 0.88,
            recall: 0.92,
            support: 50,
          },
          "camera.movement": {
            f1: 0.7, // -0.10, exceeds default 0.05 per-category tolerance
            precision: 0.68,
            recall: 0.72,
            support: 30,
          },
          "lighting.quality": {
            f1: 0.85,
            precision: 0.83,
            recall: 0.87,
            support: 20,
          },
        },
      });

      const result = compareToBaseline(regressed, baseline);
      expect(result.passed).toBe(false);

      const categoryRegression = result.regressions.find(
        (r) => r.kind === "category_f1",
      );
      expect(categoryRegression).toMatchObject({
        scope: "camera.movement",
        baseline: 0.8,
        current: 0.7,
        support: 30,
      });
    });

    it("skips categories below min-support threshold (avoids noise)", () => {
      const baseline = buildBaseline(
        {
          summary: {
            relaxedF1: 0.85,
            precision: 0.83,
            recall: 0.87,
            taxonomyAccuracy: 0.92,
          },
          byCategory: {
            // Only 3 ground-truth spans — too noisy to gate on
            "audio.score": { f1: 1.0, precision: 1.0, recall: 1.0, support: 3 },
          },
        },
        { provider: "groq" },
      );

      const regressed: EvaluationReport = {
        summary: {
          relaxedF1: 0.85,
          precision: 0.83,
          recall: 0.87,
          taxonomyAccuracy: 0.92,
        },
        byCategory: {
          "audio.score": { f1: 0.5, precision: 0.5, recall: 0.5, support: 3 },
        },
      };

      // Big drop in F1 (-0.5), but support=3 is below default minSupportForGate=5
      const result = compareToBaseline(regressed, baseline);
      expect(result.passed).toBe(true);
      expect(result.regressions).toEqual([]);
    });
  });

  describe("taxonomy accuracy regression", () => {
    it("flags a drop in taxonomy accuracy beyond tolerance", () => {
      const baseline = makeBaseline();
      const regressed = makeReport({
        summary: {
          relaxedF1: 0.85,
          precision: 0.83,
          recall: 0.87,
          taxonomyAccuracy: 0.85, // -0.07, exceeds default 0.03
        },
      });

      const result = compareToBaseline(regressed, baseline);
      expect(result.passed).toBe(false);
      const taxonomyRegression = result.regressions.find(
        (r) => r.kind === "taxonomy_accuracy",
      );
      expect(taxonomyRegression).toBeDefined();
    });
  });

  describe("category drift", () => {
    it("reports categories present in baseline but missing from current", () => {
      const baseline = makeBaseline();
      const trimmed = makeReport({
        byCategory: {
          "subject.identity": {
            f1: 0.9,
            precision: 0.88,
            recall: 0.92,
            support: 50,
          },
          // camera.movement and lighting.quality dropped from current
        },
      });

      const result = compareToBaseline(trimmed, baseline);
      expect(result.missingCategories.sort()).toEqual([
        "camera.movement",
        "lighting.quality",
      ]);
    });

    it("reports categories new in current that are not in baseline", () => {
      const baseline = makeBaseline();
      const expanded = makeReport({
        byCategory: {
          ...makeReport().byCategory,
          "audio.score": { f1: 0.7, precision: 0.7, recall: 0.7, support: 10 },
        },
      });

      const result = compareToBaseline(expanded, baseline);
      expect(result.newCategories).toEqual(["audio.score"]);
    });
  });
});

describe("formatGateResult", () => {
  it("itemizes each regression in a failed result", () => {
    const output = formatGateResult({
      passed: false,
      regressions: [
        {
          kind: "category_f1",
          scope: "camera.movement",
          baseline: 0.8,
          current: 0.7,
          delta: 0.1,
          tolerance: 0.05,
          support: 30,
        },
      ],
      missingCategories: [],
      newCategories: [],
    });

    expect(output).toContain("FAILED");
    expect(output).toContain("camera.movement");
    expect(output).toContain("support=30");
    expect(output).toContain("0.800");
    expect(output).toContain("0.700");
  });
});
