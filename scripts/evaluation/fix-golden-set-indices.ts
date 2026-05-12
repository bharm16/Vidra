#!/usr/bin/env tsx

/**
 * Fix Golden Set Indices
 *
 * Ensures every ground-truth span has correct {start,end} indices that
 * exactly match span.text inside prompt.text.
 *
 * This is useful because indices are easy to drift when prompt text changes.
 *
 * Usage:
 *   npm run golden:fix
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GOLDEN_SET_DIR = join(
  __dirname,
  "../../server/src/llm/span-labeling/evaluation/golden-set",
);

function findAllOccurrences(haystack: string, needle: string): number[] {
  if (!needle) return [];
  const starts: number[] = [];
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    starts.push(idx);
    idx = haystack.indexOf(needle, idx + Math.max(1, needle.length));
  }
  return starts;
}

function computeSpanIndices(
  promptId: string,
  promptText: string,
  spanText: string,
  occurrence?: number,
): { start: number; end: number } {
  const matches = findAllOccurrences(promptText, spanText);
  if (matches.length === 0) {
    throw new Error(`Span text not found: ${promptId} "${spanText}"`);
  }

  const pick = occurrence ?? 0;
  if (matches.length > 1 && occurrence === undefined) {
    throw new Error(
      `Span text is ambiguous (set "occurrence"): ${promptId} "${spanText}" (matches=${matches.length})`,
    );
  }
  if (pick < 0 || pick >= matches.length) {
    throw new Error(
      `Span occurrence out of range: ${promptId} "${spanText}" occurrence=${pick} (matches=${matches.length})`,
    );
  }

  const start = matches[pick]!;
  return { start, end: start + spanText.length };
}

function fixFile(filePath: string) {
  const raw = JSON.parse(readFileSync(filePath, "utf-8"));
  if (!raw || !Array.isArray(raw.prompts)) return;

  for (const prompt of raw.prompts) {
    const promptId = typeof prompt?.id === "string" ? prompt.id : "<unknown>";
    const text = typeof prompt?.text === "string" ? prompt.text : "";
    const spans = Array.isArray(prompt?.groundTruth?.spans)
      ? prompt.groundTruth.spans
      : [];

    for (const span of spans) {
      const spanText = typeof span?.text === "string" ? span.text : "";
      if (!spanText) {
        throw new Error(`Span missing text: ${promptId}`);
      }

      const { start, end } = computeSpanIndices(
        promptId,
        text,
        spanText,
        span?.occurrence,
      );
      span.start = start;
      span.end = end;
    }
  }

  writeFileSync(filePath, JSON.stringify(raw, null, 2) + "\n");
}

async function main() {
  const files = readdirSync(GOLDEN_SET_DIR).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    fixFile(join(GOLDEN_SET_DIR, f));
  }
  console.log(`✅ Golden set indices fixed for ${files.length} file(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
