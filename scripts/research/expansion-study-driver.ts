#!/usr/bin/env tsx
/**
 * Expansion-study session driver — the fixed script of exact calls required by
 * docs/research/expansion-study-protocol.md. Runs one idea through the
 * single-shot loop, per arm:
 *
 *   raw:      idea (verbatim) -> first frame -> motion idea -> Luma render
 *   expanded: idea -> optimize(targetModel luma) -> first frame -> motion idea -> Luma render
 *
 * Everything except the expansion step is identical between arms (same image
 * provider, same motion call, same render model, first motion idea always
 * taken). Do not improvise per-participant: edits here are protocol
 * amendments and must happen before a session, never during one.
 *
 * Usage:
 *   npx tsx --tsconfig server/tsconfig.json scripts/research/expansion-study-driver.ts \
 *     --idea "my golden retriever catching a frisbee at the park" \
 *     [--arm raw|expanded|both] [--skip-render] [--verbose]
 */

import { config as loadEnv } from "dotenv";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

import type { PromptOptimizationService } from "../../server/src/services/prompt-optimization/PromptOptimizationService.ts";
import type { ImageGenerationService } from "../../server/src/services/image-generation/ImageGenerationService.ts";
import type { VideoGenerationService } from "../../server/src/services/video-generation/VideoGenerationService.ts";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");

const STUDY_USER_ID = "expansion-study";
const RENDER_MODEL = "luma-ray3";
const ASPECT_RATIO = "16:9" as const;
const OPTIMIZE_TIMEOUT_MS = 120_000;

type Arm = "raw" | "expanded";

interface CliOptions {
  idea: string;
  arms: Arm[];
  skipRender: boolean;
  verbose: boolean;
}

interface ArmResult {
  arm: Arm;
  framePrompt: string;
  frameUrl: string;
  motionPrompt: string;
  videoUrl?: string;
  stageDurationsMs: Record<string, number>;
}

function parseCliArgs(argv: string[]): CliOptions {
  let idea = "";
  let arms: Arm[] = ["raw", "expanded"];
  let skipRender = false;
  let verbose = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--idea") {
      idea = (argv[i + 1] ?? "").trim();
      i += 1;
    } else if (arg === "--arm") {
      const value = argv[i + 1] ?? "";
      if (value === "raw" || value === "expanded") {
        arms = [value];
      } else if (value !== "both") {
        throw new Error(`Invalid --arm value: ${value}`);
      }
      i += 1;
    } else if (arg === "--skip-render") {
      skipRender = true;
    } else if (arg === "--verbose") {
      verbose = true;
    } else if (arg !== undefined && !arg.startsWith("--") && !idea) {
      idea = arg.trim();
    }
  }

  if (!idea) {
    throw new Error(
      'An idea is required: --idea "my golden retriever catching a frisbee"',
    );
  }

  return { idea, arms, skipRender, verbose };
}

function loadEnvFiles(repoRoot: string): void {
  const candidates = [
    path.join(repoRoot, ".env.development.local"),
    path.join(repoRoot, ".env.local"),
    path.join(repoRoot, ".env.development"),
    path.join(repoRoot, ".env"),
  ];
  for (const file of candidates) {
    if (existsSync(file)) {
      loadEnv({ path: file });
    }
  }
}

async function timed<T>(
  label: string,
  durations: Record<string, number>,
  fn: () => Promise<T>,
): Promise<T> {
  const start = performance.now();
  const result = await fn();
  durations[label] = Math.round(performance.now() - start);
  return result;
}

async function runArm(
  arm: Arm,
  idea: string,
  services: {
    promptOptimizationService: PromptOptimizationService;
    imageGenerationService: ImageGenerationService;
    videoGenerationService: VideoGenerationService;
  },
  skipRender: boolean,
): Promise<ArmResult> {
  const durations: Record<string, number> = {};

  console.log(`\n${"=".repeat(80)}`);
  console.log(`ARM: ${arm.toUpperCase()}`);
  console.log("=".repeat(80));

  // Stage 1 — expansion (expanded arm only; raw arm uses the idea verbatim).
  let framePrompt = idea;
  if (arm === "expanded") {
    const optimized = await timed("expansion", durations, () =>
      services.promptOptimizationService.optimize({
        prompt: idea,
        mode: "video",
        targetModel: RENDER_MODEL,
        signal: AbortSignal.timeout(OPTIMIZE_TIMEOUT_MS),
      }),
    );
    framePrompt = optimized.prompt.trim();
  }
  console.log(`\n[FRAME PROMPT]\n${framePrompt}`);

  // Stage 2 — first frame.
  const frame = await timed("first-frame", durations, () =>
    services.imageGenerationService.generatePreview(framePrompt, {
      userId: STUDY_USER_ID,
      aspectRatio: ASPECT_RATIO,
    }),
  );
  const frameUrl = frame.providerUrl ?? frame.imageUrl;
  console.log(`\n[FIRST FRAME] ${frameUrl}`);

  // Stage 3 — motion. The i2v-motion-ideas service was removed (ADR-0011 D6:
  // no standalone motion surface), so the study uses one fixed motion prompt —
  // identical across both arms, keeping expansion the only variable.
  const motionPrompt = "subtle natural movement";
  console.log(`\n[MOTION PROMPT] ${motionPrompt} (fixed)`);

  // Stage 4 — render.
  let videoUrl: string | undefined;
  if (skipRender) {
    console.log("\n[RENDER] skipped (--skip-render)");
  } else {
    const video = await timed("render", durations, () =>
      services.videoGenerationService.generateVideo(motionPrompt, {
        model: RENDER_MODEL,
        startImage: frameUrl,
        aspectRatio: ASPECT_RATIO,
      }),
    );
    videoUrl = video.viewUrl ?? video.videoUrl;
    console.log(`\n[VIDEO] ${videoUrl}`);
  }

  console.log(`\n[TIMINGS] ${JSON.stringify(durations)}`);
  const result: ArmResult = {
    arm,
    framePrompt,
    frameUrl,
    motionPrompt,
    stageDurationsMs: durations,
  };
  if (videoUrl !== undefined) {
    result.videoUrl = videoUrl;
  }
  return result;
}

async function main(): Promise<void> {
  loadEnvFiles(REPO_ROOT);
  const cli = parseCliArgs(process.argv.slice(2));

  if (!cli.verbose) {
    process.env.LOG_LEVEL = "fatal";
  }

  const { configureServices } = await import(
    "../../server/src/config/services.config.ts"
  );
  const container = await configureServices();

  const services = {
    promptOptimizationService: container.resolve<PromptOptimizationService>(
      "promptOptimizationService",
    ),
    imageGenerationService: container.resolve<ImageGenerationService>(
      "imageGenerationService",
    ),
    videoGenerationService: container.resolve<VideoGenerationService>(
      "videoGenerationService",
    ),
  };

  console.log("Expansion Study Driver");
  console.log(`Idea: ${cli.idea}`);
  console.log(`Arms: ${cli.arms.join(", ")}`);
  console.log(`Render: ${cli.skipRender ? "SKIPPED" : RENDER_MODEL}`);

  const results: ArmResult[] = [];
  for (const arm of cli.arms) {
    results.push(await runArm(arm, cli.idea, services, cli.skipRender));
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log("SESSION SUMMARY (JSON)");
  console.log("=".repeat(80));
  console.log(JSON.stringify({ idea: cli.idea, results }, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nDriver failed: ${message}`);
  process.exit(1);
});
