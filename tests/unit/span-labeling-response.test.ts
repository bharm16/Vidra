import { describe, expect, it } from "vitest";

import {
  parseLabelSpansResponse,
  parseSpanLabel,
} from "@features/span-highlighting/api/spanLabelingResponse";

describe("spanLabelingResponse", () => {
  it("parses valid span label", () => {
    const span = parseSpanLabel({
      start: 1,
      end: 4,
      category: "style",
      confidence: 0.9,
      text: "test",
    });

    expect(span).toEqual({
      start: 1,
      end: 4,
      category: "style",
      confidence: 0.9,
      text: "test",
    });
  });

  it("returns null for invalid span label", () => {
    expect(parseSpanLabel({ start: 1, end: 4 })).toBeNull();
  });

  it("parses label spans response", () => {
    const response = parseLabelSpansResponse({
      success: true,
      data: {
        spans: [
          { start: 1, end: 4, category: "style", confidence: 0.5 },
          { start: 0 },
        ],
        meta: { source: "test" },
      },
    });

    expect(response.spans).toHaveLength(1);
    expect(response.meta).toEqual({ source: "test" });
  });

  it("throws on a success:false envelope", () => {
    expect(() =>
      parseLabelSpansResponse({ success: false, error: "labeling failed" }),
    ).toThrow("labeling failed");
  });
});
