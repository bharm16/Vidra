/**
 * Frame-verification eval (Phase 3)
 *
 * Scores the SpanVerdictService against the constructed eval set from
 * generate-eval-set.ts. Ground truth is known by construction (base variants:
 * every span present; perturbed variants: the perturbed span absent).
 *
 * Primary metric — the "present" class over all (span, frame) pairs:
 *   precision = TP / (TP + FP)   FP: judge says present, span was perturbed away
 *   recall    = TP / (TP + FN)   FN: judge says absent/uncertain for a kept span
 * "uncertain" never counts as a present prediction.
 *
 * Gate: precision >= 0.85 && recall >= 0.75 (exit code 1 otherwise).
 *
 * Usage:
 *   npx tsx scripts/evaluation/frame-verification/frame-verification-eval.ts
 *   npx tsx scripts/evaluation/frame-verification/frame-verification-eval.ts --concurrency 4
 *   npx tsx scripts/evaluation/frame-verification/frame-verification-eval.ts --limit 6
 */

import { config as loadEnv } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { AIModelService } from "../../../server/src/services/ai-model/AIModelService.js";
import type { ClientsMap } from "../../../server/src/services/ai-model/types.js";
import { OpenAICompatibleAdapter } from "../../../server/src/clients/adapters/OpenAICompatibleAdapter.js";
import { SpanVerdictService } from "../../../server/src/services/frame-verification/services/SpanVerdictService.js";
import type { SpanVerdict } from "../../../server/src/services/frame-verification/types.js";
import type { ManifestVariant } from "./generate-eval-set.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

loadEnv({ path: join(__dirname, "../../..", ".env") });

const MANIFEST_PATH = join(__dirname, "manifest.json");
const RESULTS_PATH = join(__dirname, "results-latest.json");

const PRECISION_THRESHOLD = 0.85;
const RECALL_THRESHOLD = 0.75;

interface Manifest {
  metadata: Record<string, unknown>;
  variants: ManifestVariant[];
}

interface PairResult {
  variantId: string;
  kind: string;
  spanText: string;
  category: string;
  expected: "present" | "absent";
  predicted: "present" | "absent" | "uncertain";
  confidence: number;
  evidence?: string;
}

interface ClassMetrics {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
}

const createAIService = (): AIModelService => {
  const clients: ClientsMap = { openai: null };
  if (process.env.OPENAI_API_KEY) {
    clients.openai = new OpenAICompatibleAdapter({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      defaultModel: "gpt-4o-mini-2024-07-18",
      defaultTimeout: Number(process.env.OPENAI_TIMEOUT_MS || 60000),
      providerName: "openai",
    });
  }
  if (!clients.openai) {
    throw new Error(
      "OPENAI_API_KEY is required (frame_verification routes to openai)",
    );
  }
  return new AIModelService({ clients });
};

const toDataUri = (imagePath: string): string => {
  const buffer = readFileSync(join(__dirname, imagePath));
  return `data:image/webp;base64,${buffer.toString("base64")}`;
};

const presentMetrics = (pairs: PairResult[]): ClassMetrics => {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const pair of pairs) {
    if (pair.predicted === "present") {
      if (pair.expected === "present") tp++;
      else fp++;
    } else if (pair.expected === "present") {
      fn++;
    }
  }
  return {
    tp,
    fp,
    fn,
    precision: tp + fp === 0 ? 0 : tp / (tp + fp),
    recall: tp + fn === 0 ? 0 : tp / (tp + fn),
  };
};

const absentDetection = (pairs: PairResult[]): ClassMetrics => {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const pair of pairs) {
    if (pair.predicted === "absent") {
      if (pair.expected === "absent") tp++;
      else fp++;
    } else if (pair.expected === "absent") {
      fn++;
    }
  }
  return {
    tp,
    fp,
    fn,
    precision: tp + fp === 0 ? 0 : tp / (tp + fp),
    recall: tp + fn === 0 ? 0 : tp / (tp + fn),
  };
};

