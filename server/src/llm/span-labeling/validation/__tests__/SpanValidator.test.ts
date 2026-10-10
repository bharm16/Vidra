import { describe, it, expect, vi } from "vitest";
import { validateSpans } from "../SpanValidator";
import { SubstringPositionCache } from "../../cache/SubstringPositionCache";
import type { ValidationPolicy, ProcessingOptions } from "../../types";

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

const defaultOptions: ProcessingOptions = {
  maxSpans: 60,
  minConfidence: 0.5,
  templateVersion: "v2",
};

function createCache(): SubstringPositionCache {
  return new SubstringPositionCache();
}

describe("validateSpans", () => {
  describe("error handling", () => {
    it("returns empty spans for empty input", () => {
      const cache = createCache();
      const result = validateSpans({
        spans: [],
        text: "source text",
        policy: defaultPolicy,
        options: defaultOptions,
        cache,
      });

      expect(result.ok).toBe(true);
      expect(result.result.spans).toEqual([]);
      expect(result.errors).toEqual([]);
      expect(result.verdict).toBe("pass");
    });

    it("returns a retryable verdict when a repair round-trip could fix the errors", () => {
      const cache = createCache();
      const result = validateSpans({
        spans: [{ text: "nonexistent phrase", role: "subject" }],
        text: "source text",
        policy: defaultPolicy,
        options: defaultOptions,
        attempt: 1,
        cache,
      });

      expect(result.ok).toBe(false);
      expect(result.verdict).toBe("retryable");
    });

    it("returns a terminal verdict when every error can only drop the span", () => {
      const cache = createCache();
      const longText =
        "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen";
      const result = validateSpans({
        spans: [{ text: longText, role: "subject" }],
        text: longText,
        policy: { ...defaultPolicy, nonTechnicalWordLimit: 5 },
        options: defaultOptions,
        attempt: 1,
        cache,
      });

      expect(result.ok).toBe(false);
      expect(result.verdict).toBe("terminal");
      expect(result.errors[0]).toContain("word limit");
    });

    it("returns a retryable verdict when terminal and retryable errors mix", () => {
      const cache = createCache();
      const longText =
        "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen";
      const result = validateSpans({
        spans: [
          { text: longText, role: "subject" },
          { text: "phrase that is absent", role: "subject" },
        ],
        text: longText,
        policy: { ...defaultPolicy, nonTechnicalWordLimit: 5 },
        options: defaultOptions,
        attempt: 1,
        cache,
      });

      expect(result.ok).toBe(false);
      expect(result.verdict).toBe("retryable");
    });

    it("drops invalid spans in lenient mode (attempt 2)", () => {
      const cache = createCache();
      const result = validateSpans({
        spans: [{ text: "nonexistent", role: "subject" }],
        text: "source text",
        policy: defaultPolicy,
        options: defaultOptions,
        attempt: 2,
        cache,
      });

      expect(result.ok).toBe(true);
      expect(result.result.spans.length).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("sets isAdversarial flag in result", () => {
      const cache = createCache();
      const result = validateSpans({
        spans: [],
        text: "source text",
        policy: defaultPolicy,
        options: defaultOptions,
        cache,
        isAdversarial: true,
      });

      expect(result.result.isAdversarial).toBe(true);
    });

    it("preserves analysisTrace when provided", () => {
      const cache = createCache();
      const result = validateSpans({
        spans: [],
        text: "source text",
        policy: defaultPolicy,
        options: defaultOptions,
        cache,
        analysisTrace: "Step 1: Analyzed text. Step 2: Found no spans.",
      });

      expect(result.result.analysisTrace).toBe(
        "Step 1: Analyzed text. Step 2: Found no spans.",
      );
    });
  });
});
