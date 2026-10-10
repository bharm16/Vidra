import { describe, expect, it } from "vitest";
import { attemptJsonRepair } from "../jsonRepair";

describe("attemptJsonRepair", () => {
  describe("error handling", () => {
    it("removes trailing commas so JSON can parse", () => {
      const input = '{"a": 1, "b": 2,}';

      const { repaired, changes } = attemptJsonRepair(input);

      expect(changes).toContain("Removed trailing commas");
      expect(() => JSON.parse(repaired)).not.toThrow();
      const parsed = JSON.parse(repaired) as { a: number; b: number };
      expect(parsed.b).toBe(2);
    });

    it("adds missing commas between adjacent objects", () => {
      const input = '[{"a": 1} {"b": 2}]';

      const { repaired, changes } = attemptJsonRepair(input);

      expect(changes).toContain("Added missing commas between objects");
      const parsed = JSON.parse(repaired) as Array<{ a?: number; b?: number }>;
      expect(parsed).toHaveLength(2);
      expect(parsed[1]).toBeDefined();
      expect(parsed[1]?.b).toBe(2);
    });
  });

  describe("edge cases", () => {
    it("adds missing closing braces for simple truncated objects", () => {
      const input = '{"ok":true';

      const { repaired, changes } = attemptJsonRepair(input);

      expect(changes).toContain("Added 1 closing braces");
      expect(JSON.parse(repaired)).toEqual({ ok: true });
    });

    it("adds missing closing brackets for simple truncated arrays", () => {
      const input = "[1,2,3";

      const { repaired, changes } = attemptJsonRepair(input);

      expect(changes).toContain("Added 1 closing brackets");
      expect(JSON.parse(repaired)).toEqual([1, 2, 3]);
    });

    it("keeps mixed quoted strings while quoting unquoted keys", () => {
      const input = '{"name":"test", count: 3}';

      const { repaired, changes } = attemptJsonRepair(input);
      const parsed = JSON.parse(repaired) as { name: string; count: number };

      expect(changes).toContain("Added quotes to unquoted keys");
      expect(parsed).toEqual({ name: "test", count: 3 });
    });
  });

  describe("core behavior", () => {
    it("quotes keys and converts single-quoted keys", () => {
      const input = "{'a': 1, b: 2}";

      const { repaired, changes } = attemptJsonRepair(input);

      expect(changes).toContain("Converted single quotes to double quotes");
      expect(changes).toContain("Added quotes to unquoted keys");
      const parsed = JSON.parse(repaired) as { a: number; b: number };
      expect(parsed).toEqual({ a: 1, b: 2 });
    });
  });
});
