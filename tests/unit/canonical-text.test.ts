import { describe, it, expect } from "vitest";

import { CanonicalText } from "@/utils/canonicalText";

describe("CanonicalText", () => {
  describe("error handling", () => {
    it("clamps negative grapheme indices to zero", () => {
      const text = new CanonicalText("abc", { segmenter: null });

      expect(text.codeUnitOffsetForGrapheme(-2)).toBe(0);
      expect(text.graphemeIndexForCodeUnit(-5)).toBe(0);
    });

    it("returns the end position for out-of-range offsets", () => {
      const text = new CanonicalText("abc", { segmenter: null });

      expect(text.codeUnitOffsetForGrapheme(99)).toBe(3);
      expect(text.graphemeIndexForCodeUnit(99)).toBe(text.length);
    });
  });

  describe("edge cases", () => {
    it("normalizes combining characters to NFC", () => {
      const composed = "\u00e9";
      const combining = "e\u0301";
      const text = new CanonicalText(combining, { segmenter: null });

      expect(text.toJSON().normalized).toBe(composed);
      expect(text.length).toBe(1);
    });
  });

  describe("core behavior", () => {
    it("respects custom segmentation when provided", () => {
      const segmenter = {
        segment: (input: string) => [
          { segment: input.slice(0, 2), index: 0 },
          { segment: input.slice(2), index: 2 },
        ],
      } as unknown as Intl.Segmenter;

      const text = new CanonicalText("abcd", { segmenter });

      expect(text.length).toBe(2);
      expect(text.codeUnitOffsetForGrapheme(1)).toBe(2);
      expect(text.sliceGraphemes(1, 2)).toBe("cd");
    });
  });
});
