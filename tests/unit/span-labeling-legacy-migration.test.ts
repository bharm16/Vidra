import { describe, expect, it } from "vitest";
import {
  sanitizePolicy,
  sanitizeOptions,
} from "@llm/span-labeling/utils/policyUtils.js";
import {
  clamp01,
  wordCount,
  matchesAtIndices,
  buildSpanKey,
  formatValidationErrors,
} from "@llm/span-labeling/utils/textUtils.js";
import {
  DEFAULT_CONFIDENCE,
  DEFAULT_OPTIONS,
  DEFAULT_POLICY,
  PERFORMANCE,
} from "@llm/span-labeling/config/SpanLabelingConfig.js";

describe("policyUtils", () => {
  it("sanitizes policies and options with defaults and constraints", () => {
    const policy = sanitizePolicy({
      nonTechnicalWordLimit: -1,
      allowOverlap: true,
    });
    const options = sanitizeOptions({
      maxSpans: PERFORMANCE.MAX_SPANS_ABSOLUTE_LIMIT + 10,
      minConfidence: 2,
      templateVersion: "",
    });

    expect(policy.nonTechnicalWordLimit).toBe(
      DEFAULT_POLICY.nonTechnicalWordLimit,
    );
    expect(policy.allowOverlap).toBe(true);
    expect(options.maxSpans).toBe(PERFORMANCE.MAX_SPANS_ABSOLUTE_LIMIT);
    expect(options.minConfidence).toBe(DEFAULT_OPTIONS.minConfidence);
    expect(options.templateVersion).toBe(DEFAULT_OPTIONS.templateVersion);
  });
});

describe("textUtils", () => {
  it("clamps values and counts words", () => {
    expect(clamp01(2)).toBe(1);
    expect(clamp01(-1)).toBe(0);
    expect(clamp01("x")).toBe(DEFAULT_CONFIDENCE);
    expect(wordCount("one two three")).toBe(3);
  });

  it("matches spans and formats errors", () => {
    const text = "hello";
    const span = { start: 1, end: 3, text: "el" };

    expect(matchesAtIndices(text, span)).toBe(true);
    expect(buildSpanKey({ start: 1, end: 3, text: "el" })).toBe("1|3|el");
    expect(formatValidationErrors(["a", "b"])).toBe("1. a\n2. b");
  });
});
