import { describe, expect, it, vi, type MockedFunction } from "vitest";

import { readSpanLabelStream } from "@features/span-highlighting/api/spanLabelingStream";
import type { SpanLabel } from "@features/span-highlighting/api/spanLabelingTypes";

describe("readSpanLabelStream", () => {
  const createReader = (chunks: string[]) => {
    const encoder = new TextEncoder();
    let index = 0;
    return {
      read: async () => {
        if (index >= chunks.length) {
          return { done: true, value: undefined };
        }
        const value = encoder.encode(chunks[index]);
        index += 1;
        return { done: false, value };
      },
      releaseLock: vi.fn(),
      cancel: vi.fn(async () => undefined),
    } as unknown as ReadableStreamDefaultReader<Uint8Array>;
  };

  it("parses spans and counts parse errors", async () => {
    const lines = [
      JSON.stringify({ start: 0, end: 4, category: "style", confidence: 0.8 }) +
        "\n",
      "{ bad json }\n",
      JSON.stringify({ start: 5, end: 7, category: "style", confidence: 0.6 }) +
        "\n",
    ];

    const reader = createReader(lines);
    const onChunk: MockedFunction<(span: SpanLabel) => void> = vi.fn();
    const log = { debug: vi.fn(), warn: vi.fn() };

    const result = await readSpanLabelStream(reader, onChunk, log, {
      progressLogIntervalMs: 0,
    });

    expect(onChunk).toHaveBeenCalledTimes(2);
    expect(result.spans).toHaveLength(2);
    expect(result.linesProcessed).toBe(3);
    expect(result.parseErrors).toBe(1);
    expect(log.warn).toHaveBeenCalled();
  });
});
