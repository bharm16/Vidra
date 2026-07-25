import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { ThinkingDeltaScanner } from "../thinkingDeltaScanner";

/**
 * The scanner extracts the `thinking` string's characters from a streamed
 * JSON decision, chunk by chunk, emitting them as soon as they arrive —
 * before the JSON is complete. It must survive chunks split at ANY byte
 * boundary, including mid-key, mid-escape, and mid-\uXXXX.
 */

function runChunks(chunks: string[]): string {
  const scanner = new ThinkingDeltaScanner();
  let out = "";
  for (const chunk of chunks) out += scanner.push(chunk);
  return out;
}

/** Split a string into random contiguous chunks covering the whole input. */
function chunkArbitrary(text: string) {
  return fc
    .array(fc.integer({ min: 1, max: 8 }), { minLength: 1, maxLength: 200 })
    .map((sizes) => {
      const chunks: string[] = [];
      let index = 0;
      for (const size of sizes) {
        if (index >= text.length) break;
        chunks.push(text.slice(index, index + size));
        index += size;
      }
      if (index < text.length) chunks.push(text.slice(index));
      return chunks;
    });
}

describe("ThinkingDeltaScanner", () => {
  it("recovers the exact thinking text under any chunking (property)", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 120 }).chain((thinking) => {
          const json = JSON.stringify({
            action: "generate",
            thinking,
            basePrompt: 'a "thinking" fox — quotes included',
            variants: ["a", "b", "c", "d"],
            suggestions: ["s1", "s2", "s3"],
          });
          return chunkArbitrary(json).map((chunks) => ({ thinking, chunks }));
        }),
        ({ thinking, chunks }) => {
          expect(runChunks(chunks)).toBe(thinking);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("emits characters incrementally, before the JSON completes", () => {
    const scanner = new ThinkingDeltaScanner();
    expect(scanner.push('{"action":"generate","thinking":"The u')).toBe(
      "The u",
    );
    expect(scanner.push("ser wants")).toBe("ser wants");
    expect(scanner.push(' a fox","basePrompt":"...')).toBe(" a fox");
  });

  it("handles escapes split across chunks", () => {
    // The chunk boundary lands between the backslash and the "n": the
    // newline materializes with the second chunk.
    const scanner = new ThinkingDeltaScanner();
    scanner.push('{"thinking":"line one\\');
    expect(scanner.push('nline two \\"quoted\\"')).toBe('\nline two "quoted"');
    const full = runChunks(['{"thinking":"line one\\', 'n end"}']);
    expect(full).toBe("line one\n end");
  });

  it("handles \\uXXXX split across chunks", () => {
    expect(runChunks(['{"thinking":"fox \\u26', '01 icon"}'])).toBe(
      "fox ☁ icon",
    );
  });

  it("ignores the word thinking inside other string values", () => {
    const json =
      '{"action":"generate","basePrompt":"a poster about \\"thinking\\" big","thinking":"real plan"}';
    expect(runChunks([json])).toBe("real plan");
  });

  it("emits nothing when the decision has no thinking field", () => {
    const json = JSON.stringify({
      action: "clarify",
      questions: [{ text: "What for?", quickPicks: ["A", "B"] }],
    });
    expect(runChunks([json])).toBe("");
  });
});
