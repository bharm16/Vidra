#!/usr/bin/env tsx

/**
 * Improve Wording Evaluation
 *
 * Runs fixed sample words through Improve wording's guided rewrite, at least
 * once per distinct wording guidance (it refuses to run when one has no case),
 * and scores each result with
 * mechanical checks: quoted words kept letter for letter, no rule text leaking
 * into the result, edits kept short, no "no X" wording for models that misread
 * it, nothing invented to appear on screen.
 *
 * Run it before changing improve_wording in server/src/config/modelConfig.ts:
 * pin the candidate with flags, compare, then change the code. The pinned
 * provider is strict, so a missing key fails instead of quietly falling back.
 *
 * Usage:
 *   tsx scripts/evaluation/improve-wording.ts
 *   tsx scripts/evaluation/improve-wording.ts --provider anthropic --model claude-sonnet-5-5
 *   tsx scripts/evaluation/improve-wording.ts --effort medium --repeats 3
 *
 * Exit codes:
 *   0 = every check passed
 *   1 = at least one check failed
 *   2 = setup error
 *
 * Results (every rewrite, with its failures) go to
 * scripts/evaluation/improve-wording-results-latest.md.
 */

import { config as loadEnv } from "dotenv";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, "../..", ".env"), quiet: true });
process.env.LOG_LEVEL ||= "warn";

const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
type Effort = (typeof EFFORTS)[number];

interface CliOptions {
  provider?: string;
  model?: string;
  effort?: Effort;
  repeats: number;
}

interface Case {
  profile: string;
  words: string;
  /** Must appear in the result exactly. */
  keep?: string[];
  /** Must appear exactly once. */
  once?: string[];
  /** Every quoted phrase in the result must be one of these: nothing invented on screen. */
  onlyQuotes?: string[];
  require?: RegExp[];
  avoid?: RegExp[];
  maxWords?: number;
}

const NO_NEGATIVE_WORDS = /\b(no|without|not)\b/i;

const CASES: Case[] = [
  { profile: "wan-3-t2v", words: "a woman tells her dog 'we're going home now' on a rainy street, no music", once: ["we're going home now"], require: [/no (bgm|music)/i] },
  { profile: "wan-3-i2v", words: "make her turn and smile at the camera", require: [/smil/i] },
  { profile: "gemini-omni-1.1-t2v", words: "chef flips a pancake and says 'perfect!', all in one shot", keep: ["perfect!"], require: [/single continuous shot|no scene cuts/i] },
  { profile: "gemini-omni-1.1-i2v", words: "she turns and waves goodbye, then says 'see you soon'", keep: ["see you soon"], require: [/wave/i] },
  { profile: "gemini-omni-1.1-edit", words: "remove the phone from his hand", require: [/keep everything else the same/i], maxWords: 30 },
  { profile: "grok-imagine-video-extension", words: "the cat jumps off the table", require: [/cat/i], maxWords: 60 },
  { profile: "nano-banana-2.1", words: "poster for a coffee shop called Bean There, no people", require: [/"Bean There"/], avoid: [NO_NEGATIVE_WORDS], onlyQuotes: ["Bean There"] },
  { profile: "nano-banana-2.1-edit", words: "make the sofa green", require: [/keep everything else exactly the same/i], maxWords: 40 },
  { profile: "gpt-image-2.5-sunburst", words: "product shot of a perfume bottle with NOIR on the label, 16:9", keep: ["NOIR"], require: [/photorealistic|photograph/i] },
  { profile: "gpt-image-2.5-sunburst-edit", words: "change the label text to BLANC, keep the bottle the same", keep: ["BLANC"], require: [/change only|do not change anything else/i], maxWords: 60 },
  { profile: "ideogram-4.5-precise-edit", words: "replace the sky with a sunset, no clouds", require: [/keep/i], avoid: [NO_NEGATIVE_WORDS], maxWords: 40 },
  { profile: "recraft-v4.1-svg", words: "fox logo", require: [/fox/i, /vector/i] },
  { profile: "recraft-v4.1-svg", words: "coffee cup icon", require: [/coffee cup/i] },
  { profile: "recraft-v4.1", words: "tiny house on a hill", require: [/tiny house/i] },
  { profile: "lyria-3", words: "upbeat synthwave for a car ad like the weeknd. Lyrics: drive all night, chase the light", keep: ["drive all night, chase the light"], require: [/Lyrics:/], avoid: [/weeknd/i] },
];

/** Text from the rewrite's own instructions or guidance must never reach the model. */
const LEAKS = /model guidance|return only|improved words|without naming|real artist|the creator/i;

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { repeats: 1 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === "--provider" && value) { opts.provider = value; i++; }
    else if (arg === "--model" && value) { opts.model = value; i++; }
    else if (arg === "--effort" && value && (EFFORTS as readonly string[]).includes(value)) { opts.effort = value as Effort; i++; }
    else if (arg === "--repeats" && value && Number.parseInt(value, 10) > 0) { opts.repeats = Number.parseInt(value, 10); i++; }
    else throw new Error(`Usage: improve-wording.ts [--provider name] [--model id] [--effort ${EFFORTS.join("|")}] [--repeats N] (got ${arg})`);
  }
  return opts;
}

