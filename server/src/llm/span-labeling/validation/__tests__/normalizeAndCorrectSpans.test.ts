import { describe, it, expect, vi } from "vitest";
import { normalizeAndCorrectSpans } from "../normalizeAndCorrectSpans";
import { SubstringPositionCache } from "../../cache/SubstringPositionCache";
import type { ValidationPolicy } from "../../types";

// Mock the logger to avoid side effects
vi.mock("@infrastructure/Logger", () => ({
  logger: {
    child: () => ({
      debug: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    }),
  },
}));

const defaultPolicy: ValidationPolicy = {
  nonTechnicalWordLimit: 15,
  allowOverlap: false,
};

function createCache(): SubstringPositionCache {
  return new SubstringPositionCache();
}

describe("normalizeAndCorrectSpans", () => {
  describe("error handling", () => {
    it("returns empty result for empty spans array", () => {
      const cache = createCache();
      const result = normalizeAndCorrectSpans(
        [],
        "source text",
        defaultPolicy,
        cache,
        false,
      );

      expect(result.sanitized).toEqual([]);
      expect(result.errors).toEqual([]);
      expect(result.notes).toEqual([]);
    });

    it("reports error for non-object span in strict mode", () => {
      const cache = createCache();
      const result = normalizeAndCorrectSpans(
        [null, undefined, "string", 123],
        "source text",
        defaultPolicy,
        cache,
        false,
      );

      expect(result.errors.length).toBe(4);
      expect(result.errors[0]?.message).toContain("span[0]");
      expect(result.errors[0]?.message).toContain("invalid span object");
      expect(result.errors[0]?.kind).toBe("retryable");
    });

    it("drops non-object span in lenient mode", () => {
      const cache = createCache();
      const result = normalizeAndCorrectSpans(
        [null, { text: "source", role: "subject" }],
        "source text",
        defaultPolicy,
        cache,
        true,
      );

      expect(result.sanitized.length).toBe(1);
      expect(result.notes).toContain("span[0] dropped: invalid span object");
    });

    it("reports error when span text is missing in strict mode", () => {
      const cache = createCache();
      const result = normalizeAndCorrectSpans(
        [{ role: "subject" }],
        "source text",
        defaultPolicy,
        cache,
        false,
      );

      expect(result.errors[0]?.message).toContain("missing text");
      expect(result.errors[0]?.kind).toBe("retryable");
    });

    it("reports error when span text is empty in strict mode", () => {
      const cache = createCache();
      const result = normalizeAndCorrectSpans(
        [{ text: "", role: "subject" }],
        "source text",
        defaultPolicy,
        cache,
        false,
      );

      expect(result.errors[0]?.message).toContain("missing text");
    });

    it("reports error when span text not found in source in strict mode", () => {
      const cache = createCache();
      const result = normalizeAndCorrectSpans(
        [{ text: "nonexistent phrase", role: "subject" }],
        "source text",
        defaultPolicy,
        cache,
        false,
      );

      expect(result.errors[0]?.message).toContain("not found in source");
      expect(result.errors[0]?.kind).toBe("retryable");
    });

    it("drops span when text not found in lenient mode", () => {
      const cache = createCache();
      const result = normalizeAndCorrectSpans(
        [{ text: "nonexistent", role: "subject" }],
        "source text",
        defaultPolicy,
        cache,
        true,
      );

      expect(result.sanitized.length).toBe(0);
      expect(result.notes).toContain(
        "span[0] dropped: text not found in source",
      );
    });
  });

  describe("edge cases", () => {
    it("handles case-insensitive matching", () => {
      const cache = createCache();
      const result = normalizeAndCorrectSpans(
        [{ text: "SOURCE", role: "subject" }],
        "source text",
        defaultPolicy,
        cache,
        true,
      );

      expect(result.sanitized.length).toBe(1);
      expect(result.sanitized[0]?.start).toBe(0);
    });

    it("handles matching with different quote styles", () => {
      const cache = createCache();
      const result = normalizeAndCorrectSpans(
        [{ text: '"hello"', role: "subject" }],
        "say hello world",
        defaultPolicy,
        cache,
        true,
      );

      // Should strip quotes and find "hello"
      expect(result.sanitized.length).toBe(1);
      expect(result.sanitized[0]?.text).toBe("hello");
    });

    it("refines boundaries to exclude leading punctuation", () => {
      const cache = createCache();
      const result = normalizeAndCorrectSpans(
        [{ text: ", cat", role: "subject", start: 1, end: 6 }],
        "a, cat runs", // comma before cat
        defaultPolicy,
        cache,
        true,
      );

      // Should find "cat" and refine boundaries
      expect(result.sanitized.length).toBe(1);
      expect(result.sanitized[0]?.text).toBe("cat");
    });

    it("refines boundaries to exclude trailing punctuation", () => {
      const cache = createCache();
      const result = normalizeAndCorrectSpans(
        [{ text: "cat,", role: "subject" }],
        "a cat, runs",
        defaultPolicy,
        cache,
        true,
      );

      // Should strip trailing comma
      expect(result.sanitized[0]?.text).toBe("cat");
    });

    it("refines boundaries to exclude leading prepositions", () => {
      const cache = createCache();
      const result = normalizeAndCorrectSpans(
        [{ text: "with a woman", role: "subject" }],
        "scene with a woman walking",
        defaultPolicy,
        cache,
        true,
      );

      // Should strip "with a" and keep "woman"
      expect(result.sanitized[0]?.text).toBe("woman");
    });

    it("refines boundaries to exclude trailing prepositions", () => {
      const cache = createCache();
      const result = normalizeAndCorrectSpans(
        [{ text: "camera with", role: "camera" }],
        "steady camera with motion",
        defaultPolicy,
        cache,
        true,
      );

      // Should strip trailing "with"
      expect(result.sanitized[0]?.text).toBe("camera");
    });

    it("handles spans exceeding word limit in lenient mode", () => {
      const cache = createCache();
      const longText =
        "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen";
      const policy: ValidationPolicy = {
        ...defaultPolicy,
        nonTechnicalWordLimit: 5,
      };

      const result = normalizeAndCorrectSpans(
        [{ text: longText, role: "subject" }],
        longText,
        policy,
        cache,
        true,
      );

      expect(result.sanitized.length).toBe(0);
      expect(result.notes).toContain(
        "span[0] dropped: exceeds non-technical word limit",
      );
    });

    it("exempts technical categories from word limit", () => {
      const cache = createCache();
      const longText =
        "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen";
      const policy: ValidationPolicy = {
        ...defaultPolicy,
        nonTechnicalWordLimit: 5,
      };

      const result = normalizeAndCorrectSpans(
        [{ text: longText, role: "technical.frameRate" }],
        longText,
        policy,
        cache,
        true,
      );

      // Technical categories are exempt
      expect(result.sanitized.length).toBe(1);
    });

    it("corrects indices when LLM provides wrong start/end", () => {
      const cache = createCache();
      const result = normalizeAndCorrectSpans(
        [{ text: "world", role: "subject", start: 0, end: 5 }], // Wrong indices
        "hello world",
        defaultPolicy,
        cache,
        true,
      );

      expect(result.sanitized.length).toBe(1);
      expect(result.sanitized[0]?.start).toBe(6); // Correct position
      expect(result.sanitized[0]?.end).toBe(11);
      expect(result.notes.some((n) => n.includes("indices adjusted"))).toBe(
        true,
      );
    });
  });

  describe("core behavior", () => {
    it("normalizes valid span with correct indices", () => {
      const cache = createCache();
      const result = normalizeAndCorrectSpans(
        [{ text: "cat", role: "subject", start: 0, end: 3, confidence: 0.9 }],
        "cat runs fast",
        defaultPolicy,
        cache,
        false,
      );

      expect(result.sanitized.length).toBe(1);
      expect(result.sanitized[0]?.text).toBe("cat");
      expect(result.sanitized[0]?.start).toBe(0);
      expect(result.sanitized[0]?.end).toBe(3);
      expect(result.errors).toEqual([]);
    });

    it("handles multiple valid spans", () => {
      const cache = createCache();
      const result = normalizeAndCorrectSpans(
        [
          { text: "cat", role: "subject" },
          { text: "runs", role: "action.movement" },
          { text: "fast", role: "style" },
        ],
        "cat runs fast",
        defaultPolicy,
        cache,
        false,
      );

      expect(result.sanitized.length).toBe(3);
    });

    it("handles duplicate occurrences by picking closest to preferred start", () => {
      const cache = createCache();
      const text = "the cat and the cat";
      const result = normalizeAndCorrectSpans(
        [{ text: "cat", role: "subject", start: 15 }], // Closer to second "cat"
        text,
        defaultPolicy,
        cache,
        true,
      );

      expect(result.sanitized.length).toBe(1);
      expect(result.sanitized[0]?.start).toBe(16); // Second "cat" at index 16
    });

    it("claims positions to avoid duplicate spans at same location", () => {
      const cache = createCache();
      const text = "cat runs fast";
      const result = normalizeAndCorrectSpans(
        [
          { text: "cat", role: "subject" },
          { text: "cat", role: "animal" }, // Same text, different role
        ],
        text,
        defaultPolicy,
        cache,
        true,
      );

      // Both should reference the same "cat" - one will be at claimed position
      expect(result.sanitized.length).toBe(2);
    });
  });
});
