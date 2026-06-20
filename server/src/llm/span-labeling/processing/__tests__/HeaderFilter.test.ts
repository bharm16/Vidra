import { describe, it, expect } from "vitest";
import { getAllParentCategories } from "#shared/taxonomy.ts";
import { filterHeaders, isLikelyHeader } from "../HeaderFilter";

const buildSpan = (
  text: string,
  start: number,
  end: number,
  role?: string,
) => ({
  text,
  start,
  end,
  ...(role === undefined ? {} : { role }),
});

describe("HeaderFilter", () => {
  describe("error handling", () => {
    it("treats empty or tiny text as header-like", () => {
      expect(isLikelyHeader("")).toBe(true);
      expect(isLikelyHeader("A")).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("detects common header patterns", () => {
      expect(isLikelyHeader("## Technical Specs")).toBe(true);
      expect(isLikelyHeader("**Camera**")).toBe(true);
      expect(isLikelyHeader("CAMERA")).toBe(true);
      expect(isLikelyHeader("Duration:")).toBe(true);
      expect(isLikelyHeader("camera")).toBe(true);
    });
  });

  describe("core behavior", () => {
    it("filters header spans and keeps content spans", () => {
      const spans = [
        buildSpan("Camera", 0, 6, "camera"),
        buildSpan("slow pan across dunes", 7, 30, "camera.movement"),
      ];

      const result = filterHeaders(spans);

      expect(result.spans).toHaveLength(1);
      expect(result.spans[0]?.text).toBe("slow pan across dunes");
      expect(result.notes[0]).toContain("Dropped header/label");
    });
  });

  describe("taxonomy-sourced category headers", () => {
    it("treats every taxonomy parent-category word as a header", () => {
      // The category words are derived from the canonical TAXONOMY rather than
      // hardcoded, so adding a category cannot let this filter drift.
      for (const category of getAllParentCategories()) {
        expect(isLikelyHeader(category)).toBe(true);
      }
    });

    it("keeps taxonomy attribute words that are real content (no over-filter)", () => {
      // Attribute words (children, not parent categories) are legitimate
      // content — "a remote location", "fluid movement". Deriving the filter
      // set from attribute keys would wrongly drop them; deriving from parent
      // categories only must not.
      expect(isLikelyHeader("location")).toBe(false);
      expect(isLikelyHeader("movement")).toBe(false);
      expect(isLikelyHeader("appearance")).toBe(false);
    });
  });
});
