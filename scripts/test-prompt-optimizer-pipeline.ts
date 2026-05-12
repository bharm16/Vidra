#!/usr/bin/env tsx

import { config as loadEnv } from "dotenv";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

import type { PromptOptimizationService } from "../server/src/services/prompt-optimization/PromptOptimizationService.ts";
import type { VideoPromptService } from "../server/src/services/video-prompt-analysis/VideoPromptService.ts";
import { resolvePromptModelId } from "../server/src/config/videoModelRegistry.ts";

interface CliOptions {
  prompts: string[];
  filePath?: string;
  timeoutMs: number;
  modelFilter?: string[];
  skipInitialize: boolean;
  verbose: boolean;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

function printUsage(): void {
  console.log(`\nPrompt Optimizer Pipeline Test\n
Usage:
  tsx --tsconfig server/tsconfig.json scripts/test-prompt-optimizer-pipeline.ts --prompt "your prompt"
  tsx --tsconfig server/tsconfig.json scripts/test-prompt-optimizer-pipeline.ts --prompt "p1" --prompt "p2"
  tsx --tsconfig server/tsconfig.json scripts/test-prompt-optimizer-pipeline.ts --file ./prompts.txt
  tsx --tsconfig server/tsconfig.json scripts/test-prompt-optimizer-pipeline.ts "single positional prompt"

Options:
  --prompt <text>       Add a prompt (repeatable)
  --file <path>         Read prompts from file (JSON or newline-delimited text)
  --models <csv>        Restrict model-specific optimization runs to these IDs/aliases
  --timeout-ms <ms>     Optimization timeout per pipeline run (default: ${DEFAULT_TIMEOUT_MS})
  --skip-initialize     Skip initializeServices() startup checks
  --verbose             Keep server logger output enabled
  --help                Show this help\n`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizePrompt(text: string): string {
  return text.trim();
}

function parsePromptArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const prompts: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const normalized = normalizePrompt(item);
      if (normalized) {
        prompts.push(normalized);
      }
      continue;
    }

    if (isRecord(item)) {
      const candidate = item.prompt;
      if (typeof candidate === "string") {
        const normalized = normalizePrompt(candidate);
        if (normalized) {
          prompts.push(normalized);
        }
      }
    }
  }

  return prompts;
}

function loadEnvFiles(repoRoot: string): void {
  const candidates = [
    path.join(repoRoot, ".env.development.local"),
    path.join(repoRoot, ".env.local"),
    path.join(repoRoot, ".env.development"),
    path.join(repoRoot, ".env"),
  ];

  for (const file of candidates) {
    if (!existsSync(file)) {
      continue;
    }
    loadEnv({ path: file });
  }
}

function applyEnvFallbacks(): void {
  if (
    !process.env.FIREBASE_STORAGE_BUCKET &&
    process.env.VITE_FIREBASE_STORAGE_BUCKET
  ) {
    process.env.FIREBASE_STORAGE_BUCKET =
      process.env.VITE_FIREBASE_STORAGE_BUCKET;
  }

  if (!process.env.GCS_BUCKET_NAME && process.env.FIREBASE_STORAGE_BUCKET) {
    process.env.GCS_BUCKET_NAME = process.env.FIREBASE_STORAGE_BUCKET;
  }

  if (!process.env.OPENAI_API_KEY && process.env.VITE_OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = process.env.VITE_OPENAI_API_KEY;
  }

  if (!process.env.GROQ_API_KEY && process.env.VITE_GROQ_API_KEY) {
    process.env.GROQ_API_KEY = process.env.VITE_GROQ_API_KEY;
  }

  if (!process.env.GEMINI_API_KEY && process.env.VITE_GEMINI_API_KEY) {
    process.env.GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
  }
}

function loadPromptsFromFile(filePath: string): string[] {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(REPO_ROOT, filePath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Prompt file not found: ${absolutePath}`);
  }

  const raw = readFileSync(absolutePath, "utf8").trim();
  if (!raw) {
    throw new Error(`Prompt file is empty: ${absolutePath}`);
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    const directArray = parsePromptArray(parsed);
    if (directArray.length > 0) {
      return directArray;
    }

    if (isRecord(parsed)) {
      const nestedPrompts = parsePromptArray(parsed.prompts);
      if (nestedPrompts.length > 0) {
        return nestedPrompts;
      }
    }
  } catch {
    // Fall back to line-delimited text parsing below.
  }

  return raw
    .split(/\r?\n/)
    .map((line) => normalizePrompt(line))
    .filter((line) => line.length > 0);
}

function parseCliArgs(argv: string[]): CliOptions {
  const prompts: string[] = [];
  let filePath: string | undefined;
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  let modelFilter: string[] | undefined;
  let skipInitialize = false;
  let verbose = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    if (arg === "--prompt") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --prompt");
      }
      prompts.push(normalizePrompt(value));
      i += 1;
      continue;
    }

    if (arg === "--file") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --file");
      }
      filePath = value;
      i += 1;
      continue;
    }

    if (arg === "--timeout-ms") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --timeout-ms");
      }
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid --timeout-ms value: ${value}`);
      }
      timeoutMs = parsed;
      i += 1;
      continue;
    }

    if (arg === "--models") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --models");
      }
      modelFilter = value
        .split(",")
        .map((model) => model.trim())
        .filter((model) => model.length > 0);
      i += 1;
      continue;
    }

    if (arg === "--skip-initialize") {
      skipInitialize = true;
      continue;
    }

    if (arg === "--verbose") {
      verbose = true;
      continue;
    }

    if (arg === undefined) continue;

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    prompts.push(normalizePrompt(arg));
  }

  return {
    prompts: prompts.filter((prompt) => prompt.length > 0),
    ...(filePath ? { filePath } : {}),
    timeoutMs,
    ...(modelFilter && modelFilter.length > 0 ? { modelFilter } : {}),
    skipInitialize,
    verbose,
  };
}

