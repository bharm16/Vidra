#!/usr/bin/env tsx

/**
 * Golden Set Relaxed F1 Evaluation Harness
 *
 * Runs span labeling against the hand-labeled golden-set fixtures and computes
 * Relaxed F1 (IoU >= 0.5 + role match) overall and per category. In gate mode
 * (default), compares results against a previously-blessed baseline and exits
 * non-zero on regression. In bless mode (--bless), writes a fresh baseline.
 *
 * Why this is separate from span-labeling-evaluation.ts:
 *   That script does LLM-as-judge scoring (Coverage/Precision/Granularity/
 *   Taxonomy on a 1-5 scale via GPT-4o). This one uses deterministic,
 *   hand-labeled ground truth — different metric, different cadence, different
 *   gating semantics.
 *
 * Usage:
 *   tsx scripts/evaluation/golden-set-relaxed-f1.ts
 *   tsx scripts/evaluation/golden-set-relaxed-f1.ts --bless
 *   tsx scripts/evaluation/golden-set-relaxed-f1.ts --provider openai
 *   tsx scripts/evaluation/golden-set-relaxed-f1.ts --fixtures core,lighting
 *   tsx scripts/evaluation/golden-set-relaxed-f1.ts --concurrency 5
 *   tsx scripts/evaluation/golden-set-relaxed-f1.ts --runs 5
 *
 * Exit codes:
 *   0 = passed (or bless succeeded)
 *   1 = regression detected
 *   2 = setup error (missing API keys, missing baseline, error rate too high)
 */

import { config as loadEnv } from "dotenv";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { AIModelService } from "../../server/src/services/ai-model/AIModelService.js";
import { createGoldenSetAIService } from "./golden-set-ai-service.js";
import { labelSpans } from "../../server/src/llm/span-labeling/SpanLabelingService.js";
import { warmupNlpServices } from "../../server/src/llm/span-labeling/nlp/NlpSpanService.js";
import { RelaxedF1Evaluator } from "../../server/src/llm/span-labeling/evaluation/RelaxedF1Evaluator.js";
import {
  averageReports,
  baselineModelMismatch,
  buildBaseline,
  compareToBaseline,
  formatGateResult,
  type Baseline,
  type EvaluationReport,
} from "./baseline-gate.js";
import { createBaselineStore } from "./baseline-store.js";
import { withTransientRetry } from "./transientRetry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

loadEnv({ path: join(__dirname, "../..", ".env") });

const GOLDEN_SET_DIR = join(
  __dirname,
  "../../server/src/llm/span-labeling/evaluation/golden-set",
);
const BASELINES_DIR = join(__dirname, "golden-set-baselines");
const RESULTS_PATH = join(__dirname, "golden-set-results-latest.json");

const baselineStore = createBaselineStore<Baseline>(BASELINES_DIR);

// Any prompt that still fails after transient retries aborts the run: a
// dropped prompt changes the denominator, so its F1 can't be compared.

interface GoldenSpan {
  text: string;
  start: number;
  end: number;
  role: string;
  [key: string]: unknown;
}

interface GoldenPrompt {
  id: string;
  text: string;
  groundTruth: { spans: GoldenSpan[] };
}

interface GoldenFixture {
  metadata: { name: string; category: string; version: string };
  prompts: GoldenPrompt[];
}

