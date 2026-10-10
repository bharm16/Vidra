import { describe, it, expect } from "vitest";
import { parseJson } from "../jsonUtils";

describe("jsonUtils", () => {
  describe("error handling", () => {
    it("returns an error result for invalid JSON", () => {
      const result = parseJson("{not valid json");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Invalid JSON");
      }
    });
  });

  describe("edge cases", () => {
    it("recovers JSON embedded in surrounding text", () => {
      const raw =
        'Noise before {"spans": [{"text": "cat", "role": "subject"}]} trailing';
      const result = parseJson(raw);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const value = result.value as { spans?: Array<{ text: string }> };
        expect(value.spans?.[0]?.text).toBe("cat");
      }
    });
  });
});
