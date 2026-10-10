import { describe, expect, it } from "vitest";

import {
  cleanJsonEnvelope,
  parseJson,
  buildUserPayload,
} from "@llm/span-labeling/utils/jsonUtils";
import {
  TextChunker,
  countWords,
} from "@llm/span-labeling/utils/chunkingUtils";

import type { SpanLike } from "@llm/span-labeling/types";

describe("jsonUtils", () => {
  it("strips markdown code fences", () => {
    const raw = '```json\n{"ok":true}\n```';
    expect(cleanJsonEnvelope(raw)).toBe('{"ok":true}');
  });

  it("parses JSON wrapped in fences and fixes newlines in strings", () => {
    const raw = '```json\n{"text":"line1\nline2"}\n```';
    const result = parseJson(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.value as { text: string }).text).toBe("line1\nline2");
    }
  });

  it("builds user payload with XML-wrapped text and validation metadata", () => {
    const payload = buildUserPayload({
      task: "label",
      policy: { allowOverlap: false },
      text: "hello",
      templateVersion: "v1",
      validation: { errors: ["bad"] },
    });

    const parsed = JSON.parse(payload) as {
      text: string;
      validation?: Record<string, unknown>;
    };
    expect(parsed.text).toBe("<user_input>\nhello\n</user_input>");
    expect(parsed.validation?.errors).toEqual(["bad"]);
  });
});

describe("chunkingUtils", () => {
  it("counts words for valid text", () => {
    expect(countWords("one two three")).toBe(3);
    expect(countWords(null)).toBe(0);
  });

  it("splits text into sentence-aware chunks with overlap", () => {
    const chunker = new TextChunker(4, 2);
    const text = "One two. Three four. Five six.";
    const chunks = chunker.chunkText(text);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.text).toContain("One two.");
    expect(chunks[1]?.text).toContain("Three four.");
    expect(chunks[1]?.startOffset).toBeLessThan(chunks[1]?.endOffset ?? 0);
  });

  it("merges chunked spans with adjusted offsets and removes duplicates", () => {
    const chunker = new TextChunker();
    const chunkResults = [
      {
        chunkOffset: 0,
        spans: [
          { text: "cat", start: 0, end: 3, role: "subject.identity" },
        ] as SpanLike[],
      },
      {
        chunkOffset: 5,
        spans: [
          { text: "dog", start: 0, end: 3, role: "subject.identity" },
          { text: "cat", start: -5, end: -2, role: "subject.identity" },
        ] as SpanLike[],
      },
    ];

    const merged = chunker.mergeChunkedSpans(chunkResults);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.start).toBe(0);
    expect(merged[1]?.start).toBe(5);
  });

  it("identifies when chunking is needed", () => {
    const chunker = new TextChunker(2, 0);
    expect(chunker.needsChunking("one two three")).toBe(true);
    expect(chunker.needsChunking("one")).toBe(false);
  });
});
