import { describe, it, expect } from "vitest";
import { wordCount } from "../textUtils";

describe("wordCount", () => {
  describe("edge cases", () => {
    it("counts hyphenated words as single word", () => {
      expect(wordCount("state-of-the-art")).toBe(1);
    });

    it("counts contractions as single word", () => {
      expect(wordCount("don't")).toBe(1);
    });

    it("handles tabs and newlines as whitespace", () => {
      expect(wordCount("hello\tworld\nnew")).toBe(3);
    });

    it("handles Unicode letters", () => {
      expect(wordCount("café résumé naïve")).toBe(3);
    });

    it("handles punctuation between words", () => {
      expect(wordCount("hello, world!")).toBe(2);
    });
  });
});
