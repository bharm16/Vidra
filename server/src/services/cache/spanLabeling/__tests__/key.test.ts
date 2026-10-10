import { describe, it, expect } from "vitest";
import { generateCacheKey, buildTextPattern, buildTextPrefix } from "../key";

describe("generateCacheKey", () => {
  describe("edge cases", () => {
    it("generates different keys for different text", () => {
      const policy = { enabledCategories: ["action"] };

      const key1 = generateCacheKey("text one", policy, "v1", "openai");
      const key2 = generateCacheKey("text two", policy, "v1", "openai");

      expect(key1).not.toBe(key2);
    });

    it("generates different keys for different policies", () => {
      const text = "same text";

      const key1 = generateCacheKey(
        text,
        { enabledCategories: ["action"] },
        "v1",
        "openai",
      );
      const key2 = generateCacheKey(
        text,
        { enabledCategories: ["subject"] },
        "v1",
        "openai",
      );

      expect(key1).not.toBe(key2);
    });

    it("generates different keys for different template versions", () => {
      const text = "same text";
      const policy = { enabledCategories: ["action"] };

      const key1 = generateCacheKey(text, policy, "v1", "openai");
      const key2 = generateCacheKey(text, policy, "v2", "openai");

      expect(key1).not.toBe(key2);
    });

    it("generates different keys for different providers", () => {
      const text = "same text";
      const policy = { enabledCategories: ["action"] };

      const key1 = generateCacheKey(text, policy, "v1", "openai");
      const key2 = generateCacheKey(text, policy, "v1", "gemini");

      expect(key1).not.toBe(key2);
    });
  });
});

describe("buildTextPattern", () => {
  describe("core behavior", () => {
    it("generates same text hash as generateCacheKey", () => {
      const text = "same text for both";
      const pattern = buildTextPattern(text);
      const key = generateCacheKey(text, null, "v1", "openai");

      // Pattern should start with same prefix as key
      const patternPrefix = pattern.slice(0, -1); // Remove wildcard
      expect(key.startsWith(patternPrefix)).toBe(true);
    });
  });
});

describe("buildTextPrefix", () => {
  describe("core behavior", () => {
    it("matches keys generated from same text", () => {
      const text = "matching text";
      const prefix = buildTextPrefix(text);
      const key = generateCacheKey(
        text,
        { enabledCategories: ["action"] },
        "v1",
        "openai",
      );

      expect(key.startsWith(prefix)).toBe(true);
    });

    it("does not match keys from different text", () => {
      const prefix = buildTextPrefix("text one");
      const key = generateCacheKey("text two", null, "v1", "openai");

      expect(key.startsWith(prefix)).toBe(false);
    });
  });
});

// Regression: a prior change rewrote LLM prompt instructions and bumped
// `PROMPT_VERSIONS.SPAN_LABELING` (a logging tag) without bumping
// `SpanLabelingConfig.DEFAULT_OPTIONS.templateVersion` (the field
// `generateCacheKey` actually consumes). The bump had no effect on cache
// invalidation: stale labels generated against the old, contradictory
// prompt continued to be served from cache. These tests pin the contract
// that `templateVersion` is part of the cache-key identity, so a future
// bump cannot silently no-op the cache.
