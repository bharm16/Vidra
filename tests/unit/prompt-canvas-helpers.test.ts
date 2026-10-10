import { describe, it, expect } from "vitest";

import { resolveVersionTimestamp } from "@features/prompt-optimizer/PromptCanvas/utils/versioning";

describe("PromptCanvas helpers", () => {
  describe("resolveVersionTimestamp", () => {
    describe("error handling", () => {
      it("returns null for invalid string input", () => {
        expect(resolveVersionTimestamp("not-a-date")).toBeNull();
      });
    });

    describe("edge cases", () => {
      it("parses numeric string values", () => {
        const timestamp = resolveVersionTimestamp("1700000000000");

        expect(timestamp).toBe(1700000000000);
      });
    });
  });
});
