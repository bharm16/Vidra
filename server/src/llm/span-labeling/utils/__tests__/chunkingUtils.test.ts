import { describe, it, expect } from "vitest";
import { TextChunker } from "../chunkingUtils";

describe("TextChunker", () => {
  describe("error handling", () => {
    it("returns empty chunks for non-string input", () => {
      const chunker = new TextChunker();
      expect(chunker.chunkText(null)).toEqual([]);
      expect(chunker.needsChunking(undefined)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("splits headings and bullets as separate sentences with offsets", () => {
      const text = "# Heading\n- Bullet item\nRegular sentence.";
      const chunker = new TextChunker();
      const sentences = chunker.splitIntoSentences(text);

      expect(sentences[0]?.text).toBe("# Heading");
      expect(sentences[0]?.startOffset).toBe(0);
      expect(sentences[1]?.text).toBe("- Bullet item");
      expect(sentences[1]?.startOffset).toBe(text.indexOf("- Bullet item"));
    });
  });
});