interface CliOptions {
  bless: boolean;
  provider: "groq" | "openai" | "auto";
  fixtures: string[] | null;
  concurrency: number;
  runs: number;
  commit: string | undefined;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    bless: false,
    provider: "auto",
    fixtures: null,
    concurrency: 5,
    runs: 5,
    commit: process.env.GIT_COMMIT,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--bless") opts.bless = true;
    else if (arg === "--provider") {
      const value = argv[++i];
      if (value !== "groq" && value !== "openai" && value !== "auto") {
        throw new Error(`Invalid --provider: ${value}`);
      }
      opts.provider = value;
    } else if (arg === "--fixtures") {
      opts.fixtures = (argv[++i] ?? "").split(",").filter(Boolean);
    } else if (arg === "--concurrency") {
      opts.concurrency = Number(argv[++i] ?? "5");
      if (!Number.isFinite(opts.concurrency) || opts.concurrency < 1) {
        throw new Error("--concurrency must be a positive integer");
      }
    } else if (arg === "--runs") {
      opts.runs = Number(argv[++i] ?? "5");
      if (!Number.isInteger(opts.runs) || opts.runs < 1) {
        throw new Error("--runs must be a positive integer");
      }
    } else if (arg === "--commit") {
      opts.commit = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: golden-set-relaxed-f1.ts [--bless] [--provider groq|openai|auto] [--fixtures core,lighting] [--concurrency N] [--runs N]",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return opts;
}

function loadFixtures(filter: string[] | null): GoldenFixture[] {
  const allFiles = readdirSync(GOLDEN_SET_DIR).filter((f) =>
    f.endsWith(".json"),
  );
  const matched = filter
    ? allFiles.filter((file) =>
        filter.some((substring) => file.includes(substring)),
      )
    : allFiles;

  if (matched.length === 0) {
    throw new Error(
      `No fixture files matched filter ${JSON.stringify(filter)} in ${GOLDEN_SET_DIR}`,
    );
  }

  return matched.map(
    (file) =>
      JSON.parse(
        readFileSync(join(GOLDEN_SET_DIR, file), "utf8"),
      ) as GoldenFixture,
  );
}

interface PromptResult {
  promptId: string;
  predicted: GoldenSpan[];
  groundTruth: GoldenSpan[];
  error: string | null;
}

async function runLabeling(
  prompts: GoldenPrompt[],
  aiService: AIModelService,
  concurrency: number,
): Promise<PromptResult[]> {
  const results: PromptResult[] = new Array(prompts.length);
  let completed = 0;

  for (
    let batchStart = 0;
    batchStart < prompts.length;
    batchStart += concurrency
  ) {
    const batch = prompts.slice(batchStart, batchStart + concurrency);

    await Promise.all(
      batch.map(async (prompt, batchIndex) => {
        const idx = batchStart + batchIndex;
        try {
          const response = await withTransientRetry(() =>
            labelSpans(
              { text: prompt.text, maxSpans: 50, minConfidence: 0.5 },
              aiService,
            ),
          );
          const predicted: GoldenSpan[] = (response.spans || []).map((s) => ({
            text: s.text ?? "",
            start: s.start ?? 0,
            end: s.end ?? 0,
            role: s.role ?? "",
          }));
          results[idx] = {
            promptId: prompt.id,
            predicted,
            groundTruth: prompt.groundTruth.spans,
            error: null,
          };
        } catch (error) {
          results[idx] = {
            promptId: prompt.id,
            predicted: [],
            groundTruth: prompt.groundTruth.spans,
            error: (error as Error).message,
          };
        }
        completed++;
        process.stdout.write(`\r  [${completed}/${prompts.length}] processed`);
      }),
    );
  }
  process.stdout.write("\n");

  return results;
}

/**
 * Adapt RelaxedF1Evaluator's loose `Record<string, number>` summary to the
 * strictly-typed EvaluationReport shape the gate expects.
 */
function toEvaluationReport(
  results: PromptResult[],
  evaluator: RelaxedF1Evaluator,
): EvaluationReport {
  const successful = results.filter((r) => r.error === null);
  const report = evaluator.generateEvaluationReport({
    tests: successful.map((r) => ({
      predicted: r.predicted,
      groundTruth: r.groundTruth,
    })),
  });

  return {
    summary: {
      relaxedF1: report.summary.relaxedF1 ?? 0,
      precision: report.summary.precision ?? 0,
      recall: report.summary.recall ?? 0,
      taxonomyAccuracy: report.summary.taxonomyAccuracy ?? 0,
    },
    byCategory: report.byCategory,
  };
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));

  console.log("Golden Set Relaxed F1 Evaluation");
  console.log(`  mode: ${opts.bless ? "bless" : "gate"}`);
  console.log(
    `  fixtures: ${opts.fixtures ? opts.fixtures.join(",") : "all"}`,
  );

  const fixtures = loadFixtures(opts.fixtures);
  const allPrompts = fixtures.flatMap((f) => f.prompts);
  console.log(
    `  loaded ${fixtures.length} fixture(s), ${allPrompts.length} prompts`,
  );

  const { service, provider, model } = createGoldenSetAIService(
    opts.provider,
    process.env,
  );
  console.log(`  provider: ${provider}`);
  console.log(`  model: ${model}`);

  console.log(`  runs: ${opts.runs} (averaged)`);

  const baseline = opts.bless ? null : baselineStore.read(provider);
  if (!opts.bless) {
    if (!baseline) {
      console.error(
        `\n❌ No baseline at ${baselineStore.path(provider)}. Run with --bless first to establish one.`,
      );
      return 2;
    }
    const mismatch = baselineModelMismatch(baseline, model);
    if (mismatch) {
      console.error(`\n❌ ${mismatch}`);
      return 2;
    }
    if (baseline.model === undefined) {
      console.warn(`\n⚠ Baseline records no model; it may come from another one. Re-bless to record ${model}.`);
    }
  }

  console.log("\nWarming up NLP services...");
  await warmupNlpServices();

  const evaluator = new RelaxedF1Evaluator();
  const reports: EvaluationReport[] = [];
  let results: PromptResult[] = [];
  for (let run = 1; run <= opts.runs; run++) {
    console.log(`Running span labeling (run ${run}/${opts.runs})...`);
    results = await runLabeling(allPrompts, service, opts.concurrency);
    const failed = results.filter((r) => r.error !== null);
    if (failed.length > 0) {
      console.error(
        `\n❌ ${failed.length}/${results.length} prompts failed after retries (first: ${failed[0]?.error}). Aborting — a partial run can't be compared.`,
      );
      return 2;
    }
    reports.push(toEvaluationReport(results, evaluator));
    console.log(
      `  run ${run}: F1 ${reports[run - 1]?.summary.relaxedF1.toFixed(3)}, taxonomy accuracy ${reports[run - 1]?.summary.taxonomyAccuracy.toFixed(3)}`,
    );
  }
  const report = averageReports(reports);

  console.log("\nReport:");
  console.log(`  overall F1:        ${report.summary.relaxedF1.toFixed(3)}`);
  console.log(
    `  taxonomy accuracy: ${report.summary.taxonomyAccuracy.toFixed(3)}`,
  );
  console.log(
    `  categories scored: ${Object.keys(report.byCategory).length}`,
  );

  // Write the full results JSON for CI artifact upload / debugging
  writeFileSync(
    RESULTS_PATH,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        provider,
        model,
        commit: opts.commit ?? null,
        runs: opts.runs,
        report,
        runReports: reports,
        // Full per-prompt records including predicted and ground-truth
        // spans. Required for confusion-matrix and per-prompt diagnostics
        // (`scripts/evaluation/diagnose-failures.ts`). The file is tracked
        // in git (~110KB for 67 prompts) so cross-PR baseline drift shows
        // up in `git diff` — accept the per-run timestamp churn as the
        // cost of that observability.
        perPrompt: results.map((r) => ({
          promptId: r.promptId,
          predictedCount: r.predicted.length,
          groundTruthCount: r.groundTruth.length,
          predicted: r.predicted,
          groundTruth: r.groundTruth,
          error: r.error,
        })),
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`  results: ${RESULTS_PATH}`);

  if (opts.bless) {
    const blessed = buildBaseline(report, {
      provider,
      model,
      runs: opts.runs,
      ...(opts.commit !== undefined && { commit: opts.commit }),
    });
    baselineStore.write(blessed.provider, blessed);
    console.log(`\n✅ Baseline blessed: ${baselineStore.path(provider)}`);
    return 0;
  }

  if (!baseline) return 2;
  const gate = compareToBaseline(report, baseline);
  console.log("\n" + formatGateResult(gate));

  return gate.passed ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("\nFatal error:", error);
    process.exit(2);
  });
