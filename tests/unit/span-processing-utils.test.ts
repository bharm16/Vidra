import { describe, expect, it } from "vitest";

import {
  buildSimplifiedSpans,
  findNearbySpans,
} from "@features/span-highlighting/utils/spanProcessing";

describe("spanProcessing", () => {
  it("finds nearby spans around selected metadata", () => {
    const metadata = { start: 5, end: 7 };
    const spans = [
      { start: 0, end: 4, text: "before", category: "style" },
      { start: 5, end: 7, text: "target", category: "style" },
      { start: 8, end: 12, text: "after", category: "style" },
    ];

    const nearby = findNearbySpans(metadata, spans, 5);

    expect(nearby).toHaveLength(2);
    expect(nearby[0]?.position).toBe("before");
    expect(nearby[1]?.position).toBe("after");
  });

  it("builds simplified spans from raw input", () => {
    const result = buildSimplifiedSpans([
      { quote: "hello", category: "style", role: "style" },
      { text: "" },
    ]);

    expect(result).toEqual([
      { text: "hello", role: "style", category: "style" },
    ]);
  });
});
