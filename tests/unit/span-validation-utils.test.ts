import { describe, expect, it } from "vitest";

import {
  isValidSpan,
  normalizeSpan,
  sanitizeSpans,
} from "@features/span-highlighting/utils/spanValidation";

describe("spanValidation", () => {
  it("validates span objects with text", () => {
    expect(isValidSpan({ text: "hello" })).toBe(true);
    expect(isValidSpan({ quote: "hi" })).toBe(true);
    expect(isValidSpan({ text: "" })).toBe(false);
  });

  it("sanitizes spans list", () => {
    const result = sanitizeSpans([{ text: "ok" }, { text: "" }]);

    expect(result).toHaveLength(1);
  });

  it("normalizes spans to standard format, with category authoritative", () => {
    const span = normalizeSpan({
      quote: "hello",
      category: "style.aesthetic",
      confidence: 0.8,
      start: 0,
      end: 5,
    });

    expect(span).toEqual({
      text: "hello",
      role: "style.aesthetic",
      category: "style.aesthetic",
      confidence: 0.8,
      start: 0,
      end: 5,
    });
  });

  it("drops spans without a category instead of inventing 'unknown'", () => {
    // Public span category contract: `category` is normalized once,
    // server-side; a span without one is structurally invalid.
    expect(normalizeSpan({ quote: "hello", role: "style" })).toBeNull();
    expect(normalizeSpan({ quote: "hello" })).toBeNull();
  });
});
