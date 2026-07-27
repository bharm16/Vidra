import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { useSuggestionApi } from "@features/prompt-optimizer/PromptOptimizerContainer/hooks/useSuggestionApi";
import { fetchEnhancementSuggestions } from "@features/prompt-optimizer/api/enhancementSuggestionsApi";
import {
  clearSpanEditHistory,
  recordSpanEdit,
} from "@features/prompt-optimizer/hooks/useEditHistory";
import { prepareSpanContext } from "@features/span-highlighting/utils/spanProcessing";
import { CancellationError } from "@features/prompt-optimizer/utils/signalUtils";
import { PromptContext } from "@utils/PromptContext/PromptContext";

vi.mock("@features/prompt-optimizer/api/enhancementSuggestionsApi", () => ({
  fetchEnhancementSuggestions: vi.fn(),
}));

vi.mock("@features/span-highlighting/utils/spanProcessing", () => ({
  prepareSpanContext: vi.fn(),
}));

const mockFetchEnhancementSuggestions = vi.mocked(fetchEnhancementSuggestions);
const mockPrepareSpanContext = vi.mocked(prepareSpanContext);

const suggestionContext = {
  startIndex: 5,
  matchLength: 3,
  contextBefore: "before",
  contextAfter: "after",
  found: true,
  usedFallback: false,
};

describe("useSuggestionApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSpanEditHistory();
    mockPrepareSpanContext.mockReturnValue({
      simplifiedSpans: [{ text: "span-a", role: "style", category: "style" }],
      nearbySpans: [
        {
          text: "span-b",
          role: "style",
          category: "style",
          distance: 1,
          position: "after",
          start: 0,
          end: 1,
        },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("error handling", () => {
    it("propagates API errors from the request manager", async () => {
      vi.useFakeTimers();
      mockFetchEnhancementSuggestions.mockRejectedValue(new Error("boom"));

      const { result } = renderHook(() =>
        useSuggestionApi({
          promptOptimizer: { inputPrompt: "input" },
          stablePromptContext: null,
        }),
      );

      const promise = result.current.fetchSuggestions({
        dedupKey: "dedup-key",
        normalizedHighlight: "highlight",
        normalizedPrompt: "prompt",
        suggestionContext,
        metadata: null,
        allLabeledSpans: [],
      });
      const rejection = expect(promise).rejects.toThrow("boom");

      await vi.advanceTimersByTimeAsync(200);
      await rejection;
    });

    it("surfaces cancellation errors returned by the request", async () => {
      vi.useFakeTimers();
      mockFetchEnhancementSuggestions.mockRejectedValue(
        new CancellationError("cancelled"),
      );

      const { result } = renderHook(() =>
        useSuggestionApi({
          promptOptimizer: { inputPrompt: "input" },
          stablePromptContext: null,
        }),
      );

      const promise = result.current.fetchSuggestions({
        dedupKey: "dedup-cancel",
        normalizedHighlight: "highlight",
        normalizedPrompt: "prompt",
        suggestionContext,
        metadata: null,
        allLabeledSpans: [],
      });
      const rejection = expect(promise).rejects.toThrow(CancellationError);

      await vi.advanceTimersByTimeAsync(200);
      await rejection;
    });
  });

  describe("edge cases", () => {
    it("invokes onRequestStart before dispatching the API call", async () => {
      vi.useFakeTimers();
      const callOrder: string[] = [];

      mockFetchEnhancementSuggestions.mockImplementation(async () => {
        callOrder.push("fetch");
        return { suggestions: [], isPlaceholder: false };
      });

      const { result } = renderHook(() =>
        useSuggestionApi({
          promptOptimizer: { inputPrompt: "input" },
          stablePromptContext: null,
        }),
      );

      const promise = result.current.fetchSuggestions({
        dedupKey: "dedup-start",
        normalizedHighlight: "highlight",
        normalizedPrompt: "prompt",
        suggestionContext,
        metadata: null,
        allLabeledSpans: [],
        onRequestStart: () => callOrder.push("start"),
      });

      await vi.advanceTimersByTimeAsync(200);
      await promise;

      expect(callOrder).toEqual(["start", "fetch"]);
    });
  });

  describe("core behavior", () => {
    it("passes span context and edit history to the API call", async () => {
      vi.useFakeTimers();
      mockFetchEnhancementSuggestions.mockResolvedValue({
        suggestions: ["A"],
        isPlaceholder: false,
      });

      // Seeded through the real store the apply path writes to, not a mock of
      // it — the request must carry edits recorded outside this hook.
      recordSpanEdit({
        original: "wide shot",
        replacement: "slow push-in",
        category: "camera",
      });

      const { result } = renderHook(() =>
        useSuggestionApi({
          promptOptimizer: { inputPrompt: "input" },
          stablePromptContext: new PromptContext({}, { format: "video" }),
        }),
      );

      const promise = result.current.fetchSuggestions({
        dedupKey: "dedup-api",
        normalizedHighlight: "highlight",
        normalizedPrompt: "prompt",
        suggestionContext,
        metadata: { category: "style" },
        allLabeledSpans: [{ id: "span-1" }],
      });

      expect(result.current.isRequestInFlight("dedup-api")).toBe(true);

      await vi.advanceTimersByTimeAsync(200);
      await promise;

      expect(mockPrepareSpanContext).toHaveBeenCalledWith(
        { category: "style" },
        [{ id: "span-1" }],
      );

      expect(mockFetchEnhancementSuggestions).toHaveBeenCalledWith(
        expect.objectContaining({
          highlightedText: "highlight",
          contextBefore: "before",
          contextAfter: "after",
          fullPrompt: "prompt",
          inputPrompt: "input",
          brainstormContext: expect.objectContaining({
            metadata: expect.objectContaining({ format: "video" }),
          }),
          metadata: { category: "style" },
          allLabeledSpans: [
            expect.objectContaining({
              text: "span-a",
              role: "style",
              category: "style",
            }),
          ],
          nearbySpans: [
            expect.objectContaining({
              text: "span-b",
              role: "style",
              category: "style",
            }),
          ],
          editHistory: [
            expect.objectContaining({
              original: "wide shot",
              replacement: "slow push-in",
              category: "camera",
            }),
          ],
          signal: expect.anything(),
        }),
      );

      expect(result.current.isRequestInFlight("dedup-api")).toBe(false);
    });
  });
});
