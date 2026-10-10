import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hashString } from "../hash";

describe("hashString", () => {
  describe("invariants", () => {
    it("always returns non-negative integer for any string input", () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const hash = hashString(input);

          expect(typeof hash).toBe("number");
          expect(Number.isInteger(hash)).toBe(true);
          expect(hash).toBeGreaterThanOrEqual(0);
        }),
      );
    });

    it("is deterministic - same input always produces same output", () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const hash1 = hashString(input);
          const hash2 = hashString(input);

          expect(hash1).toBe(hash2);
        }),
      );
    });
  });
});
