import { describe, expect, it } from "vitest";

import {
  buildLockedSpan,
  findLockedSpanIndex,
  isSpanLocked,
} from "@features/prompt-optimizer/utils/lockedSpans";
import type { HighlightSpan } from "@features/span-highlighting/hooks/useHighlightRendering";
import type { LockedSpan } from "@features/prompt-optimizer/types";

describe("lockedSpans utils", () => {
  it("builds locked span from highlight span data", () => {
    const span: HighlightSpan = {
      id: "span-2",
      start: 1,
      end: 5,
      quote: "Test",
      leftCtx: "Left",
      rightCtx: "Right",
      category: "style.aesthetic",
      source: "llm",
      confidence: 0.85,
    } as HighlightSpan;

    expect(buildLockedSpan(span)).toEqual({
      id: "span-2",
      text: "Test",
      leftCtx: "Left",
      rightCtx: "Right",
      category: "style.aesthetic",
      source: "llm",
      confidence: 0.85,
    });
  });

  it("returns null when span text is empty", () => {
    const span: HighlightSpan = {
      id: "span-3",
      start: 0,
      end: 4,
      quote: "   ",
    } as HighlightSpan;

    expect(buildLockedSpan(span)).toBeNull();
  });

  it("finds locked span by id first", () => {
    const lockedSpans: LockedSpan[] = [
      { id: "span-1", text: "alpha", leftCtx: "", rightCtx: "" },
      { id: "span-2", text: "beta", leftCtx: "", rightCtx: "" },
    ];
    const span: HighlightSpan = {
      id: "span-2",
      start: 1,
      end: 5,
      quote: "beta",
    } as HighlightSpan;

    expect(findLockedSpanIndex(lockedSpans, span)).toBe(1);
  });

  it("finds locked span by text when id differs", () => {
    const lockedSpans: LockedSpan[] = [
      { id: "span-1", text: "alpha", leftCtx: "", rightCtx: "" },
      { id: "span-2", text: "beta", leftCtx: "", rightCtx: "" },
    ];
    const span: HighlightSpan = {
      id: "span-3",
      start: 1,
      end: 5,
      quote: " beta ",
    } as HighlightSpan;

    expect(findLockedSpanIndex(lockedSpans, span)).toBe(1);
    expect(isSpanLocked(lockedSpans, span)).toBe(true);
  });

  it("returns -1 when span is not locked", () => {
    const lockedSpans: LockedSpan[] = [
      { id: "span-1", text: "alpha", leftCtx: "", rightCtx: "" },
    ];

    expect(findLockedSpanIndex(lockedSpans, null)).toBe(-1);
    expect(isSpanLocked(lockedSpans, null)).toBe(false);
  });
});
