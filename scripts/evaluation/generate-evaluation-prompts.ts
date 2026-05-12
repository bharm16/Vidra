#!/usr/bin/env tsx

/**
 * Generate Evaluation Prompts
 *
 * Takes real user inputs and regenerates outputs using current optimizer.
 * Creates a clean baseline with consistent output format.
 *
 * Usage:
 *   npx tsx scripts/evaluation/generate-evaluation-prompts.ts
 *   npx tsx scripts/evaluation/generate-evaluation-prompts.ts --sample 20
 *   npx tsx scripts/evaluation/generate-evaluation-prompts.ts --input path/to/prompts.json
 *
 * Output:
 *   scripts/evaluation/data/evaluation-prompts-{timestamp}.json
 */

import { config as loadEnv } from "dotenv";

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
} from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { AIModelService } from "../../server/src/services/ai-model/AIModelService.js";
import type { ClientsMap } from "../../server/src/services/ai-model/types.js";
import { OpenAICompatibleAdapter } from "../../server/src/clients/adapters/OpenAICompatibleAdapter.js";
import { PromptOptimizationService } from "../../server/src/services/prompt-optimization/PromptOptimizationService.js";
import { ImageObservationService } from "../../server/src/services/image-observation/ImageObservationService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

loadEnv({ path: join(__dirname, "../..", ".env") });

const DATA_DIR = join(__dirname, "data");

// =============================================================================
// Timestamp Utilities (Local Time)
// =============================================================================

/**
 * Get current timestamp in local time, ISO-like format.
 * Returns: "2025-12-23T11:30:45" (local time, no timezone suffix)
 */
function getLocalTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

/**
 * Get filename-safe local timestamp.
 * Returns: "2025-12-23T11-30-45"
 */
function getLocalTimestampForFilename(): string {
  return getLocalTimestamp().replace(/:/g, "-");
}

interface RawPromptRecord {
  id?: string;
  uuid?: string;
  input: string;
  output?: string;
  timestamp?: string;
}

interface EvaluationPrompt {
  id: string;
  input: string;
  output: string;
  generatedAt: string;
  optimizerVersion: string;
  latencyMs: number;
  error: string | null;
}

interface EvaluationDataset {
  metadata: {
    generatedAt: string;
    sourceFile: string;
    promptCount: number;
    successCount: number;
    errorCount: number;
    optimizerVersion: string;
    avgLatencyMs: number;
  };
  prompts: EvaluationPrompt[];
}

// =============================================================================
// AI Service Setup
// =============================================================================

function createAIService(): AIModelService {
  const clients: ClientsMap = { openai: null };
  const groqTimeoutMs = Number(process.env.GROQ_TIMEOUT_MS || 5000);
  const openaiTimeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || 60000);
  const groqModel = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
  const openaiModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const groqBaseURL =
    process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
  const openaiBaseURL =
    process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

  if (process.env.GROQ_API_KEY) {
    clients.groq = new OpenAICompatibleAdapter({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: groqBaseURL,
      defaultModel: groqModel,
      defaultTimeout: groqTimeoutMs,
      providerName: "groq",
    });
  }

  if (process.env.OPENAI_API_KEY) {
    clients.openai = new OpenAICompatibleAdapter({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: openaiBaseURL,
      defaultModel: openaiModel,
      defaultTimeout: openaiTimeoutMs,
      providerName: "openai",
    });

    // Also add as chatgpt for draft generation
    clients.chatgpt = new OpenAICompatibleAdapter({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: openaiBaseURL,
      defaultModel: openaiModel,
      defaultTimeout: openaiTimeoutMs,
      providerName: "chatgpt",
    });
  }

  if (!clients.openai && clients.groq) {
    clients.openai = clients.groq;
  }

  if (!clients.openai) {
    throw new Error("No AI API keys found. Set GROQ_API_KEY or OPENAI_API_KEY");
  }

  return new AIModelService({ clients });
}

// =============================================================================
// Prompt Loading
// =============================================================================

function findLatestPromptsFile(): string | null {
  // First check for input-prompts.json in the evaluation directory
  const evalDir = __dirname;
  const evalFile = join(evalDir, "input-prompts.json");
  if (existsSync(evalFile)) {
    return evalFile;
  }

  // Then check project root
  const projectRoot = join(__dirname, "../..");
  const rootFile = join(projectRoot, "input-prompts.json");
  if (existsSync(rootFile)) {
    return rootFile;
  }

  // Fall back to timestamped versions (input-prompts-*.json) in project root
  const files = readdirSync(projectRoot)
    .filter((f) => f.startsWith("input-prompts-") && f.endsWith(".json"))
    .sort()
    .reverse();

  const newest = files[0];
  return newest ? join(projectRoot, newest) : null;
}

function loadRawPrompts(filePath: string): RawPromptRecord[] {
  const data = JSON.parse(readFileSync(filePath, "utf-8"));
  return data as RawPromptRecord[];
}

function extractUniqueInputs(
  records: RawPromptRecord[],
): Map<string, RawPromptRecord> {
  const uniqueInputs = new Map<string, RawPromptRecord>();

  for (const record of records) {
    const input = record.input?.trim();
    if (!input) continue;

    // Use input as key to dedupe, keep first occurrence
    if (!uniqueInputs.has(input)) {
      uniqueInputs.set(input, record);
    }
  }

  return uniqueInputs;
}

// =============================================================================
// Optimization
// =============================================================================

