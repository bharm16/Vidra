import { describe, expect, it } from "vitest";

import {
  averageReports,
  baselineModelMismatch,
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
            f1: 0.65, // -0.15, exceeds 0.6/sqrt(30) = 0.11 for 30 spans
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
        current: 0.65,
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

function report(f1: number, lighting: number, extra?: string): EvaluationReport {
  return {
    summary: { relaxedF1: f1, precision: f1, recall: f1, taxonomyAccuracy: f1 },
    byCategory: {
      "lighting.source": { f1: lighting, precision: lighting, recall: lighting, support: 21 },
      ...(extra ? { [extra]: { f1: 0.5, precision: 0.5, recall: 0.5, support: 1 } } : {}),
    },
  };
}

describe("averageReports", () => {
  it("averages summary and per-category metrics across runs", () => {
    const averaged = averageReports([report(0.69, 0.615), report(0.7, 0.677), report(0.71, 0.646)]);

    expect(averaged.summary.relaxedF1).toBeCloseTo(0.7);
    expect(averaged.byCategory["lighting.source"]?.f1).toBeCloseTo(0.646);
    expect(averaged.byCategory["lighting.source"]?.support).toBe(21);
  });

  it("averages a category over only the runs it appears in", () => {
    const averaged = averageReports([report(0.7, 0.6, "audio.ambient"), report(0.7, 0.6)]);
    expect(averaged.byCategory["audio.ambient"]?.f1).toBe(0.5);
  });

  it("refuses an empty list", () => {
    expect(() => averageReports([])).toThrow();
  });
});

describe("baselineModelMismatch", () => {
  const baseline = buildBaseline(report(0.7, 0.6), { provider: "groq", model: "openai/gpt-oss-20b", runs: 3 });

  it("records the model and run count it was blessed with", () => {
    expect(baseline).toMatchObject({ provider: "groq", model: "openai/gpt-oss-20b", runs: 3 });
  });

  it("accepts the same model and rejects another", () => {
    expect(baselineModelMismatch(baseline, "openai/gpt-oss-20b")).toBeUndefined();
    expect(baselineModelMismatch(baseline, "llama-3.1-8b-instant")).toMatch(/blessed on openai\/gpt-oss-20b/);
  });

  it("can't judge a baseline that never recorded a model", () => {
    const legacy = buildBaseline(report(0.7, 0.6), { provider: "groq" });
    expect(baselineModelMismatch(legacy, "anything")).toBeUndefined();
  });
});

describe("per-category tolerance scales with support", () => {
  const baselineOf = (f1: number, support: number) =>
    buildBaseline(
      { summary: { relaxedF1: 0.7, precision: 0.7, recall: 0.7, taxonomyAccuracy: 0.85 }, byCategory: { "subject.wardrobe": { f1, precision: f1, recall: f1, support } } },
      { provider: "groq", model: "m" },
    );
  const current = (f1: number, support: number): EvaluationReport => ({
    summary: { relaxedF1: 0.7, precision: 0.7, recall: 0.7, taxonomyAccuracy: 0.85 },
    byCategory: { "subject.wardrobe": { f1, precision: f1, recall: f1, support } },
  });

  it("lets a 7-span category move by noise but fails a collapse", () => {
    expect(compareToBaseline(current(0.62, 7), baselineOf(0.73, 7)).passed).toBe(true);
    expect(compareToBaseline(current(0.4, 7), baselineOf(0.73, 7)).passed).toBe(false);
  });

  it("keeps large categories near the 0.05 floor", () => {
    const gate = compareToBaseline(current(0.83, 100), baselineOf(0.9, 100));
    expect(gate.passed).toBe(false);
    expect(gate.regressions[0]?.tolerance).toBeCloseTo(0.06);
  });
});
