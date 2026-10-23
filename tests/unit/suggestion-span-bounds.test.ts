import { describe, expect, it } from "vitest";
import { suggestionSchema } from "@config/schemas";
import { SPAN_CONTEXT_LIMITS } from "@config/spanContextLimits";
import { PERFORMANCE } from "@llm/span-labeling/config/SpanLabelingConfig";

const span = { text: "tree", role: "subject", start: 0, end: 4 };
const nearby = { ...span, distance: 1, position: "before" as const };
const request = { fullPrompt: "tree and sunset", highlightedText: "sunset" };

describe("suggestion span bounds", () => {
  it("accepts the full supported labeler cardinality and optional nearby coordinates", () => {
    expect(SPAN_CONTEXT_LIMITS.maxSpans).toBe(PERFORMANCE.MAX_SPANS_ABSOLUTE_LIMIT);
    expect(suggestionSchema.safeParse({
      ...request,
      allLabeledSpans: Array.from({ length: 80 }, () => ({ ...span })),
      nearbySpans: [{ text: "tree", role: "subject", distance: 1, position: "before" }],
    }).success).toBe(true);
  });

  it.each(["allLabeledSpans", "nearbySpans"] as const)("rejects excessive %s", (field) => {
    const value = field === "allLabeledSpans" ? span : nearby;
    expect(suggestionSchema.safeParse({
      ...request,
      [field]: Array.from({ length: 81 }, () => ({ ...value })),
    }).success).toBe(false);
  });

  it("rejects the duplicate-span and clause-heavy exhaustion shape", () => {
    const result = suggestionSchema.safeParse({
      fullPrompt: "x;".repeat(25_000),
      highlightedText: "x",
      allLabeledSpans: Array.from({ length: 7_500 }, () => ({ text: "x", role: "subject", start: 0, end: 1 })),
    });
    expect(result.success).toBe(false);
  });

  it.each([
    { start: 4, end: 4 },
    { start: 5, end: 4 },
    { start: -1, end: 4 },
    { start: 0, end: 16 },
    { start: 0.5, end: 4 },
    { start: 0, end: undefined },
  ])("rejects malformed offsets: %j", (range) => {
    expect(suggestionSchema.safeParse({ ...request, allLabeledSpans: [{ ...span, ...range }] }).success).toBe(false);
    expect(suggestionSchema.safeParse({ ...request, nearbySpans: [{ ...nearby, ...range }] }).success).toBe(false);
  });

  it.each([
    { text: " " },
    { text: "x".repeat(10_001) },
    { role: "x".repeat(201) },
    { category: "x".repeat(201) },
  ])("rejects oversized or blank span metadata", (change) => {
    expect(suggestionSchema.safeParse({ ...request, allLabeledSpans: [{ ...span, ...change }] }).success).toBe(false);
  });
});
