import { describe, expect, it } from "vitest";
import { SpanContextBuilder } from "../SpanContextBuilder";
import type { LabeledSpan, NearbySpan } from "../types";

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
});
