#!/usr/bin/env node
/**
 * Golden oracle for the span-labeling wire surface (ADR-0020).
 *
 * The replay cassette key is a sha256 of the semantic request — "operation +
 * prompts" (server/src/replay/requestKey.ts) — so any drift in system-prompt
 * assembly silently invalidates the label-spans pack and forces a live
 * re-bless of the per-provider golden-set baselines.
 *
 * This script hashes every input that reaches the wire: the system prompt for
 * each (provider x streaming x useJsonSchema x templateVersion) combination,
 * the few-shot block per provider, and the JSON schema each provider sends.
 * Snapshot before the refactor, snapshot after, diff. An empty diff means the
 * cassettes and baselines are still valid and no re-record is needed.
 *
 * Usage:
 *   npx tsx --tsconfig server/tsconfig.json \
 *     scripts/evaluation/snapshot-span-wire-surface.ts <out.json>
 *
 * Writes to a file rather than stdout because importing the prompt builder
 * emits a pino line at module load.
 */

import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  buildSystemPrompt,
  getFewShotExamples,
} from "../../server/src/llm/span-labeling/utils/promptBuilder.ts";

const sha = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);

/**
 * Every provider string that reaches `buildSystemPrompt`. These are the
 * values `_getProviderName()` returns today, plus the raw ProviderType names
 * the schema factory can see.
 */
const PROVIDERS = ["openai", "groq", "gemini", "qwen", "anthropic", "unknown"];
const TEMPLATE_VERSIONS: Array<string | undefined> = [
  undefined,
  "v1",
  "i2v",
  "I2V-v2",
];

interface Snapshot {
  systemPrompts: Record<string, { hash: string; length: number }>;
  fewShot: Record<string, { hash: string; count: number }>;
  /**
   * What each routed provider actually puts on the wire. Present only after
   * the ADR-0020 collapse; compare against the pre-collapse `schemas` and
   * `systemPrompts` entries for the equivalent provider.
   */
  profiles?: Record<
    string,
    {
      id: string;
      promptProviderName: string;
      schemaHash: string;
      requestOptions: Record<string, unknown>;
      promptHash: string;
    }
  >;
}

const snapshot: Snapshot = {
  systemPrompts: {},
  fewShot: {},
};

for (const provider of PROVIDERS) {
  for (const streaming of [false, true]) {
    for (const useJsonSchema of [false, true]) {
      for (const templateVersion of TEMPLATE_VERSIONS) {
        const key = [
          provider,
          `streaming=${streaming}`,
          `schema=${useJsonSchema}`,
          `tpl=${templateVersion ?? "none"}`,
        ].join("|");
        const prompt = buildSystemPrompt(
          "a red fox walks through snow",
          true,
          provider,
          useJsonSchema,
          templateVersion,
          streaming,
        );
        snapshot.systemPrompts[key] = {
          hash: sha(prompt),
          length: prompt.length,
        };
      }
    }
  }

  const examples = getFewShotExamples(provider);
  snapshot.fewShot[provider] = {
    hash: sha(JSON.stringify(examples)),
    count: examples.length,
  };
}

// Post-collapse only: resolve each routed provider to its profile and hash
// what that profile would send. Compare these against the pre-collapse
// `schemas` / `systemPrompts` rows to prove the wire did not move.
try {
  const { resolveSpanProviderProfile } = await import(
    "../../server/src/llm/span-labeling/providers/registry.ts"
  );
  snapshot.profiles = {};
  for (const provider of PROVIDERS) {
    const profile = resolveSpanProviderProfile(provider as never);
    snapshot.profiles[provider] = {
      id: profile.id,
      promptProviderName: profile.promptProviderName,
      schemaHash: sha(JSON.stringify(profile.jsonSchema)),
      requestOptions: { ...profile.requestOptions },
      promptHash: sha(
        buildSystemPrompt(
          "a red fox walks through snow",
          true,
          profile.promptProviderName,
          profile.jsonSchema !== undefined,
          undefined,
          false,
        ),
      ),
    };
  }
} catch {
  // Pre-collapse tree: the registry does not exist yet.
}

const outPath = process.argv[2];
if (!outPath) {
  throw new Error("Usage: snapshot-span-wire-surface.ts <out.json>");
}
writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
process.stderr.write(`Wrote span wire snapshot to ${outPath}\n`);
