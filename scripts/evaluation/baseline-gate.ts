/**
 * Baseline regression gate for span labeling evaluation.
 *
 * Pure module: takes a current evaluation report and a previously-blessed
 * baseline, returns a pass/fail verdict with itemized regressions. No I/O,
 * no LLM calls — fully unit-testable.
 *
 * Wire this into any eval pipeline (LLM-as-judge or RelaxedF1 against the
 * golden set) by passing the report's `summary` and `byCategory` fields.
 */

export interface CategoryMetrics {
  f1: number;
  precision: number;
  recall: number;
  support: number;
}

export interface EvaluationReport {
  summary: {
    relaxedF1: number;
    precision: number;
    recall: number;
    taxonomyAccuracy: number;
  };
  byCategory: Record<string, CategoryMetrics>;
}

export interface Baseline {
  /** ISO timestamp the baseline was blessed. */
  blessedAt: string;
  /** Provider this baseline applies to (e.g., "groq", "openai"). */
  provider: string;
  /** Model the baseline was measured on. Scores from another model don't compare. */
  model?: string;
  /** How many runs were averaged into it. */
  runs?: number;
  /** Optional commit SHA for traceability. */
  commit?: string;
  summary: EvaluationReport["summary"];
  byCategory: Record<string, CategoryMetrics>;
}

export interface GateOptions {
  /**
   * Maximum allowed F1 drop (absolute, in [0,1]) for the overall metric
   * before flagging a regression. Default: 0.02 (2 percentage points).
   */
  overallF1Tolerance?: number;
  /**
   * Smallest allowed F1 drop (absolute) for any single category. Default: 0.05.
   */
  perCategoryF1Tolerance?: number;
  /**
   * A category's tolerance grows as its support shrinks:
   * max(perCategoryF1Tolerance, perCategoryNoise / sqrt(support)). Run-to-run
   * F1 noise follows ~c/sqrt(support); on gpt-oss-20b c reached 0.25
   * (2026-10-23, 6 runs), and 0.6 is about 3 standard deviations of the gap
   * between two 3-run averages (the eval now averages 5). A 7-span category then allows 0.23, a 50-span one
   * 0.08, and a broken category still fails. Default: 0.6.
   */
  perCategoryNoise?: number;
  /**
   * Categories with support < this threshold are skipped to avoid noise
   * from rare labels. Default: 5.
   */
  minSupportForGate?: number;
  /**
   * Maximum allowed drop in taxonomy accuracy. Default: 0.03.
   */
  taxonomyAccuracyTolerance?: number;
}

export interface Regression {
  kind: "overall_f1" | "category_f1" | "taxonomy_accuracy";
  /** Category id, or "overall" for non-category regressions. */
  scope: string;
  baseline: number;
  current: number;
  delta: number;
  /** Configured tolerance the delta exceeded. */
  tolerance: number;
  /** Sample size the comparison is based on (categories only). */
  support?: number;
}

export interface GateResult {
  passed: boolean;
  regressions: Regression[];
  /** Categories present in baseline but missing from current report. */
  missingCategories: string[];
  /** Categories present in current report but new since baseline. */
  newCategories: string[];
}

const DEFAULTS: Required<GateOptions> = {
  overallF1Tolerance: 0.02,
  perCategoryF1Tolerance: 0.05,
  perCategoryNoise: 0.6,
  minSupportForGate: 5,
  taxonomyAccuracyTolerance: 0.03,
};

/**
 * Compare a current evaluation report against a baseline. Returns pass/fail
 * with itemized regressions for each metric that breached its tolerance.
 *
 * Design notes:
 * - Asymmetric tolerance: drops are regressions, gains are not. We never
 *   "regress" because the model got better.
 * - Per-category gate uses absolute F1 delta, not relative. A drop from 0.95
 *   to 0.90 is a regression even though it's only ~5% relative.
 * - Low-support categories are skipped — a single misclassification on a
 *   3-span category swings F1 by 33%, which is statistical noise.
 */
