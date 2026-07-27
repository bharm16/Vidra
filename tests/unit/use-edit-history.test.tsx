import { describe, expect, it, beforeEach } from "vitest";

import {
  clearSpanEditHistory,
  getRecentSpanEdits,
  recordSpanEdit,
} from "@features/prompt-optimizer/hooks/useEditHistory";

describe("span edit history", () => {
  beforeEach(() => {
    clearSpanEditHistory();
  });

  it("reads back a recorded edit", () => {
    recordSpanEdit({
      original: "wide shot",
      replacement: "slow push-in",
      category: "camera",
    });

    expect(getRecentSpanEdits()).toEqual([
      expect.objectContaining({
        original: "wide shot",
        replacement: "slow push-in",
        category: "camera",
        timestamp: expect.any(Number),
      }),
    ]);
  });

  it("defaults the category to null when none is supplied", () => {
    recordSpanEdit({ original: "at dusk", replacement: "at golden hour" });

    expect(getRecentSpanEdits()[0]?.category).toBeNull();
  });

  it("ignores no-op edits", () => {
    recordSpanEdit({ original: "same", replacement: "same" });
    recordSpanEdit({ original: " same ", replacement: "same" });
    recordSpanEdit({ original: "", replacement: "slow push-in" });
    recordSpanEdit({ original: "wide shot", replacement: "" });

    expect(getRecentSpanEdits()).toEqual([]);
  });

  it("returns the newest edits, oldest first, bounded by count", () => {
    for (let i = 1; i <= 3; i += 1) {
      recordSpanEdit({
        original: `original-${i}`,
        replacement: `replacement-${i}`,
      });
    }

    expect(getRecentSpanEdits(2).map((edit) => edit.original)).toEqual([
      "original-2",
      "original-3",
    ]);
    expect(getRecentSpanEdits().map((edit) => edit.original)).toEqual([
      "original-1",
      "original-2",
      "original-3",
    ]);
  });

  it("drops the oldest edits once the session cap is reached", () => {
    for (let i = 1; i <= 51; i += 1) {
      recordSpanEdit({
        original: `original-${i}`,
        replacement: `replacement-${i}`,
      });
    }

    const recorded = getRecentSpanEdits(100);
    expect(recorded).toHaveLength(50);
    expect(recorded[0]?.original).toBe("original-2");
  });
});
