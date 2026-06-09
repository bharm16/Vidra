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
 *
 * Exit codes:
 *   0 = passed (or bless succeeded)
 *   1 = regression detected
 *   2 = setup error (missing API keys, missing baseline, error rate too high)
 */

import { config as loadEnv } from "dotenv";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { AIModelService } from "../../server/src/services/ai-model/AIModelService.js";
import type { ClientsMap } from "../../server/src/services/ai-model/types.js";
import { OpenAICompatibleAdapter } from "../../server/src/clients/adapters/OpenAICompatibleAdapter.js";
import { labelSpans } from "../../server/src/llm/span-labeling/SpanLabelingService.js";
import { warmupNlpServices } from "../../server/src/llm/span-labeling/nlp/NlpSpanService.js";
import { RelaxedF1Evaluator } from "../../server/src/llm/span-labeling/evaluation/RelaxedF1Evaluator.js";
import {
  buildBaseline,
  compareToBaseline,
  formatGateResult,
  type Baseline,
  type EvaluationReport,
} from "./baseline-gate.js";
import { createEvalEmitter, resolveDistinctId } from "./posthog-emitter.js";
import type { Outcome, SpanLabelingF1Metrics } from "./eval-event-types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

loadEnv({ path: join(__dirname, "../..", ".env") });

const GOLDEN_SET_DIR = join(
  __dirname,
  "../../server/src/llm/span-labeling/evaluation/golden-set",
);
const BASELINES_DIR = join(__dirname, "golden-set-baselines");
const RESULTS_PATH = join(__dirname, "golden-set-results-latest.json");

// Abort if more than this fraction of prompts fail — F1 numbers from a partial
// run can't be trusted as a baseline or compared against one.
const MAX_ERROR_RATE = 0.2;

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
  commit: string | undefined;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    bless: false,
    provider: "auto",
    fixtures: null,
    concurrency: 5,
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
    } else if (arg === "--commit") {
      opts.commit = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: golden-set-relaxed-f1.ts [--bless] [--provider groq|openai|auto] [--fixtures core,lighting] [--concurrency N]",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return opts;
}