async function optimizePrompt(
  input: string,
  optimizer: PromptOptimizationService,
  timeoutMs: number = 30000,
): Promise<{ output: string; latencyMs: number; error: string | null }> {
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const result = await optimizer.optimize({
      prompt: input,
      mode: "video",
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const output = result.prompt || "";

    return {
      output,
      latencyMs: Date.now() - startTime,
      error: null,
    };
  } catch (error) {
    return {
      output: "",
      latencyMs: Date.now() - startTime,
      error: (error as Error).message,
    };
  }
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  // Parse CLI args
  const args = process.argv.slice(2);
  let inputFile = findLatestPromptsFile();
  let sampleSize: number | null = null;

  for (let i = 0; i < args.length; i++) {
    const next = args[i + 1];
    if (args[i] === "--input" && next !== undefined) {
      inputFile = next;
      i++;
    } else if (args[i] === "--sample" && next !== undefined) {
      sampleSize = parseInt(next, 10);
      i++;
    }
  }

  if (!inputFile || !existsSync(inputFile)) {
    console.error(
      "No prompts file found. Specify with --input or place input-prompts-*.json in project root.",
    );
    process.exit(1);
  }

  // Ensure data directory exists
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  console.log(`Loading prompts from: ${inputFile}`);
  const rawPrompts = loadRawPrompts(inputFile);
  console.log(`Found ${rawPrompts.length} total records`);

  // Extract unique inputs
  const uniqueInputs = extractUniqueInputs(rawPrompts);
  console.log(`Found ${uniqueInputs.size} unique inputs`);

  // Convert to array for processing
  let inputsToProcess = Array.from(uniqueInputs.entries()).map(
    ([input, record]) => ({
      id:
        record.id ||
        record.uuid ||
        `prompt-${Math.random().toString(36).slice(2, 10)}`,
      input,
    }),
  );

  // Sample if requested
  if (sampleSize && sampleSize < inputsToProcess.length) {
    console.log(`Sampling ${sampleSize} prompts...`);
    inputsToProcess = inputsToProcess
      .sort(() => Math.random() - 0.5)
      .slice(0, sampleSize);
  }

  // Create services
  console.log("\nInitializing AI services...");
  const aiService = createAIService();
  const nullCache = {
    getConfig: () => ({ ttl: 60, namespace: "eval" }),
    get: async () => null,
    set: async () => true,
    generateKey: () => "eval",
  } as never;
  const imageObserver = new ImageObservationService(aiService, nullCache);
  const optimizer = new PromptOptimizationService(
    aiService,
    nullCache,
    null,
    imageObserver,
  );
  console.log("Services ready\n");

  // Process each prompt
  const results: EvaluationPrompt[] = [];
  const startTime = Date.now();

  console.log(`Generating ${inputsToProcess.length} optimized prompts...\n`);

  for (let i = 0; i < inputsToProcess.length; i++) {
    const next = inputsToProcess[i];
    if (next === undefined) continue;
    const { id, input } = next;

    // Progress indicator
    const progress = `[${(i + 1).toString().padStart(3)}/${inputsToProcess.length}]`;
    const truncatedInput =
      input.length > 40 ? input.slice(0, 40) + "..." : input;
    process.stdout.write(`${progress} "${truncatedInput}"... `);

    const result = await optimizePrompt(input, optimizer);

    if (result.error) {
      console.log(`❌ Error: ${result.error.slice(0, 50)}`);
    } else {
      console.log(`✅ ${result.latencyMs}ms`);
    }

    results.push({
      id,
      input,
      output: result.output,
      generatedAt: getLocalTimestamp(),
      optimizerVersion: "v3-run-optimize-flow",
      latencyMs: result.latencyMs,
      error: result.error,
    });

    // Rate limiting - wait between requests
    if (i < inputsToProcess.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // Calculate stats
  const successResults = results.filter((r) => !r.error);
  const totalLatency = successResults.reduce((sum, r) => sum + r.latencyMs, 0);
  const avgLatency =
    successResults.length > 0 ? totalLatency / successResults.length : 0;

  // Build dataset
  const dataset: EvaluationDataset = {
    metadata: {
      generatedAt: getLocalTimestamp(),
      sourceFile: inputFile,
      promptCount: results.length,
      successCount: successResults.length,
      errorCount: results.length - successResults.length,
      optimizerVersion: "v3-run-optimize-flow",
      avgLatencyMs: Math.round(avgLatency),
    },
    prompts: results,
  };

  // Save to file
  const timestamp = getLocalTimestampForFilename();
  const outputPath = join(DATA_DIR, `evaluation-prompts-${timestamp}.json`);
  writeFileSync(outputPath, JSON.stringify(dataset, null, 2));

  // Also save as "latest" for easy reference
  const latestPath = join(DATA_DIR, "evaluation-prompts-latest.json");
  writeFileSync(latestPath, JSON.stringify(dataset, null, 2));

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("  GENERATION COMPLETE");
  console.log("=".repeat(60));
  console.log(`  Total prompts:    ${results.length}`);
  console.log(`  Successful:       ${successResults.length}`);
  console.log(`  Errors:           ${results.length - successResults.length}`);
  console.log(`  Avg latency:      ${Math.round(avgLatency)}ms`);
  console.log(
    `  Total time:       ${Math.round((Date.now() - startTime) / 1000)}s`,
  );
  console.log();
  console.log(`  Output saved to:`);
  console.log(`    ${outputPath}`);
  console.log(`    ${latestPath}`);
  console.log("=".repeat(60));

  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