const main = async (): Promise<void> => {
  const argv = process.argv.slice(2);
  const concurrencyIndex = argv.indexOf("--concurrency");
  const concurrency =
    concurrencyIndex >= 0 ? Number(argv[concurrencyIndex + 1]) : 4;
  const limitIndex = argv.indexOf("--limit");
  const limit = limitIndex >= 0 ? Number(argv[limitIndex + 1]) : Infinity;

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
  const variants = manifest.variants.slice(
    0,
    Number.isFinite(limit) ? limit : manifest.variants.length,
  );

  const aiService = createAIService();
  const judge = new SpanVerdictService(aiService);

  const pairs: PairResult[] = [];
  const errors: string[] = [];
  const queue = [...variants];
  let completed = 0;

  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const judgeWithRetry = async (
    image: string,
    spans: Array<{ text: string; category: string }>,
  ): Promise<{ verdicts: SpanVerdict[] }> => {
    const maxAttempts = 6;
    for (let attempt = 1; ; attempt++) {
      try {
        return await judge.judge(image, spans);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const rateLimited = message.includes("429");
        if (!rateLimited || attempt >= maxAttempts) throw error;
        await sleep(10000 * attempt);
      }
    }
  };

  const worker = async (): Promise<void> => {
    for (;;) {
      const variant = queue.shift();
      if (!variant) return;
      try {
        const image = toDataUri(variant.imagePath);
        const spans = variant.spans.map((span) => ({
          text: span.text,
          category: span.category,
        }));
        const { verdicts } = await judgeWithRetry(image, spans);
        verdicts.forEach((verdict: SpanVerdict, index: number) => {
          const expected = variant.spans[index]?.expected;
          if (!expected) return;
          pairs.push({
            variantId: variant.variantId,
            kind: variant.kind,
            spanText: verdict.span.text,
            category: verdict.span.category,
            expected,
            predicted: verdict.verdict,
            confidence: verdict.confidence,
            ...(verdict.evidence !== undefined
              ? { evidence: verdict.evidence }
              : {}),
          });
        });
        completed++;
        console.log(`[${completed}/${variants.length}] ${variant.variantId}`);
      } catch (error) {
        errors.push(
          `${variant.variantId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        console.error(`ERROR ${variant.variantId}`);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, () => worker()),
  );

  const present = presentMetrics(pairs);
  const absent = absentDetection(pairs);

  const misses = pairs.filter((pair) =>
    pair.expected === "present"
      ? pair.predicted !== "present"
      : pair.predicted === "present",
  );

  const byCategory = new Map<string, PairResult[]>();
  for (const pair of pairs) {
    const parent = pair.category.split(".")[0] ?? pair.category;
    const list = byCategory.get(parent) ?? [];
    list.push(pair);
    byCategory.set(parent, list);
  }

  console.log("\n=== Frame verification eval ===");
  console.log(
    `pairs: ${pairs.length} (from ${completed} frames, ${errors.length} errors)`,
  );
  console.log(
    `present: precision ${present.precision.toFixed(3)} (tp ${present.tp} fp ${present.fp}) ` +
      `recall ${present.recall.toFixed(3)} (fn ${present.fn})`,
  );
  console.log(
    `absent-detection: precision ${absent.precision.toFixed(3)} recall ${absent.recall.toFixed(3)} ` +
      `(tp ${absent.tp} fp ${absent.fp} fn ${absent.fn})`,
  );
  console.log("\nper-parent-category (present precision/recall):");
  for (const [parent, list] of [...byCategory.entries()].sort()) {
    const metrics = presentMetrics(list);
    console.log(
      `  ${parent.padEnd(12)} n=${String(list.length).padStart(3)} ` +
        `P=${metrics.precision.toFixed(2)} R=${metrics.recall.toFixed(2)}`,
    );
  }

  writeFileSync(
    RESULTS_PATH,
    JSON.stringify(
      {
        thresholds: {
          precision: PRECISION_THRESHOLD,
          recall: RECALL_THRESHOLD,
        },
        present,
        absentDetection: absent,
        pairCount: pairs.length,
        errors,
        misses,
        pairs,
      },
      null,
      2,
    ),
  );
  console.log(`\nResults: ${RESULTS_PATH}`);

  const pass =
    present.precision >= PRECISION_THRESHOLD &&
    present.recall >= RECALL_THRESHOLD;
  console.log(
    pass
      ? `\nGATE PASS (P ${present.precision.toFixed(3)} >= ${PRECISION_THRESHOLD}, R ${present.recall.toFixed(3)} >= ${RECALL_THRESHOLD})`
      : `\nGATE FAIL (need P >= ${PRECISION_THRESHOLD} && R >= ${RECALL_THRESHOLD}, got P ${present.precision.toFixed(3)} R ${present.recall.toFixed(3)})`,
  );
  if (!pass || errors.length > 0) {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
