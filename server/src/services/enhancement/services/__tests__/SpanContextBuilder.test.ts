import { describe, expect, it, vi } from "vitest";
import { SpanContextBuilder } from "../SpanContextBuilder";
import type { LabeledSpan, NearbySpan } from "../types";
import { SPAN_CONTEXT_LIMITS } from "@config/spanContextLimits";

describe("SpanContextBuilder", () => {
  const builder = new SpanContextBuilder();

  const defaultInput = {
    allLabeledSpans: [
      {
        text: "a woman",
        role: "subject.identity",
        category: "subject.identity",
        confidence: 0.95,
        start: 0,
        end: 7,
      },
      {
        text: "slow tracking shot",
        role: "camera.movement",
        category: "camera.movement",
        confidence: 0.9,
        start: 8,
        end: 26,
      },
      {
        text: "golden hour",
        role: "lighting.quality",
        category: "lighting.quality",
        confidence: 0.85,
        start: 30,
        end: 41,
      },
    ] as LabeledSpan[],
    nearbySpans: [
      {
        text: "slow tracking shot",
        role: "camera.movement",
        category: "camera.movement",
        confidence: 0.9,
        distance: 5,
        position: "before" as const,
        start: 8,
        end: 26,
      },
    ] as NearbySpan[],
    fullPrompt:
      "a woman slow tracking shot, golden hour lighting across a meadow",
    highlightedText: "golden hour",
    highlightedCategory: "lighting.quality",
    phraseRole: "lighting.quality",
  };

  it("excludes the highlighted span from anchors", () => {
    const result = builder.buildSpanContext(defaultInput);

    expect(result.spanAnchors).not.toContain("golden hour");
  });

  it("excludes same parent category from anchors", () => {
    const input = {
      ...defaultInput,
      allLabeledSpans: [
        {
          text: "warm glow",
          role: "lighting.quality",
          category: "lighting.quality",
          confidence: 0.8,
          start: 50,
          end: 59,
        },
        {
          text: "a woman",
          role: "subject.identity",
          category: "subject.identity",
          confidence: 0.95,
          start: 0,
          end: 7,
        },
      ] as LabeledSpan[],
    };

    const result = builder.buildSpanContext(input);

    // "warm glow" has the same parent (lighting) as the highlight — should be excluded
    expect(result.spanAnchors).not.toContain("warm glow");
    // "a woman" is subject — should be included
    expect(result.spanAnchors).toContain("a woman");
  });

  it("produces locked span categories from nearby spans", () => {
    const result = builder.buildSpanContext(defaultInput);

    expect(result.lockedSpanCategories.length).toBeGreaterThan(0);
    // camera.movement's parent category
    expect(
      result.lockedSpanCategories.some((c) => c.toLowerCase() === "camera"),
    ).toBe(true);
  });

  it("returns null fingerprint when no anchors or nearby spans", () => {
    const input = {
      ...defaultInput,
      allLabeledSpans: [] as LabeledSpan[],
      nearbySpans: [] as NearbySpan[],
    };

    const result = builder.buildSpanContext(input);

    expect(result.spanFingerprint).toBeNull();
    expect(result.spanAnchors).toBe("");
    expect(result.nearbySpanHints).toBe("");
  });

  it("changes fingerprint when nearby spans change", () => {
    const a = builder.buildSpanContext(defaultInput);
    const b = builder.buildSpanContext({
      ...defaultInput,
      nearbySpans: [
        {
          text: "different phrase",
          role: "action",
          category: "action",
          confidence: 0.8,
          distance: 10,
          position: "after" as const,
          start: 45,
          end: 60,
        },
      ] as NearbySpan[],
    });

    expect(a.spanFingerprint).not.toBe(b.spanFingerprint);
  });

  it("keeps ordinary anchor ranking, nearby priority and fingerprint stable", () => {
    const result = builder.buildSpanContext(defaultInput);
    expect(result.spanAnchors).toBe('- subject: "a woman"\n- camera: "slow tracking shot"');
    expect(result.nearbySpanHints).toBe('- camera: "slow tracking shot"');
    expect(result.lockedSpanCategories).toEqual(["camera"]);
    // Preserve the existing fingerprint format and its exact input order.
    expect(result.spanFingerprint).toBe("131l7z");
  });

  it("deduplicates repeated anchors before range resolution", () => {
    const isolated = new SpanContextBuilder();
    const resolve = vi.spyOn(isolated, "_resolveSpanRange");
    const span = defaultInput.allLabeledSpans[0]!;
    const single = isolated.buildSpanContext({ ...defaultInput, allLabeledSpans: [span] });
    resolve.mockClear();
    const repeated = isolated.buildSpanContext({
      ...defaultInput,
      allLabeledSpans: Array.from({ length: SPAN_CONTEXT_LIMITS.maxSpans }, () => ({ ...span })),
    });
    expect(repeated).toEqual(single);
    expect(resolve).toHaveBeenCalledTimes(2); // Highlight plus one unique anchor.
  });

  it("rejects excessive duplicates before parsing a clause-heavy prompt", () => {
    const isolated = new SpanContextBuilder();
    const clauses = vi.spyOn(isolated, "_findClauseBoundaries");
    const span = { text: "x", role: "subject", start: 0, end: 1 };
    expect(() => isolated.buildSpanContext({
      ...defaultInput,
      fullPrompt: "x;".repeat(25_000),
      allLabeledSpans: Array.from({ length: 7_500 }, () => ({ ...span })),
    })).toThrow("must not exceed 80 spans per array");
    expect(clauses).not.toHaveBeenCalled();
  });

  it.each(["allLabeledSpans", "nearbySpans"] as const)("rejects oversized %s without silently truncating", (field) => {
    const span = field === "allLabeledSpans" ? defaultInput.allLabeledSpans[0]! : defaultInput.nearbySpans[0]!;
    expect(() => builder.buildSpanContext({
      ...defaultInput,
      [field]: Array.from({ length: 81 }, () => ({ ...span })),
    })).toThrow(RangeError);
  });

  it("uses logarithmic lookup while preserving inclusive edges and clause gaps", () => {
    let comparisons = 0;
    const clauses = Array.from({ length: 25_000 }, (_, index) => ({
      get start(): number { comparisons += 1; return index * 2; },
      end: index * 2,
    }));
    expect(builder._findClauseIndex(clauses, { start: 49_998, end: 49_999 })).toBe(24_999);
    expect(comparisons).toBeLessThan(32);
    expect(builder._findClauseIndex(clauses, { start: 49_997, end: 49_997 })).toBeNull();
    expect(builder._findClauseIndex(clauses, { start: 0, end: 0 })).toBe(0);
    expect(builder._findClauseIndex(clauses, null)).toBeNull();
  });

  it("retains first-occurrence fallback and converts exclusive offsets to inclusive ranges", () => {
    const text = "tree and tree";
    expect(builder._resolveSpanRange(text, "tree")).toEqual({ start: 0, end: 3 });
    expect(builder._resolveSpanRange(text, "tree", 9, 13)).toEqual({ start: 9, end: 12 });
    const clauses = builder._findClauseBoundaries(" a ; b while c and d. ");
    expect(clauses).toEqual([{ start: 1, end: 1 }, { start: 5, end: 5 }, { start: 13, end: 13 }, { start: 19, end: 19 }]);
    expect(builder._findClauseIndex(clauses, { start: 2, end: 2 })).toBeNull();
  });

  it.each([
    { fullPrompt: "x".repeat(50_001) },
    { highlightedText: "x".repeat(10_001) },
    { allLabeledSpans: [{ text: "x".repeat(10_001), role: "subject" }] },
    { allLabeledSpans: [{ text: "tree", role: "subject", start: 5, end: 4 }] },
    { nearbySpans: [{ ...defaultInput.nearbySpans[0]!, end: 50_001 }] },
  ])("bounds direct service callers before span work", (change) => {
    expect(() => builder.buildSpanContext({ ...defaultInput, ...change })).toThrow(RangeError);
  });
});
