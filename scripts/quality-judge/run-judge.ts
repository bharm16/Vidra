import "dotenv/config";

import {
  createEvalEmitter,
  resolveDistinctId,
} from "../evaluation/posthog-emitter.js";

import {
  extractInputContent,
  extractOutputContent,
  isJudgeable,
} from "./content-extractors.js";
import { runJudge, JUDGE_MODEL_NAME } from "./judge-client.js";
import {
  createPostHogQueryClient,
  type PostHogQueryClient,
} from "./posthog-query-client.js";
import { loadRubric, rubricVersionFor } from "./rubric-loader.js";
import {
  QUALITY_SCORED_SURFACES,
  scoredEventNameFor,
  sumDimensions,
  type QualityScoredSurface,
} from "./judge-event-types.js";

export interface RunSummaryCounts {
  fetched: number;
  scored: number;
  alreadyScored: number;
  nonJudgeable: number;
  failed: number;
}

export function formatRunSummary(
  counts: RunSummaryCounts,
  surface: QualityScoredSurface,
): string {
  return `[quality-judge] ${surface}: ${counts.fetched} fetched, ${counts.scored} scored, ${counts.alreadyScored} already-scored, ${counts.nonJudgeable} non-judgeable, ${counts.failed} failed.`;
}

export interface RunJudgeOptions {
  hoursBack: number;
  /**
   * Fraction (0..1) of `source = 'user'` events to score.
   * Per spec § 1: 10% pre-launch (0.1). `synthetic` + `dogfood` are always 100%.
   */
  userSampleRate: number;
}

export async function runJudgeForSurface(
  surface: QualityScoredSurface,
  opts: RunJudgeOptions,
  // Injectable for tests; default to the real implementations
  deps?: { queryClient?: PostHogQueryClient },
): Promise<void> {
  const emitter = createEvalEmitter();
  const queryClient = deps?.queryClient ?? createPostHogQueryClient();
  try {
    const rubric = await loadRubric(surface);
    const rubricVersion = await rubricVersionFor(surface);
    const eventName = scoredEventNameFor(surface);

    const events = await queryClient.fetchEventsToScore(
      eventName,
      opts.hoursBack,
      opts.userSampleRate,
    );
    if (events.length === 0) {
      // eslint-disable-next-line no-console
      console.log(`[quality-judge] ${surface}: no events to score.`);
      return;
    }

    const seen = await queryClient.fetchAlreadyScoredIds(
      events.map((e) => e.uuid),
      rubricVersion,
      JUDGE_MODEL_NAME,
    );

    const counts: RunSummaryCounts = {
      fetched: events.length,
      scored: 0,
      alreadyScored: 0,
      nonJudgeable: 0,
      failed: 0,
    };

    for (const event of events) {
      if (seen.has(event.uuid)) {
        counts.alreadyScored++;
        continue;
      }
      if (!isJudgeable(event, surface)) {
        counts.nonJudgeable++;
        continue;
      }

      const startedAt = Date.now();
      try {
        const judged = await runJudge({
          rubric,
          surface,
          inputContent: extractInputContent(event, surface),
          outputContent: extractOutputContent(event, surface),
        });
        const totalScore = sumDimensions(judged.dimensions);
        emitter.emit({
          distinctId: resolveDistinctId(),
          event: "quality.scored",
          properties: {
            scoredEvent: event.event,
            scoredEventId: event.uuid,
            surface,
            rubricVersion,
            judgeModel: JUDGE_MODEL_NAME,
            judgeDurationMs: Date.now() - startedAt,
            judgeCostUsd: judged.costUsd,
            totalScore,
            dimensions: judged.dimensions,
            reasoning: judged.reasoning,
            source: event.properties.source ?? "unknown",
          },
        });
        counts.scored++;
      } catch (err) {
        counts.failed++;
        // eslint-disable-next-line no-console
        console.warn(
          `[quality-judge] ${surface} ${event.uuid}: judge failed: ${String(err)}`,
        );
      }
    }

    // eslint-disable-next-line no-console
    console.log(formatRunSummary(counts, surface));
  } finally {
    await emitter.shutdown();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let surfaces: QualityScoredSurface[];
  const surfaceFlagIndex = args.indexOf("--surface");
  if (surfaceFlagIndex !== -1) {
    const value = args[surfaceFlagIndex + 1];
    if (
      !value ||
      !QUALITY_SCORED_SURFACES.includes(value as QualityScoredSurface)
    ) {
      throw new Error(
        `--surface requires one of: ${QUALITY_SCORED_SURFACES.join(", ")} (got: ${value ?? "<missing>"})`,
      );
    }
    surfaces = [value as QualityScoredSurface];
  } else {
    surfaces = [...QUALITY_SCORED_SURFACES];
  }

  const hoursBack = Number(process.env.QUALITY_JUDGE_HOURS_BACK ?? 24);
  // Default 0.1 per spec § 1 ("10% user initially"). synth/dogfood always 100%.
  const userSampleRate = Number(
    process.env.QUALITY_JUDGE_USER_SAMPLE_RATE ?? 0.1,
  );

  for (const surface of surfaces) {
    // eslint-disable-next-line no-console
    console.log(`[quality-judge] running for ${surface}`);
    try {
      await runJudgeForSurface(surface, { hoursBack, userSampleRate });
    } catch (err) {
      // Per-surface isolation: one surface's upstream failure (e.g. PostHog 500)
      // must not skip the remaining surfaces in a nightly cron run.
      // eslint-disable-next-line no-console
      console.error(`[quality-judge] ${surface} aborted: ${String(err)}`);
    }
  }
}

// Run when invoked directly via tsx
const invokedAsScript = import.meta.url === `file://${process.argv[1]}`;
if (invokedAsScript) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[quality-judge] fatal:", err);
    process.exit(1);
  });
}
