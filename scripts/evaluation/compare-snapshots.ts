#!/usr/bin/env tsx

/**
 * Snapshot Comparison Script
 *
 * Compares current span labeling results against baseline.
 * Detects regressions and improvements.
 *
 * Usage:
 *   npx tsx scripts/evaluation/compare-snapshots.ts
 *   npx tsx scripts/evaluation/compare-snapshots.ts --current path --baseline path
 */

import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  CATEGORY_NAMES,
  SECTION_NAMES,
  type CategoryName,
  type ErrorsBySection,
  type GranularityErrorType,
  type Snapshot,
} from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SNAPSHOTS_DIR = join(__dirname, "snapshots");

interface Comparison {
  baseline: Snapshot;
  current: Snapshot;
  scoreDelta: number;
  spanCountDelta: number;
  regressions: Array<{
    promptId: string;
    input: string;
    baselineScore: number;
    currentScore: number;
    delta: number;
  }>;
  improvements: Array<{
    promptId: string;
    input: string;
    baselineScore: number;
    currentScore: number;
    delta: number;
  }>;
  newErrors: string[];
  fixedErrors: string[];
  categoryDeltas: Record<string, number>;
  categoryScoreDeltas: Record<
    CategoryName,
    { coverage: number; precision: number }
  >;
  sectionErrorRateDeltas: ErrorsBySection;
  newTaxonomyConfusions: Array<{
    assignedRole: string;
    expectedRole: string;
    count: number;
  }>;
  resolvedTaxonomyConfusions: Array<{
    assignedRole: string;
    expectedRole: string;
    count: number;
  }>;
  granularityDeltas: Record<GranularityErrorType, number>;
  newGranularityIssues: Array<{
    reason: GranularityErrorType;
    count: number;
    examples: string[];
  }>;
  resolvedGranularityIssues: Array<{
    reason: GranularityErrorType;
    count: number;
    examples: string[];
  }>;
}

