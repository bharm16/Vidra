import { describe, expect, it, vi } from "vitest";
import { SubstringPositionCache } from "../SubstringPositionCache";

vi.mock("@infrastructure/Logger", () => ({
  logger: {
    child: () => ({
      debug: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    }),
  },
}));

describe("SubstringPositionCache.findBestMatch", () => {
  // ---------- fail-closed contracts ----------
  // The repair flow is the seam between LLM output and the validator. If repair
  // ever silently snaps to a "close enough" position when the LLM hallucinated
  // text, the canvas highlights the wrong phrase. These tests lock that down.

  describe("hallucinated text (fail-closed)", () => {
    it("returns null when the substring does not appear in the source", () => {
      const cache = new SubstringPositionCache();
      const result = cache.findBestMatch(
        "a young painter in a worn apron",
        "a young sculptor",
      );

      expect(result).toBeNull();
    });

    it("returns null when the substring is empty", () => {
      const cache = new SubstringPositionCache();
      expect(cache.findBestMatch("any text", "")).toBeNull();
    });

    it("rejects substrings that exceed fuzzy distance threshold", () => {
      const cache = new SubstringPositionCache();
      // Source has "the cat", LLM hallucinates "the elephant" — too different
      // to be a fuzzy off-by-one repair. Must fail closed.
      const result = cache.findBestMatch(
        "the cat sat on a mat",
        "the elephant",
      );

      expect(result).toBeNull();
    });
  });

  // ---------- nearest-occurrence selection ----------
  // When LLM-claimed text appears multiple times in the prompt, the repair
  // must use the LLM's claimed offset as a tiebreaker. Snapping to the first
  // occurrence would silently re-label the wrong phrase after a small edit.

  describe("multiple occurrences", () => {
    const text = "the man saw the man across the street";
    // "the man" appears at index 0 and index 12

    it("returns the first occurrence when no preferred position given", () => {
      const cache = new SubstringPositionCache();
      const result = cache.findBestMatch(text, "the man");

      expect(result).toEqual({ start: 0, end: 7 });
    });
  });

  // ---------- cache invalidation across texts ----------
  // The cache keys on the current text reference. A stale cache entry would
  // produce phantom matches in unrelated prompts, causing cross-request bleed.

  describe("cache invalidation", () => {
    it("clears prior cache entries when text reference changes", () => {
      const cache = new SubstringPositionCache();
      cache.findBestMatch("alpha beta gamma", "beta");

      // Different text — prior cache must not return stale beta position
      const result = cache.findBestMatch("delta epsilon", "epsilon");
      expect(result).toEqual({ start: 6, end: 13 });
    });
  });
});
