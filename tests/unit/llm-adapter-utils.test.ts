import { describe, expect, it } from "vitest";

import { attemptJsonRepair } from "@clients/adapters/jsonRepair";

describe("attemptJsonRepair", () => {
  describe("error handling", () => {
    it("adds missing closing braces for truncated objects", () => {
      const { repaired, changes } = attemptJsonRepair('{"a": 1');

      expect(repaired).toBe('{"a": 1}');
      expect(changes).toContain("Added 1 closing braces");
    });
  });

  describe("edge cases", () => {
    it("quotes unquoted keys and converts single quotes", () => {
      const { repaired, changes } = attemptJsonRepair(
        "{'foo':'bar'}{baz:'qux'}",
      );

      expect(repaired).toContain("{\"foo\":'bar'},{\"baz\":'qux'}");
      expect(changes).toContain("Added missing commas between objects");
      expect(changes).toContain("Converted single quotes to double quotes");
      expect(changes).toContain("Added quotes to unquoted keys");
    });
  });

  describe("core behavior", () => {
    it("removes trailing commas and closes arrays", () => {
      const { repaired, changes } = attemptJsonRepair('{"items":[1,2,],}');

      expect(repaired).toBe('{"items":[1,2]}');
      expect(changes).toContain("Removed trailing commas");
    });
  });
});
