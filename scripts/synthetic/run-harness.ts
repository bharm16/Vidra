/**
 * Synthetic-traffic harness entry point.
 *
 * Emits operational telemetry events DIRECTLY through the same PostHogClient
 * + telemetry services the server uses. No HTTP, no auth, no running server
 * required. Each event is wrapped in an ALS frame with source="synthetic"
 * so PR 1's PostHogClient wrapper auto-stamps the discriminator.
 *
 * Usage:
 *   npm run synthetic                       # all 3 surfaces
 *   npm run synthetic -- --only optimize    # subset
 *   npm run synthetic -- --only optimize,suggestions
 *
 * Requires POSTHOG_API_KEY in env (loaded from .env automatically). When
 * unset, the PostHogClient returns a no-op stub — runs cleanly but no events
 * land. Useful for dry-runs in CI without a key.
 */

import { config as loadDotenv } from "dotenv";
loadDotenv();

import { OptimizeTelemetryService } from "../../server/src/services/observability/OptimizeTelemetryService.js";
import { SuggestionsTelemetryService } from "../../server/src/services/observability/SuggestionsTelemetryService.js";
import { SpanLabelingTelemetryService } from "../../server/src/services/observability/SpanLabelingTelemetryService.js";
import { LlmCallTelemetryService } from "../../server/src/services/observability/LlmCallTelemetryService.js";

import {
  createSyntheticEmitter,
  loadPrompts,
  type DriverSummary,
} from "./utils/request-helper.js";
import { createSyntheticAIService } from "./utils/aiService.js";
import { driveOptimize } from "./drivers/optimize.driver.js";
import { driveSuggestions } from "./drivers/suggestions.driver.js";
import { driveSpanLabels } from "./drivers/span-labeling.driver.js";

type Surface = "optimize" | "suggestions" | "span-labels";

interface CliConfig {
  surfaces: Set<Surface>;
  variantTag: string | null;
}

function parseArgs(argv: string[]): CliConfig {
  const surfaces = new Set<Surface>();
  let only: string | undefined;
  let variantTag: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--only") {
      only = argv[++i];
      if (!only) {
        console.error("--only requires a value (e.g., --only optimize)");
        process.exit(2);
      }
    } else if (argv[i] === "--variant-tag") {
      const value = argv[++i];
      if (!value) {
        console.error(
          "--variant-tag requires a value (e.g., --variant-tag qwen)",
        );
        process.exit(2);
      }
      variantTag = value;
    }
  }
  if (only) {
    for (const name of only.split(",")) {
      const trimmed = name.trim();
      if (
        trimmed === "optimize" ||
        trimmed === "suggestions" ||
        trimmed === "span-labels"
      ) {
        surfaces.add(trimmed);
      } else {
        console.error(`Unknown surface: ${trimmed}`);
        process.exit(2);
      }
    }
  } else {
    surfaces.add("optimize");
    surfaces.add("suggestions");
    surfaces.add("span-labels");
  }
  return { surfaces, variantTag };
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv.slice(2));
  const prompts = await loadPrompts();

  const client = createSyntheticEmitter();
  if (!process.env.POSTHOG_API_KEY) {
    console.warn(
      "POSTHOG_API_KEY not set — running in no-op mode, no events will land in PostHog.",
    );
  }

  const optimize = new OptimizeTelemetryService(client);
  const suggestions = new SuggestionsTelemetryService(client);
  const spanLabels = new SpanLabelingTelemetryService(client);

  // Drivers no longer call llm.record() manually; the real AIModelService
  // emits llm.call.completed via the telemetry hook. Wrap the service's
  // record() so the harness summary can report the actual event count
  // instead of a hardcoded 0 per driver.
  const llm = new LlmCallTelemetryService(client);
  let llmEventCount = 0;
  const originalRecord = llm.record.bind(llm);
  llm.record = (...args: Parameters<typeof llm.record>) => {
    llmEventCount += 1;
    return originalRecord(...args);
  };
  const aiService = createSyntheticAIService({ llmCallTelemetry: llm });

  const variantSuffix = config.variantTag
    ? ` [variant=${config.variantTag}]`
    : "";
  console.log(
    `Running synthetic harness with ${prompts.length} prompts${variantSuffix}. Surfaces: ${[...config.surfaces].join(", ")}`,
  );

  try {
    const summaries: DriverSummary[] = [];
    if (config.surfaces.has("optimize")) {
      summaries.push(
        await driveOptimize(
          { optimize, aiService, variantTag: config.variantTag },
          prompts,
        ),
      );
    }
    if (config.surfaces.has("suggestions")) {
      summaries.push(
        await driveSuggestions(
          { suggestions, aiService, variantTag: config.variantTag },
          prompts,
        ),
      );
    }
    if (config.surfaces.has("span-labels")) {
      summaries.push(
        await driveSpanLabels(
          { spanLabels, aiService, variantTag: config.variantTag },
          prompts,
        ),
      );
    }

    console.log("\n=== Summary ===");
    let totalSurface = 0;
    for (const s of summaries) {
      console.log(
        `${s.surface}: ${s.surfaceEventsEmitted} surface events (across ${s.promptCount} prompts)`,
      );
      totalSurface += s.surfaceEventsEmitted;
    }
    console.log(
      `TOTAL: ${totalSurface + llmEventCount} events (${totalSurface} surface + ${llmEventCount} llm.call from AIModelService telemetry)`,
    );
  } finally {
    // Flush + close — events are queued in-process by posthog-node otherwise.
    await client.shutdown();
  }
}

main().catch((err) => {
  console.error("Harness failed:", err);
  process.exit(1);
});
