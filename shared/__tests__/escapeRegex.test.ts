import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { escapeRegex } from "../utils/escapeRegex";

describe("escapeRegex", () => {
  describe("escaping known regex metacharacters", () => {
    it("escapes mixed-metacharacter strings", () => {
      const input = String.raw`a.*+?^$|()[]{}\z`;
      const pattern = new RegExp(`^${escapeRegex(input)}$`);
      expect(pattern.test(input)).toBe(true);
      expect(pattern.test(`${input}extra`)).toBe(false);
    });
  });

  describe("invariant: escaped output matches the original input literally", () => {
    it("any input s satisfies new RegExp(escapeRegex(s)).test(s) === true", () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 200 }), (input) => {
          const pattern = new RegExp(`^${escapeRegex(input)}$`);
          return pattern.test(input);
        }),
        { numRuns: 200 },
      );
    });

    it("does not match a string that differs from the original by exactly one regex meta", () => {
      // Sanity: escaping prevents accidental matches via metacharacter expansion.
      const pattern = new RegExp(`^${escapeRegex("a.b")}$`);
      expect(pattern.test("a.b")).toBe(true);
      expect(pattern.test("axb")).toBe(false);
      expect(pattern.test("ab")).toBe(false);
    });
  });
});
