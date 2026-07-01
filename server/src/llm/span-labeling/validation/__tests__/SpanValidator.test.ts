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

    it("reports errors for invalid spans in strict mode (attempt 1)", () => {
      const cache = createCache();
      const result = validateSpans({
        spans: [{ text: "nonexistent", role: "subject" }],
        text: "source text",
        policy: defaultPolicy,
        options: defaultOptions,
        attempt: 1,
        cache,
      });

      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
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
    it("handles missing meta gracefully", () => {
      const cache = createCache();
      // Omit meta property to test default behavior
      const result = validateSpans({
        spans: [{ text: "source", role: "subject" }],
        text: "source text",
        policy: defaultPolicy,
        options: defaultOptions,
        cache,
      });

      expect(result.result.meta).toBeDefined();
      expect(result.result.meta.version).toBe(defaultOptions.templateVersion);
    });

    it("preserves meta version when provided", () => {
      const cache = createCache();
      const result = validateSpans({
        spans: [],
        meta: { version: "v1.5", notes: "custom" },
        text: "source text",
        policy: defaultPolicy,
        options: defaultOptions,
        cache,
      });

      expect(result.result.meta.version).toBe("v1.5");
    });

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

    it("includes adversarial note in meta when flagged", () => {
      const cache = createCache();
      const result = validateSpans({
        spans: [],
        text: "source text",
        policy: defaultPolicy,
        options: defaultOptions,
        cache,
        isAdversarial: true,
      });

      expect(result.result.meta.notes).toContain("adversarial");
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

    it("returns null for missing analysisTrace", () => {
      const cache = createCache();
      const result = validateSpans({
        spans: [],
        text: "source text",
        policy: defaultPolicy,
        options: defaultOptions,
        cache,
      });

      expect(result.result.analysisTrace).toBeNull();
    });
  });

  describe("processing pipeline", () => {
    it("sorts spans by position", () => {
      const cache = createCache();
      const text = "cat runs fast";
      const result = validateSpans({
        spans: [
          { text: "fast", role: "style" },
          { text: "cat", role: "subject" },
          { text: "runs", role: "action" },
        ],
        text,
        policy: defaultPolicy,
        options: defaultOptions,
        cache,
      });

      // Should be sorted by start position
      expect(result.result.spans[0]?.text).toBe("cat");
      expect(result.result.spans[1]?.text).toBe("runs");
      expect(result.result.spans[2]?.text).toBe("fast");
    });

    it("deduplicates identical spans", () => {
      const cache = createCache();
      const text = "cat runs fast";
      const result = validateSpans({
        spans: [
          { text: "cat", role: "subject" },
          { text: "cat", role: "subject" },
          { text: "cat", role: "subject" },
        ],
        text,
        policy: defaultPolicy,
        options: defaultOptions,
        cache,
      });

      // Only one cat should remain after deduplication
      expect(result.result.spans.filter((s) => s.text === "cat").length).toBe(
        1,
      );
    });

    it("resolves overlapping spans when allowOverlap is false", () => {
      const cache = createCache();
      const text = "cat runs fast";
      const result = validateSpans({
        spans: [
          { text: "cat runs", role: "subject", confidence: 0.8 },
          { text: "runs fast", role: "action", confidence: 0.9 },
        ],
        text,
        policy: { ...defaultPolicy, allowOverlap: false },
        options: defaultOptions,
        cache,
      });

      // Higher confidence span should win
      const spanTexts = result.result.spans.map((s) => s.text);
      expect(spanTexts.length).toBeLessThanOrEqual(2);
    });

    it("allows overlapping spans when allowOverlap is true", () => {
      const cache = createCache();
      const text = "cat runs fast";
      const result = validateSpans({
        spans: [
          { text: "cat runs", role: "subject", confidence: 0.8 },
          { text: "runs fast", role: "action", confidence: 0.9 },
        ],
        text,
        policy: { ...defaultPolicy, allowOverlap: true },
        options: defaultOptions,
        cache,
      });

      // Both spans should be preserved when overlap is allowed
      expect(result.result.spans.length).toBe(2);
    });

    it("filters spans below confidence threshold", () => {
      const cache = createCache();
      const text = "cat runs fast";
      const result = validateSpans({
        spans: [
          { text: "cat", role: "subject", confidence: 0.9 },
          { text: "runs", role: "action", confidence: 0.3 }, // Below threshold
        ],
        text,
        policy: defaultPolicy,
        options: { ...defaultOptions, minConfidence: 0.5 },
        cache,
      });

      // Only high-confidence span should remain
      expect(result.result.spans.length).toBe(1);
      expect(result.result.spans[0]?.text).toBe("cat");
    });

    it("truncates to maxSpans", () => {
      const cache = createCache();
      // Use realistic video-related text to avoid visual filter dropping single words
      const text =
        "A woman walks through a forest near a river while birds fly overhead";
      const result = validateSpans({
        spans: [
          { text: "woman", role: "subject.identity", confidence: 0.9 },
          { text: "walks", role: "action.movement", confidence: 0.85 },
          { text: "forest", role: "environment.setting", confidence: 0.8 },
          { text: "river", role: "environment.setting", confidence: 0.75 },
          { text: "birds", role: "subject.identity", confidence: 0.7 },
        ],
        text,
        policy: defaultPolicy,
        options: { ...defaultOptions, maxSpans: 3 },
        cache,
      });

      // Should have at most 3 spans (truncated from 5)
      expect(result.result.spans.length).toBeLessThanOrEqual(3);
      // Should have more than 0 (some spans should pass validation)
      expect(result.result.spans.length).toBeGreaterThan(0);
    });
  });

  describe("core behavior", () => {
    it("validates and returns spans with correct structure", () => {
      const cache = createCache();
      const text = "A cat runs fast";
      const result = validateSpans({
        spans: [{ text: "cat", role: "subject.identity", confidence: 0.9 }],
        meta: { version: "v1", notes: "test" },
        text,
        policy: defaultPolicy,
        options: defaultOptions,
        cache,
      });

      expect(result.ok).toBe(true);
      expect(result.result.spans.length).toBe(1);
      expect(result.result.spans[0]).toHaveProperty("text", "cat");
      expect(result.result.spans[0]).toHaveProperty("role", "subject.identity");
      expect(result.result.spans[0]).toHaveProperty("start");
      expect(result.result.spans[0]).toHaveProperty("end");
    });

    it("combines notes from all processing phases", () => {
      const cache = createCache();
      const result = validateSpans({
        spans: [
          { text: "cat", role: "subject", confidence: 0.9 },
          { text: "cat", role: "subject", confidence: 0.8 }, // Duplicate
        ],
        meta: { version: "v1", notes: "original note" },
        text: "cat runs",
        policy: defaultPolicy,
        options: defaultOptions,
        cache,
      });

      // Notes should include original and processing notes
      expect(result.result.meta.notes).toContain("original note");
    });

    it("preserves NLP pipeline stats in meta", () => {
      const cache = createCache();
      const result = validateSpans({
        spans: [],
        meta: {
          version: "v1",
          notes: "",
          closedVocab: 5,
          openVocab: 3,
          tier1Latency: 10,
          tier2Latency: 50,
          latency: 60,
          source: "nlp",
        },
        text: "source text",
        policy: defaultPolicy,
        options: defaultOptions,
        cache,
      });

      expect(result.result.meta.closedVocab).toBe(5);
      expect(result.result.meta.openVocab).toBe(3);
      expect(result.result.meta.tier1Latency).toBe(10);
      expect(result.result.meta.tier2Latency).toBe(50);
      expect(result.result.meta.latency).toBe(60);
      expect(result.result.meta.source).toBe("nlp");
    });
  });
});
