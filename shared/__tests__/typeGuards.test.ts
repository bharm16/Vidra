import { describe, it, expect } from "vitest";
import { isRecord } from "../utils/typeGuards";

describe("isRecord", () => {
  describe("matches", () => {
    it("returns true for plain objects", () => {
      expect(isRecord({})).toBe(true);
      expect(isRecord({ a: 1 })).toBe(true);
      expect(isRecord(Object.create(null))).toBe(true);
    });
  });

  describe("non-matches", () => {
    it("returns false for arrays", () => {
      // This is the explicit array-rejection contract — locks it in for future readers.
      expect(isRecord([])).toBe(false);
      expect(isRecord([1, 2, 3])).toBe(false);
      expect(isRecord(new Array(3))).toBe(false);
    });

    it("returns false for null", () => {
      expect(isRecord(null)).toBe(false);
    });

    it("returns false for primitives", () => {
      expect(isRecord(undefined)).toBe(false);
      expect(isRecord("string")).toBe(false);
      expect(isRecord("")).toBe(false);
      expect(isRecord(42)).toBe(false);
      expect(isRecord(0)).toBe(false);
      expect(isRecord(true)).toBe(false);
      expect(isRecord(false)).toBe(false);
      expect(isRecord(Symbol("x"))).toBe(false);
    });
  });
});
