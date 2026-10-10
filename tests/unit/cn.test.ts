import { describe, it, expect } from "vitest";

import { cn } from "@/utils/cn";

describe("cn", () => {
  describe("error handling", () => {
    it("filters out falsy and boolean true values", () => {
      const result = cn(null, undefined, false, true, "");

      expect(result).toBe("");
    });
  });

  describe("edge cases", () => {
    it("flattens nested arrays and collapses whitespace", () => {
      const result = cn("base", ["alpha", "beta", "  gamma  "], false);

      expect(result).toBe("base alpha beta gamma");
    });
  });
});
