import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequestEnhancementSuggestions = vi.fn();
const mockParseEnhancementSuggestionsResponse = vi.fn();

vi.mock("@/api/enhancementSuggestionsApi", () => ({
  requestEnhancementSuggestions: (...args: unknown[]) =>
    mockRequestEnhancementSuggestions(...args),
  parseEnhancementSuggestionsResponse: (...args: unknown[]) =>
    mockParseEnhancementSuggestionsResponse(...args),
}));

import { fetchHighlightSuggestions } from "@hooks/usePromptDebuggerApi";

describe("fetchHighlightSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("error handling", () => {
    it("throws when response is not ok", async () => {
      mockRequestEnhancementSuggestions.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      await expect(
        fetchHighlightSuggestions({
          highlightedText: "cowboy",
          contextBefore: "",
          contextAfter: "",
          fullPrompt: "a cowboy",
          originalUserPrompt: "a cowboy",
          brainstormContext: null,
          highlightedCategory: null,
          highlightedCategoryConfidence: null,
          highlightedPhrase: "cowboy",
        }),
      ).rejects.toThrow("HTTP 500: Internal Server Error");
    });

    it("throws when response is 404", async () => {
      mockRequestEnhancementSuggestions.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(
        fetchHighlightSuggestions({
          highlightedText: "test",
          contextBefore: "",
          contextAfter: "",
          fullPrompt: "test",
          originalUserPrompt: "test",
          brainstormContext: null,
          highlightedCategory: null,
          highlightedCategoryConfidence: null,
          highlightedPhrase: "test",
        }),
      ).rejects.toThrow("HTTP 404: Not Found");
    });

    it("propagates network errors from requestEnhancementSuggestions", async () => {
      mockRequestEnhancementSuggestions.mockRejectedValue(
        new TypeError("Failed to fetch"),
      );

      await expect(
        fetchHighlightSuggestions({
          highlightedText: "test",
          contextBefore: "",
          contextAfter: "",
          fullPrompt: "test",
          originalUserPrompt: "test",
          brainstormContext: null,
          highlightedCategory: null,
          highlightedCategoryConfidence: null,
          highlightedPhrase: "test",
        }),
      ).rejects.toThrow("Failed to fetch");
    });
  });

  describe("edge cases", () => {
    it("returns empty array when response has no suggestions field", async () => {
      mockRequestEnhancementSuggestions.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
      });
      mockParseEnhancementSuggestionsResponse.mockResolvedValue({});

      const result = await fetchHighlightSuggestions({
        highlightedText: "test",
        contextBefore: "",
        contextAfter: "",
        fullPrompt: "test",
        originalUserPrompt: "test",
        brainstormContext: null,
        highlightedCategory: null,
        highlightedCategoryConfidence: null,
        highlightedPhrase: "test",
      });

      expect(result).toEqual([]);
    });
  });

  describe("core behavior", () => {
    it("returns suggestions from parsed response", async () => {
      mockRequestEnhancementSuggestions.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
      });
      mockParseEnhancementSuggestionsResponse.mockResolvedValue({
        suggestions: ["Use more vivid imagery", "Add camera movement"],
      });

      const result = await fetchHighlightSuggestions({
        highlightedText: "cowboy",
        contextBefore: "A weathered",
        contextAfter: "walks slowly",
        fullPrompt: "A weathered cowboy walks slowly",
        originalUserPrompt: "a cowboy walks",
        brainstormContext: null,
        highlightedCategory: "subject",
        highlightedCategoryConfidence: 0.9,
        highlightedPhrase: "cowboy",
      });

      expect(result).toEqual(["Use more vivid imagery", "Add camera movement"]);
    });

    it("passes custom fetchImpl when provided", async () => {
      const customFetch = vi.fn();
      mockRequestEnhancementSuggestions.mockResolvedValue({ ok: true });
      mockParseEnhancementSuggestionsResponse.mockResolvedValue({
        suggestions: [],
      });

      await fetchHighlightSuggestions(
        {
          highlightedText: "test",
          contextBefore: "",
          contextAfter: "",
          fullPrompt: "test",
          originalUserPrompt: "test",
          brainstormContext: null,
          highlightedCategory: null,
          highlightedCategoryConfidence: null,
          highlightedPhrase: "test",
        },
        customFetch,
      );

      expect(mockRequestEnhancementSuggestions).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ fetchImpl: customFetch }),
      );
    });
  });
});