function failures(c: Case, out: string): string[] {
  const words = out.split(/\s+/).filter(Boolean).length;
  return [
    ...(out.trim() ? [] : ["empty"]),
    ...(LEAKS.test(out) ? ["instructions leaked"] : []),
    ...(c.keep ?? []).filter((text) => !out.includes(text)).map((text) => `changed ${JSON.stringify(text)}`),
    ...(c.once ?? []).flatMap((text) => {
      const count = out.split(text).length - 1;
      return count === 1 ? [] : [`${JSON.stringify(text)} x${count}`];
    }),
    ...(c.onlyQuotes
      ? [...out.matchAll(/"([^"]+)"/g)].map((match) => match[1] ?? "").filter((quote) => !c.onlyQuotes?.includes(quote)).map((quote) => `invented "${quote}"`)
      : []),
    ...(c.require ?? []).filter((pattern) => !pattern.test(out)).map((pattern) => `missing ${pattern}`),
    ...(c.avoid ?? []).filter((pattern) => pattern.test(out)).map((pattern) => `contains ${pattern}`),
    ...(c.maxWords && words > c.maxWords ? [`${words} words > ${c.maxWords}`] : []),
  ];
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));
  const { ModelConfig, isOperationName } = await import("../../server/src/config/modelConfig.js");
  const { isRegisteredLlmClient } = await import("../../server/src/config/llmClients.js");
  const { DIContainer } = await import("../../server/src/infrastructure/DIContainer.js");
  const { registerCoreServices } = await import("../../server/src/config/services/core.services.js");
  const { registerLLMServices } = await import("../../server/src/config/services/llm.services.js");
  const { GuidedWordingService } = await import("../../server/src/services/prompt-optimization/services/GuidedWordingService.js");
  const { REPLICATE_MODEL_DEFINITIONS, wordingGuidanceFor } = await import("../../server/src/services/creation-requests/models.js");
  const { AIModelService } = await import("../../server/src/services/ai-model/AIModelService.js");

  if (!isOperationName("improve_wording")) throw new Error("improve_wording operation is missing");
  if (opts.provider && !isRegisteredLlmClient(opts.provider)) {
    console.error(`Unknown --provider ${opts.provider}`);
    return 2;
  }
  // Pin the candidate in-process, strictly: an eval must never measure a fallback.
  ModelConfig.improve_wording = {
    ...ModelConfig.improve_wording,
    ...(opts.provider ? { client: opts.provider } : {}),
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.effort ? { effort: opts.effort } : {}),
    strictClient: true,
  };
  const pinned = ModelConfig.improve_wording;

  const container = new DIContainer();
  registerCoreServices(container);
  registerLLMServices(container);
  const ai = container.resolve<InstanceType<typeof AIModelService>>("aiService");
  if (!ai.getAvailableClients().includes(pinned.client)) {
    console.error(`No ${pinned.client} key configured; set it in .env.`);
    return 2;
  }
  const service = new GuidedWordingService(ai);

  // Every distinct guidance must have a case, so a guidance or model change
  // can't pass without being exercised. Profiles that share guidance share one.
  const covered = new Set(CASES.map((c) => wordingGuidanceFor(c.profile)));
  const uncovered = REPLICATE_MODEL_DEFINITIONS.filter((d) => d.wordingGuidance && !covered.has(d.wordingGuidance)).map((d) => d.profile.id);
  if (uncovered.length) {
    console.error(`No case exercises the wording guidance of: ${uncovered.join(", ")}`);
    return 2;
  }

  console.log(`Improve wording eval: ${pinned.client} / ${pinned.model} / effort ${pinned.effort ?? "model default"} x${opts.repeats}\n`);
  const report: string[] = [`# Improve wording eval\n\n${pinned.client} / ${pinned.model} / effort ${pinned.effort ?? "model default"}, ${new Date().toISOString()}\n`];
  let passed = 0;
  let total = 0;
  let elapsed = 0;
  for (const c of CASES) {
    const guidance = wordingGuidanceFor(c.profile);
    if (!guidance) {
      console.error(`No wording guidance on ${c.profile}`);
      return 2;
    }
    for (let run = 1; run <= opts.repeats; run++) {
      const started = Date.now();
      let out = "";
      let failed: string[];
      try {
        out = (await service.rewrite(c.words, guidance)).prompt;
        failed = failures(c, out);
      } catch (error) {
        failed = [`error: ${(error as Error).message}`];
      }
      const ms = Date.now() - started;
      total++;
      elapsed += ms;
      if (!failed.length) passed++;
      console.log(`${failed.length ? "FAIL" : "ok  "} ${c.profile} #${run} (${ms} ms)${failed.length ? ` — ${failed.join("; ")}` : ""}`);
      report.push(`## ${c.profile} #${run} — ${failed.length ? `FAIL: ${failed.join("; ")}` : "ok"} (${ms} ms)\n\n**Words:** ${c.words}\n\n${out}\n`);
    }
  }
  const summary = `${passed}/${total} passed, average ${Math.round(elapsed / total)} ms`;
  console.log(`\n${summary}`);
  const resultsPath = join(__dirname, "improve-wording-results-latest.md");
  writeFileSync(resultsPath, `${report.join("\n")}\n**${summary}**\n`);
  console.log(`results: ${resultsPath}`);
  return passed === total ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error((error as Error).message);
    process.exit(2);
  },
);