function selectModels(
  requested: string[] | undefined,
  supported: string[],
): string[] {
  if (!requested || requested.length === 0) {
    return supported;
  }

  const supportedSet = new Set(supported);
  const selected: string[] = [];
  const unknown: string[] = [];

  for (const rawModel of requested) {
    const resolved = resolvePromptModelId(rawModel) ?? rawModel;
    if (!supportedSet.has(resolved)) {
      unknown.push(rawModel);
      continue;
    }
    if (!selected.includes(resolved)) {
      selected.push(resolved);
    }
  }

  if (unknown.length > 0) {
    throw new Error(
      `Unknown model(s): ${unknown.join(", ")}. Supported models: ${supported.join(", ")}`,
    );
  }

  return selected;
}

async function runOptimization(
  promptOptimizationService: PromptOptimizationService,
  prompt: string,
  timeoutMs: number,
  targetModel?: string,
): Promise<string> {
  const signal = AbortSignal.timeout(timeoutMs);
  const result = await promptOptimizationService.optimize({
    prompt,
    mode: "video",
    ...(targetModel ? { targetModel } : {}),
    signal,
  });
  return result.prompt.trim();
}

async function main(): Promise<void> {
  loadEnvFiles(REPO_ROOT);
  applyEnvFallbacks();

  const cli = parseCliArgs(process.argv.slice(2));

  // Keep script output readable unless explicitly requested.
  if (!cli.verbose) {
    process.env.LOG_LEVEL = "fatal";
  }

  const filePrompts = cli.filePath ? loadPromptsFromFile(cli.filePath) : [];
  const allPrompts = [...cli.prompts, ...filePrompts].filter(
    (prompt) => prompt.length > 0,
  );

  if (allPrompts.length === 0) {
    printUsage();
    throw new Error(
      "No prompts provided. Use --prompt, --file, or positional prompt text.",
    );
  }

  // Service registration imports storage config eagerly; allow script use without storage env vars.
  if (!process.env.GCS_BUCKET_NAME && !process.env.FIREBASE_STORAGE_BUCKET) {
    process.env.GCS_BUCKET_NAME = "local-script-placeholder.appspot.com";
  }

  const { configureServices, initializeServices } = await import(
    "../server/src/config/services.config.ts"
  );
  const container = await configureServices();

  if (!cli.skipInitialize) {
    try {
      await initializeServices(container);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("initializeServices() failed, continuing anyway:", message);
    }
  }

  const promptOptimizationService =
    container.resolve<PromptOptimizationService>("promptOptimizationService");
  const videoService = container.resolve<VideoPromptService>("videoService");

  const supportedModels = videoService.getSupportedModelIds();
  const selectedModels = selectModels(cli.modelFilter, supportedModels);

  console.log("=".repeat(90));
  console.log("Prompt Optimizer Pipeline Test");
  console.log("=".repeat(90));
  console.log(`Prompts: ${allPrompts.length}`);
  console.log(`Model-specific runs: ${selectedModels.join(", ")}`);
  console.log(`Timeout per pipeline run: ${cli.timeoutMs}ms`);
  console.log("");

  for (let index = 0; index < allPrompts.length; index += 1) {
    const rawPrompt = allPrompts[index];
    if (rawPrompt === undefined) continue;

    console.log("-".repeat(90));
    console.log(`Prompt ${index + 1}/${allPrompts.length}`);
    console.log("-".repeat(90));
    console.log("[RAW USER PROMPT]");
    console.log(rawPrompt);
    console.log("");

    let genericOptimizedPrompt = "";
    try {
      genericOptimizedPrompt = await runOptimization(
        promptOptimizationService,
        rawPrompt,
        cli.timeoutMs,
      );
      console.log("[GENERIC PIPELINE RESULT]");
      console.log(genericOptimizedPrompt);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[GENERIC PIPELINE RESULT] ERROR: ${message}`);
      continue;
    }

    for (const modelId of selectedModels) {
      console.log("");
      try {
        const modelOptimizedPrompt = await runOptimization(
          promptOptimizationService,
          rawPrompt,
          cli.timeoutMs,
          modelId,
        );
        console.log(`[MODEL PIPELINE: ${modelId}]`);
        console.log(modelOptimizedPrompt);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[MODEL PIPELINE: ${modelId}] ERROR: ${message}`);
      }
    }

    console.log("");
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nScript failed: ${message}`);
  process.exit(1);
});