function loadSnapshot(path: string): Snapshot {
  if (!existsSync(path)) {
    throw new Error(`Snapshot not found: ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf-8"));
}

function createEmptyCategoryScores(): Record<
  CategoryName,
  { coverage: number; precision: number }
> {
  return {
    shot: { coverage: 0, precision: 0 },
    subject: { coverage: 0, precision: 0 },
    action: { coverage: 0, precision: 0 },
    environment: { coverage: 0, precision: 0 },
    lighting: { coverage: 0, precision: 0 },
    camera: { coverage: 0, precision: 0 },
    style: { coverage: 0, precision: 0 },
    technical: { coverage: 0, precision: 0 },
    audio: { coverage: 0, precision: 0 },
  };
}

function createEmptyErrorsBySection(): ErrorsBySection {
  return {
    main: { falsePositives: 0, missed: 0 },
    technicalSpecs: { falsePositives: 0, missed: 0 },
    alternatives: { falsePositives: 0, missed: 0 },
  };
}

function normalizeSnapshot(snapshot: Snapshot): Snapshot {
  return {
    ...snapshot,
    summary: {
      ...snapshot.summary,
      avgCategoryScores:
        snapshot.summary.avgCategoryScores ?? createEmptyCategoryScores(),
      topTaxonomyErrors: snapshot.summary.topTaxonomyErrors ?? [],
      topGranularityErrors: snapshot.summary.topGranularityErrors ?? [],
      errorsBySection:
        snapshot.summary.errorsBySection ?? createEmptyErrorsBySection(),
    },
  };
}

function computeSectionErrorRates(snapshot: Snapshot): ErrorsBySection {
  const counts =
    snapshot.summary.errorsBySection ?? createEmptyErrorsBySection();
  const promptCount = snapshot.promptCount > 0 ? snapshot.promptCount : 0;

  const rate = (value: number) => (promptCount > 0 ? value / promptCount : 0);

  return {
    main: {
      falsePositives: rate(counts.main.falsePositives),
      missed: rate(counts.main.missed),
    },
    technicalSpecs: {
      falsePositives: rate(counts.technicalSpecs.falsePositives),
      missed: rate(counts.technicalSpecs.missed),
    },
    alternatives: {
      falsePositives: rate(counts.alternatives.falsePositives),
      missed: rate(counts.alternatives.missed),
    },
  };
}

function buildTaxonomyErrorMap(
  snapshot: Snapshot,
): Map<string, { assignedRole: string; expectedRole: string; count: number }> {
  const map = new Map<
    string,
    { assignedRole: string; expectedRole: string; count: number }
  >();
  for (const item of snapshot.summary.topTaxonomyErrors ?? []) {
    const key = `${item.assignedRole}|||${item.expectedRole}`;
    map.set(key, item);
  }
  return map;
}

function compareSnapshots(baseline: Snapshot, current: Snapshot): Comparison {
  const normalizedBaseline = normalizeSnapshot(baseline);
  const normalizedCurrent = normalizeSnapshot(current);

  // Build lookup maps
  const baselineMap = new Map(
    normalizedBaseline.results.map((r) => [r.promptId, r]),
  );
  const currentMap = new Map(
    normalizedCurrent.results.map((r) => [r.promptId, r]),
  );

  const regressions: Comparison["regressions"] = [];
  const improvements: Comparison["improvements"] = [];
  const newErrors: string[] = [];
  const fixedErrors: string[] = [];

  // Compare matching prompts
  for (const [promptId, baseResult] of baselineMap) {
    const currResult = currentMap.get(promptId);
    if (!currResult) continue;

    const baseScore = baseResult.judgeResult?.totalScore || 0;
    const currScore = currResult.judgeResult?.totalScore || 0;
    const delta = currScore - baseScore;

    if (delta <= -3) {
      regressions.push({
        promptId,
        input: baseResult.input,
        baselineScore: baseScore,
        currentScore: currScore,
        delta,
      });
    } else if (delta >= 3) {
      improvements.push({
        promptId,
        input: baseResult.input,
        baselineScore: baseScore,
        currentScore: currScore,
        delta,
      });
    }

    // Track error changes
    if (!baseResult.error && currResult.error) {
      newErrors.push(`${promptId}: ${currResult.error}`);
    } else if (baseResult.error && !currResult.error) {
      fixedErrors.push(promptId);
    }
  }

  // Sort by magnitude
  regressions.sort((a, b) => a.delta - b.delta);
  improvements.sort((a, b) => b.delta - a.delta);

  // Category-level deltas
  const categoryDeltas: Record<string, number> = {};
  const categories = [
    "coverage",
    "precision",
    "granularity",
    "taxonomy",
    "technicalSpecs",
  ];

  for (const cat of categories) {
    let baseSum = 0,
      currSum = 0,
      count = 0;

    for (const [promptId, baseResult] of baselineMap) {
      const currResult = currentMap.get(promptId);
      if (!currResult) continue;

      const baseScore = (baseResult.judgeResult?.scores as any)?.[cat] || 0;
      const currScore = (currResult.judgeResult?.scores as any)?.[cat] || 0;

      if (baseScore > 0 || currScore > 0) {
        baseSum += baseScore;
        currSum += currScore;
        count++;
      }
    }

    if (count > 0) {
      categoryDeltas[cat] = (currSum - baseSum) / count;
    }
  }

  const categoryScoreDeltas = {} as Record<
    CategoryName,
    { coverage: number; precision: number }
  >;
  for (const category of CATEGORY_NAMES) {
    const baseScores = normalizedBaseline.summary.avgCategoryScores?.[
      category
    ] || { coverage: 0, precision: 0 };
    const currScores = normalizedCurrent.summary.avgCategoryScores?.[
      category
    ] || { coverage: 0, precision: 0 };
    categoryScoreDeltas[category] = {
      coverage: currScores.coverage - baseScores.coverage,
      precision: currScores.precision - baseScores.precision,
    };
  }

  const baselineSectionRates = computeSectionErrorRates(normalizedBaseline);
  const currentSectionRates = computeSectionErrorRates(normalizedCurrent);
  const sectionErrorRateDeltas: ErrorsBySection = {
    main: {
      falsePositives:
        currentSectionRates.main.falsePositives -
        baselineSectionRates.main.falsePositives,
      missed:
        currentSectionRates.main.missed - baselineSectionRates.main.missed,
    },
    technicalSpecs: {
      falsePositives:
        currentSectionRates.technicalSpecs.falsePositives -
        baselineSectionRates.technicalSpecs.falsePositives,
      missed:
        currentSectionRates.technicalSpecs.missed -
        baselineSectionRates.technicalSpecs.missed,
    },
    alternatives: {
      falsePositives:
        currentSectionRates.alternatives.falsePositives -
        baselineSectionRates.alternatives.falsePositives,
      missed:
        currentSectionRates.alternatives.missed -
        baselineSectionRates.alternatives.missed,
    },
  };

  const baselineTaxonomyMap = buildTaxonomyErrorMap(normalizedBaseline);
  const currentTaxonomyMap = buildTaxonomyErrorMap(normalizedCurrent);
  const newTaxonomyConfusions: Comparison["newTaxonomyConfusions"] = [];
  const resolvedTaxonomyConfusions: Comparison["resolvedTaxonomyConfusions"] =
    [];

  for (const [key, value] of currentTaxonomyMap.entries()) {
    if (!baselineTaxonomyMap.has(key)) {
      newTaxonomyConfusions.push(value);
    }
  }

  for (const [key, value] of baselineTaxonomyMap.entries()) {
    if (!currentTaxonomyMap.has(key)) {
      resolvedTaxonomyConfusions.push(value);
    }
  }

  newTaxonomyConfusions.sort((a, b) => b.count - a.count);
  resolvedTaxonomyConfusions.sort((a, b) => b.count - a.count);

  // Granularity error deltas
  const baselineGranularityMap = new Map<
    GranularityErrorType,
    { count: number; examples: string[] }
  >();
  const currentGranularityMap = new Map<
    GranularityErrorType,
    { count: number; examples: string[] }
  >();

  for (const item of normalizedBaseline.summary.topGranularityErrors ?? []) {
    baselineGranularityMap.set(item.reason, {
      count: item.count,
      examples: item.examples,
    });
  }
  for (const item of normalizedCurrent.summary.topGranularityErrors ?? []) {
    currentGranularityMap.set(item.reason, {
      count: item.count,
      examples: item.examples,
    });
  }

  const granularityDeltas = {} as Record<GranularityErrorType, number>;
  const allReasons: GranularityErrorType[] = [
    "too_fine",
    "too_coarse",
    "other",
  ];
  for (const reason of allReasons) {
    const baseCount = baselineGranularityMap.get(reason)?.count ?? 0;
    const currCount = currentGranularityMap.get(reason)?.count ?? 0;
    granularityDeltas[reason] = currCount - baseCount;
  }

  const newGranularityIssues: Comparison["newGranularityIssues"] = [];
  const resolvedGranularityIssues: Comparison["resolvedGranularityIssues"] = [];

  for (const [reason, data] of currentGranularityMap.entries()) {
    if (!baselineGranularityMap.has(reason)) {
      newGranularityIssues.push({
        reason,
        count: data.count,
        examples: data.examples,
      });
    }
  }

  for (const [reason, data] of baselineGranularityMap.entries()) {
    if (!currentGranularityMap.has(reason)) {
      resolvedGranularityIssues.push({
        reason,
        count: data.count,
        examples: data.examples,
      });
    }
  }

  newGranularityIssues.sort((a, b) => b.count - a.count);
  resolvedGranularityIssues.sort((a, b) => b.count - a.count);

  return {
    baseline: normalizedBaseline,
    current: normalizedCurrent,
    scoreDelta:
      normalizedCurrent.summary.avgScore - normalizedBaseline.summary.avgScore,
    spanCountDelta:
      normalizedCurrent.summary.avgSpanCount -
      normalizedBaseline.summary.avgSpanCount,
    regressions,
    improvements,
    newErrors,
    fixedErrors,
    categoryDeltas,
    categoryScoreDeltas,
    sectionErrorRateDeltas,
    newTaxonomyConfusions,
    resolvedTaxonomyConfusions,
    granularityDeltas,
    newGranularityIssues,
    resolvedGranularityIssues,
  };
}

function formatDelta(value: number, digits = 3): string {
  return value >= 0 ? `+${value.toFixed(digits)}` : value.toFixed(digits);
}

function printComparison(comp: Comparison): void {
  console.log("\n" + "=".repeat(80));
  console.log("  SPAN LABELING REGRESSION REPORT");
  console.log("=".repeat(80));
  console.log();

  console.log("📅 COMPARISON:");
  console.log(
    `  Baseline: ${comp.baseline.timestamp} (${comp.baseline.promptCount} prompts)`,
  );
  console.log(
    `  Current:  ${comp.current.timestamp} (${comp.current.promptCount} prompts)`,
  );
  console.log();

  // Overall delta
  const scoreDeltaStr =
    comp.scoreDelta >= 0
      ? `+${comp.scoreDelta.toFixed(2)}`
      : comp.scoreDelta.toFixed(2);
  const spanDeltaStr =
    comp.spanCountDelta >= 0
      ? `+${comp.spanCountDelta.toFixed(2)}`
      : comp.spanCountDelta.toFixed(2);

  console.log("📊 OVERALL CHANGE:");
  console.log(
    `  Average Score:      ${comp.baseline.summary.avgScore.toFixed(2)} → ${comp.current.summary.avgScore.toFixed(2)} (${scoreDeltaStr})`,
  );
  console.log(
    `  Average Span Count: ${comp.baseline.summary.avgSpanCount.toFixed(2)} → ${comp.current.summary.avgSpanCount.toFixed(2)} (${spanDeltaStr})`,
  );
  console.log();

  // Category deltas
  console.log("📈 BY RUBRIC:");
  for (const [cat, delta] of Object.entries(comp.categoryDeltas)) {
    const deltaStr = formatDelta(delta, 3);
    const indicator = delta > 0.1 ? "✅" : delta < -0.1 ? "❌" : "➖";
    console.log(`  ${indicator} ${cat.padEnd(15)} ${deltaStr}`);
  }
  console.log();

  console.log("CATEGORY SCORE CHANGE (avg coverage/precision):");
  for (const category of CATEGORY_NAMES) {
    const delta = comp.categoryScoreDeltas[category];
    console.log(
      `  ${category.padEnd(12)} cov ${formatDelta(delta.coverage, 2)}  prec ${formatDelta(delta.precision, 2)}`,
    );
  }
  console.log();

  console.log("SECTION ERROR RATE CHANGE (per prompt):");
  for (const section of SECTION_NAMES) {
    const delta = comp.sectionErrorRateDeltas[section];
    console.log(
      `  ${section.padEnd(15)} FP ${formatDelta(delta.falsePositives, 3)}  Missed ${formatDelta(delta.missed, 3)}`,
    );
  }
  console.log();

  if (comp.newTaxonomyConfusions.length > 0) {
    console.log("NEW TAXONOMY CONFUSIONS:");
    for (const item of comp.newTaxonomyConfusions.slice(0, 5)) {
      console.log(
        `  - ${item.assignedRole} -> ${item.expectedRole} (${item.count}x)`,
      );
    }
    console.log();
  }

  if (comp.resolvedTaxonomyConfusions.length > 0) {
    console.log("RESOLVED TAXONOMY CONFUSIONS:");
    for (const item of comp.resolvedTaxonomyConfusions.slice(0, 5)) {
      console.log(
        `  - ${item.assignedRole} -> ${item.expectedRole} (${item.count}x)`,
      );
    }
    console.log();
  }

  // Granularity deltas
  const hasGranularityChanges = Object.values(comp.granularityDeltas).some(
    (d) => d !== 0,
  );
  if (hasGranularityChanges) {
    console.log("📐 GRANULARITY ISSUE CHANGE:");
    for (const [reason, delta] of Object.entries(comp.granularityDeltas)) {
      if (delta !== 0) {
        const indicator = delta > 0 ? "❌" : "✅";
        console.log(`  ${indicator} ${reason}: ${formatDelta(delta, 0)}`);
      }
    }
    console.log();
  }

  if (comp.newGranularityIssues.length > 0) {
    console.log("NEW GRANULARITY ISSUES:");
    for (const item of comp.newGranularityIssues) {
      const example = item.examples[0] ? ` (e.g., "${item.examples[0]}")` : "";
      console.log(`  - ${item.reason}: ${item.count}x${example}`);
    }
    console.log();
  }

  if (comp.resolvedGranularityIssues.length > 0) {
    console.log("RESOLVED GRANULARITY ISSUES:");
    for (const item of comp.resolvedGranularityIssues) {
      const example = item.examples[0] ? ` (e.g., "${item.examples[0]}")` : "";
      console.log(`  - ${item.reason}: ${item.count}x${example}`);
    }
    console.log();
  }

  // Regressions
  if (comp.regressions.length > 0) {
    console.log(
      `❌ REGRESSIONS (${comp.regressions.length} prompts got worse by 3+ points):`,
    );
    for (const r of comp.regressions.slice(0, 5)) {
      console.log(
        `  [${r.baselineScore}→${r.currentScore}] "${r.input.slice(0, 50)}..."`,
      );
    }
    if (comp.regressions.length > 5) {
      console.log(`  ... and ${comp.regressions.length - 5} more`);
    }
    console.log();
  }

  // Improvements
  if (comp.improvements.length > 0) {
    console.log(
      `✅ IMPROVEMENTS (${comp.improvements.length} prompts got better by 3+ points):`,
    );
    for (const r of comp.improvements.slice(0, 5)) {
      console.log(
        `  [${r.baselineScore}→${r.currentScore}] "${r.input.slice(0, 50)}..."`,
      );
    }
    if (comp.improvements.length > 5) {
      console.log(`  ... and ${comp.improvements.length - 5} more`);
    }
    console.log();
  }

  // Error changes
  if (comp.newErrors.length > 0) {
    console.log(`🔴 NEW ERRORS (${comp.newErrors.length}):`);
    for (const e of comp.newErrors.slice(0, 3)) {
      console.log(`  - ${e.slice(0, 80)}`);
    }
    console.log();
  }

  if (comp.fixedErrors.length > 0) {
    console.log(`🟢 FIXED ERRORS (${comp.fixedErrors.length}):`);
    for (const e of comp.fixedErrors.slice(0, 3)) {
      console.log(`  - ${e}`);
    }
    console.log();
  }

  // Verdict
  console.log("=".repeat(80));
  if (
    comp.scoreDelta >= 0 &&
    comp.regressions.length === 0 &&
    comp.newErrors.length === 0
  ) {
    console.log("✅ NO REGRESSIONS DETECTED - SAFE TO DEPLOY");
  } else if (comp.regressions.length > 0) {
    console.log(
      `⚠️  ${comp.regressions.length} REGRESSIONS DETECTED - REVIEW BEFORE DEPLOY`,
    );
  } else if (comp.newErrors.length > 0) {
    console.log(
      `⚠️  ${comp.newErrors.length} NEW ERRORS - REVIEW BEFORE DEPLOY`,
    );
  } else if (comp.scoreDelta < -0.5) {
    console.log("⚠️  AVERAGE SCORE DECREASED - REVIEW BEFORE DEPLOY");
  } else {
    console.log("✅ MINOR CHANGES - LIKELY SAFE TO DEPLOY");
  }
  console.log("=".repeat(80));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let baselinePath = join(SNAPSHOTS_DIR, "baseline.json");
  let currentPath = join(SNAPSHOTS_DIR, "latest.json");

  for (let i = 0; i < args.length; i++) {
    const next = args[i + 1];
    if (args[i] === "--baseline" && next !== undefined) {
      baselinePath = next;
      i++;
    } else if (args[i] === "--current" && next !== undefined) {
      currentPath = next;
      i++;
    }
  }

  if (!existsSync(baselinePath)) {
    console.error(`Baseline not found: ${baselinePath}`);
    console.error(
      "Run evaluation with --baseline flag first to create a baseline.",
    );
    process.exit(1);
  }

  if (!existsSync(currentPath)) {
    console.error(`Current snapshot not found: ${currentPath}`);
    console.error("Run evaluation first to create a snapshot.");
    process.exit(1);
  }

  const baseline = loadSnapshot(baselinePath);
  const current = loadSnapshot(currentPath);

  const comparison = compareSnapshots(baseline, current);
  printComparison(comparison);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
