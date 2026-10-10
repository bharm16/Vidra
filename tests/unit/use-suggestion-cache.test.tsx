import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  useSuggestionCache,
  type EnhancementSuggestionEntry,
  type RawEnhancementSuggestionsResponse,
} from "@features/prompt-optimizer/PromptOptimizerContainer/hooks/useSuggestionCache";

const baseSuggestionContext = {
  startIndex: 3,
  matchLength: 4,
  contextBefore: "before",
  contextAfter: "after",
  found: true,
  usedFallback: false,
};

describe("useSuggestionCache", () => {
  describe("error handling", () => {
    it("filters out invalid suggestion entries while preserving valid ones", () => {
      const { result } = renderHook(() => useSuggestionCache());

      const response: RawEnhancementSuggestionsResponse = {
        suggestions: [
          null as unknown as EnhancementSuggestionEntry,
          undefined as unknown as EnhancementSuggestionEntry,
          "First",
          42 as unknown as string,
          { text: "Second", category: "style" },
          {
            suggestions: [
              "Nested",
              { text: "Nested Two", category: "subject" },
            ],
            category: "camera",
          },
        ],
        isPlaceholder: false,
      };

      const normalized = result.current.setCachedSuggestions(
        "cache-key",
        response,
      );

      expect(normalized.suggestions).toEqual([
        { text: "First" },
        { text: "Second", category: "style" },
        { text: "Nested", category: "camera" },
        { text: "Nested Two", category: "subject" },
      ]);
    });
  });

  describe("edge cases", () => {
    it("normalizes category casing and whitespace in cache keys", () => {
      const { result } = renderHook(() => useSuggestionCache());

      const keyA = result.current.buildCacheKey({
        normalizedHighlight: "highlight",
        normalizedPrompt: "some prompt text",
        suggestionContext: baseSuggestionContext,
        category: " Style ",
        spanFingerprint: null,
      });

      const keyB = result.current.buildCacheKey({
        normalizedHighlight: "highlight",
        normalizedPrompt: "some prompt text",
        suggestionContext: baseSuggestionContext,
        category: "style",
        spanFingerprint: null,
      });

      expect(keyA).toBe(keyB);
    });
  });

  describe("core behavior", () => {
    it("returns the cached entry for subsequent lookups", () => {
      const { result } = renderHook(() => useSuggestionCache());
      const response: RawEnhancementSuggestionsResponse = {
        suggestions: [{ text: "Cached" }],
        isPlaceholder: false,
      };

      result.current.setCachedSuggestions("cache-key", response);

      const cached = result.current.getCachedSuggestions("cache-key");

      expect(cached?.suggestions).toEqual([{ text: "Cached" }]);
      expect(cached?.isPlaceholder).toBe(false);
    });
  });
});