export function compareToBaseline(
  current: EvaluationReport,
  baseline: Baseline,
  options: GateOptions = {},
): GateResult {
  const opts: Required<GateOptions> = { ...DEFAULTS, ...options };
  const regressions: Regression[] = [];

  // Overall F1 gate
  {
    const baselineF1 = baseline.summary.relaxedF1;
    const currentF1 = current.summary.relaxedF1;
    const delta = baselineF1 - currentF1;
    if (delta > opts.overallF1Tolerance) {
      regressions.push({
        kind: "overall_f1",
        scope: "overall",
        baseline: baselineF1,
        current: currentF1,
        delta,
        tolerance: opts.overallF1Tolerance,
      });
    }
  }

  // Taxonomy accuracy gate
  {
    const baselineAcc = baseline.summary.taxonomyAccuracy;
    const currentAcc = current.summary.taxonomyAccuracy;
    const delta = baselineAcc - currentAcc;
    if (delta > opts.taxonomyAccuracyTolerance) {
      regressions.push({
        kind: "taxonomy_accuracy",
        scope: "overall",
        baseline: baselineAcc,
        current: currentAcc,
        delta,
        tolerance: opts.taxonomyAccuracyTolerance,
      });
    }
  }

  // Per-category gates
  const baselineCategories = Object.keys(baseline.byCategory);
  const currentCategories = Object.keys(current.byCategory);
  const missingCategories: string[] = [];
  const newCategories = currentCategories.filter(
    (c) => !(c in baseline.byCategory),
  );

  for (const category of baselineCategories) {
    const baselineMetrics = baseline.byCategory[category];
    const currentMetrics = current.byCategory[category];

    if (!currentMetrics) {
      missingCategories.push(category);
      continue;
    }

    if (!baselineMetrics) continue; // type narrowing

    // Skip low-support categories — too noisy for a hard gate.
    if (baselineMetrics.support < opts.minSupportForGate) continue;

    const delta = baselineMetrics.f1 - currentMetrics.f1;
    const tolerance = Math.max(
      opts.perCategoryF1Tolerance,
      opts.perCategoryNoise / Math.sqrt(baselineMetrics.support),
    );
    if (delta > tolerance) {
      regressions.push({
        kind: "category_f1",
        scope: category,
        baseline: baselineMetrics.f1,
        current: currentMetrics.f1,
        delta,
        tolerance,
        support: baselineMetrics.support,
      });
    }
  }

  return {
    passed: regressions.length === 0,
    regressions,
    missingCategories,
    newCategories,
  };
}

/**
 * Format a gate result as a human-readable report. Designed for CI logs
 * where a developer needs to immediately understand what regressed.
 */
export function formatGateResult(result: GateResult): string {
  const lines: string[] = [];

  if (result.passed) {
    lines.push("✅ Span labeling regression gate: PASSED");
  } else {
    lines.push("❌ Span labeling regression gate: FAILED");
    lines.push("");
    lines.push(`Regressions (${result.regressions.length}):`);
    for (const r of result.regressions) {
      const baselineStr = r.baseline.toFixed(3);
      const currentStr = r.current.toFixed(3);
      const deltaStr = `-${r.delta.toFixed(3)}`;
      const supportStr =
        r.support !== undefined ? ` (support=${r.support})` : "";
      lines.push(
        `  • ${r.kind} [${r.scope}]${supportStr}: ${baselineStr} → ${currentStr} (${deltaStr}, tolerance=${r.tolerance.toFixed(3)})`,
      );
    }
  }

  if (result.missingCategories.length > 0) {
    lines.push("");
    lines.push(
      `⚠ Categories in baseline but missing from current report: ${result.missingCategories.join(", ")}`,
    );
  }

  if (result.newCategories.length > 0) {
    lines.push("");
    lines.push(
      `ℹ New categories not in baseline (re-bless required): ${result.newCategories.join(", ")}`,
    );
  }

  return lines.join("\n");
}

/**
 * Build a Baseline from a freshly-computed evaluation report. Used when
 * blessing new numbers (e.g., after an intentional model upgrade).
 */
export function buildBaseline(
  report: EvaluationReport,
  meta: { provider: string; model?: string; runs?: number; commit?: string },
): Baseline {
  return {
    blessedAt: new Date().toISOString(),
    provider: meta.provider,
    ...(meta.model !== undefined && { model: meta.model }),
    ...(meta.runs !== undefined && { runs: meta.runs }),
    ...(meta.commit !== undefined && { commit: meta.commit }),
    summary: report.summary,
    byCategory: report.byCategory,
  };
}

/**
 * The mean of several runs' reports. One LLM run is one noisy sample: on the
 * 67-prompt golden set a ~20-span category moves by ~0.06 F1 between identical
 * runs, more than the per-category tolerance. Averaging N runs narrows that by
 * about sqrt(N). A category missing from a run (no gold and no prediction
 * there) is averaged over the runs it appears in.
 */
export function averageReports(reports: EvaluationReport[]): EvaluationReport {
  if (reports.length === 0) throw new Error("averageReports needs at least one report");
  const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
  const categories = new Set(reports.flatMap((report) => Object.keys(report.byCategory)));
  const byCategory: Record<string, CategoryMetrics> = {};
  for (const category of categories) {
    const present = reports.flatMap((report) => (report.byCategory[category] ? [report.byCategory[category]] : []));
    byCategory[category] = {
      f1: mean(present.map((metrics) => metrics.f1)),
      precision: mean(present.map((metrics) => metrics.precision)),
      recall: mean(present.map((metrics) => metrics.recall)),
      support: Math.max(...present.map((metrics) => metrics.support)),
    };
  }
  return {
    summary: {
      relaxedF1: mean(reports.map((report) => report.summary.relaxedF1)),
      precision: mean(reports.map((report) => report.summary.precision)),
      recall: mean(reports.map((report) => report.summary.recall)),
      taxonomyAccuracy: mean(reports.map((report) => report.summary.taxonomyAccuracy)),
    },
    byCategory,
  };
}

/**
 * Why this baseline can't judge a run on `model`, or undefined when it can.
 * A baseline that records no model is accepted with a warning by the caller.
 */
export function baselineModelMismatch(baseline: Baseline, model: string): string | undefined {
  if (baseline.model === undefined || baseline.model === model) return undefined;
  return `Baseline was blessed on ${baseline.model}, but this run uses ${model}. Scores from different models don't compare: re-bless with --bless after reviewing the change.`;
}