function createAIService(): {
  service: AIModelService;
  resolvedProvider: "groq" | "openai";
} {
  const clients: ClientsMap = { openai: null };

  if (process.env.GROQ_API_KEY) {
    clients.groq = new OpenAICompatibleAdapter({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
      defaultModel: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      defaultTimeout: Number(process.env.GROQ_TIMEOUT_MS || 5000),
      providerName: "groq",
    });
  }

  if (process.env.OPENAI_API_KEY) {
    clients.openai = new OpenAICompatibleAdapter({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      defaultModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
      defaultTimeout: Number(process.env.OPENAI_TIMEOUT_MS || 60000),
      providerName: "openai",
    });
  }

  if (!clients.openai && clients.groq) {
    clients.openai = clients.groq;
  }

  if (!clients.openai) {
    throw new Error(
      "No AI API keys found. Set GROQ_API_KEY or OPENAI_API_KEY before running this script.",
    );
  }

  const resolvedProvider: "groq" | "openai" = clients.groq ? "groq" : "openai";
  return {
    service: new AIModelService({ clients }),
    resolvedProvider,
  };
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
          const response = await labelSpans(
            { text: prompt.text, maxSpans: 50, minConfidence: 0.5 },
            aiService,
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

function baselinePath(provider: string): string {
  return join(BASELINES_DIR, `${provider}.json`);
}

function readBaseline(provider: string): Baseline | null {
  const path = baselinePath(provider);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as Baseline;
}

function writeBaseline(baseline: Baseline): void {
  if (!existsSync(BASELINES_DIR)) mkdirSync(BASELINES_DIR, { recursive: true });
  writeFileSync(
    baselinePath(baseline.provider),
    JSON.stringify(baseline, null, 2) + "\n",
    "utf8",
  );
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));
  const emitter = createEvalEmitter();
  const startedAt = Date.now();
  let outcome: Outcome = "setup_error";
  let metrics: SpanLabelingF1Metrics | undefined;
  let errorMessage: string | undefined;
  let promptCount = 0;
  let errorCount = 0;
  let resolvedProviderForEmit: "groq" | "openai" | undefined;
  // Per-prompt examples surfaced in eval.completed for dashboard quality
  // review. Populated after labeling runs; remains empty on setup_error.
  let evalExamples: import("./eval-event-types.js").EvalExample[] = [];

  try {
    console.log("Golden Set Relaxed F1 Evaluation");
    console.log(`  mode: ${opts.bless ? "bless" : "gate"}`);
    console.log(
      `  fixtures: ${opts.fixtures ? opts.fixtures.join(",") : "all"}`,
    );

    const fixtures = loadFixtures(opts.fixtures);
    const allPrompts = fixtures.flatMap((f) => f.prompts);
    promptCount = allPrompts.length;
    console.log(
      `  loaded ${fixtures.length} fixture(s), ${allPrompts.length} prompts`,
    );

    const { service, resolvedProvider } = createAIService();
    const provider =
      opts.provider === "auto" ? resolvedProvider : opts.provider;
    resolvedProviderForEmit = provider;
    console.log(`  provider: ${provider}`);

    // Force the span labeling pipeline to route through the requested provider.
    // Without this, SPAN_PROVIDER (or auto-detection from SPAN_MODEL) determines
    // which client labelSpans() uses — meaning `--provider groq` could silently
    // measure OpenAI's behavior. Setting SPAN_PROVIDER here closes that gap.
    //
    // Also clear SPAN_MODEL: the dev .env may have it set to a model from a
    // different provider (e.g., SPAN_MODEL=gemini-2.5-flash with SPAN_PROVIDER=
    // gemini). Inheriting that across provider switch produces 404s when the
    // requested provider doesn't host the requested model. Falling back to the
    // provider client's defaultModel is the right behavior for eval reproducibility.
    process.env.SPAN_PROVIDER = provider;
    delete process.env.SPAN_MODEL;

    console.log("\nWarming up NLP services...");
    await warmupNlpServices();

    console.log("Running span labeling...");
    const results = await runLabeling(allPrompts, service, opts.concurrency);

    errorCount = results.filter((r) => r.error !== null).length;
    const errorRate = errorCount / results.length;
    console.log(
      `\n  errors: ${errorCount}/${results.length} (${(errorRate * 100).toFixed(1)}%)`,
    );

    if (errorRate > MAX_ERROR_RATE) {
      console.error(
        `\n❌ Error rate ${(errorRate * 100).toFixed(1)}% exceeds threshold ${(MAX_ERROR_RATE * 100).toFixed(0)}%. Aborting — partial F1 numbers can't be trusted.`,
      );
      outcome = "setup_error";
      errorMessage = `Error rate ${(errorRate * 100).toFixed(1)}% exceeds threshold`;
      return 2;
    }

    const evaluator = new RelaxedF1Evaluator();
    const report = toEvaluationReport(results, evaluator);

    // Capture per-prompt content so PostHog dashboards can show predicted
    // vs ground-truth spans for individual prompts — not just aggregate F1.
    evalExamples = results.map((r) => ({
      promptId: r.promptId,
      predicted: r.predicted.map((s) => ({ text: s.text, role: s.role })),
      groundTruth: r.groundTruth.map((s) => ({ text: s.text, role: s.role })),
      ...(r.error ? { error: r.error } : {}),
    }));

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
          commit: opts.commit ?? null,
          report,
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

    metrics = {
      overallF1: report.summary.relaxedF1,
      overallPrecision: report.summary.precision,
      overallRecall: report.summary.recall,
      perCategoryF1: Object.fromEntries(
        Object.entries(report.byCategory).map(([k, v]) => [k, v.f1]),
      ),
    };

    if (opts.bless) {
      const baseline = buildBaseline(report, {
        provider,
        ...(opts.commit !== undefined && { commit: opts.commit }),
      });
      writeBaseline(baseline);
      console.log(`\n✅ Baseline blessed: ${baselinePath(provider)}`);
      outcome = "passed";
      return 0;
    }

    const baseline = readBaseline(provider);
    if (!baseline) {
      console.error(
        `\n❌ No baseline at ${baselinePath(provider)}. Run with --bless first to establish one.`,
      );
      outcome = "setup_error";
      errorMessage = `No baseline at ${baselinePath(provider)}`;
      return 2;
    }

    if (baseline.commit !== undefined) {
      metrics.baselineCommit = baseline.commit;
    }

    const gate = compareToBaseline(report, baseline);
    console.log("\n" + formatGateResult(gate));

    if (gate.passed) {
      outcome = "passed";
      return 0;
    }
    outcome = "regression";
    errorMessage = `${gate.regressions.length} regression(s) detected`;
    return 1;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    outcome = "setup_error";
    throw err;
  } finally {
    try {
      emitter.emit({
        distinctId: resolveDistinctId(),
        event: "eval.completed",
        properties: {
          evalType: "span_labeling_f1",
          outcome,
          ...(errorMessage !== undefined && { errorMessage }),
          commit: opts.commit ?? "unknown",
          provider: resolvedProviderForEmit ?? null,
          ...(process.env.GITHUB_RUN_ID !== undefined && {
            runId: process.env.GITHUB_RUN_ID,
          }),
          durationMs: Date.now() - startedAt,
          promptCount,
          errorCount,
          metrics: metrics ?? {
            overallF1: 0,
            overallPrecision: 0,
            overallRecall: 0,
            perCategoryF1: {},
          },
          ...(evalExamples.length > 0 && { examples: evalExamples }),
        },
      });
      await emitter.shutdown();
    } catch {
      // never fail the eval on telemetry hiccup
    }
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("\nFatal error:", error);
    process.exit(2);
  });
