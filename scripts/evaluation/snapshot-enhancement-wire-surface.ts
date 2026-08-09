#!/usr/bin/env node
/**
 * Golden oracle for the enhancement wire surface.
 *
 * Companion to `snapshot-span-wire-surface.ts`. Enhancement suggestions are
 * a recorded surface too (`server/src/replay/fixtures/suggestions/`), and the
 * cassette key hashes the semantic request — so any drift in which JSON
 * schema a provider is sent invalidates the pack.
 *
 * Snapshot before a refactor, snapshot after, diff. An empty diff means the
 * cassettes are still valid and no re-record is needed.
 *
 * Usage:
 *   npx tsx --tsconfig server/tsconfig.json \
 *     scripts/evaluation/snapshot-enhancement-wire-surface.ts <out.json>
 */

import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolveEnhancementProfile } from "../../server/src/services/enhancement/providers/enhancementProfiles.ts";
import { getVideoOptimizationSchema } from "../../server/src/utils/provider/SchemaFactory.ts";

const sha = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);

/**
 * Every provider string the schema factories can be handed. Includes the ones
 * `EnhancementV2Engine`'s allowlist currently discards, so the snapshot
 * records what they resolve to today.
 */
const PROVIDERS = [
  "openai",
  "groq",
  "qwen",
  "gemini",
  "anthropic",
  "unknown",
] as const;

interface Entry {
  hash: string;
  name?: string;
  strict?: boolean;
  required?: string[];
}

const describe = (schema: {
  name?: string;
  strict?: boolean;
  required?: string[];
}): Entry => {
  const entry: Entry = { hash: sha(JSON.stringify(schema)) };
  if (typeof schema.name === "string") entry.name = schema.name;
  if (typeof schema.strict === "boolean") entry.strict = schema.strict;
  if (Array.isArray(schema.required)) entry.required = schema.required;
  return entry;
};

const enhancement: Record<string, Entry> = {};
const enhancementPlaceholder: Record<string, Entry> = {};
const customSuggestion: Record<string, Entry> = {};
const videoOptimization: Record<string, Entry> = {};

for (const provider of PROVIDERS) {
  const profile = resolveEnhancementProfile(provider);

  enhancement[provider] = describe(profile.enhancementSchema(false));
  enhancementPlaceholder[provider] = describe(profile.enhancementSchema(true));
  customSuggestion[provider] = describe(profile.customSuggestionSchema());
  videoOptimization[provider] = describe(
    getVideoOptimizationSchema({ provider: provider as never }),
  );
}

const snapshot = {
  enhancement,
  enhancementPlaceholder,
  customSuggestion,
  videoOptimization,
};

const outPath = process.argv[2];
if (!outPath) {
  throw new Error("Usage: snapshot-enhancement-wire-surface.ts <out.json>");
}
writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
process.stderr.write(`Wrote enhancement wire snapshot to ${outPath}\n`);
