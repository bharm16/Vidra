import { describe, it, expect } from "vitest";
import { isSentence } from "../textHelpers";

describe("isSentence", () => {
  describe("edge cases", () => {
    it("returns false for null", () => {
      expect(isSentence(null)).toBe(false);
    });
  });

  describe("word count threshold", () => {
    it("returns true for 12+ words without punctuation", () => {
      const text =
        "one two three four five six seven eight nine ten eleven twelve";
      expect(isSentence(text)).toBe(true);
    });

    it("returns false for 11 words without punctuation", () => {
      const text = "one two three four five six seven eight nine ten eleven";
      expect(isSentence(text)).toBe(false);
    });
  });

  describe("pre-computed word count", () => {
    it("uses provided wordCount instead of computing", () => {
      // Short text but high wordCount passed in → true
      expect(isSentence("short", 12)).toBe(true);
    });
  });
});
