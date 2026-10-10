import type React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useSuggestionFetch } from "@features/prompt-optimizer/PromptOptimizerContainer/hooks/useSuggestionFetch";
import { useSuggestionApi } from "@features/prompt-optimizer/PromptOptimizerContainer/hooks/useSuggestionApi";
import { useSuggestionCache } from "@features/prompt-optimizer/PromptOptimizerContainer/hooks/useSuggestionCache";
import { CancellationError } from "@features/prompt-optimizer/utils/signalUtils";
import type { SuggestionsData } from "@features/prompt-optimizer/PromptCanvas/types";
import type { PromptOptimizer } from "@features/prompt-optimizer/context/types";
import type { Toast } from "@hooks/types";

vi.mock(
  "@features/prompt-optimizer/PromptOptimizerContainer/hooks/useSuggestionApi",
  () => ({
    useSuggestionApi: vi.fn(),
  }),
);

vi.mock(
  "@features/prompt-optimizer/PromptOptimizerContainer/hooks/useSuggestionCache",
  () => ({
    useSuggestionCache: vi.fn(),
  }),
);

vi.mock("@/services/LoggingService", () => ({
  logger: {
    child: () => ({
      error: vi.fn(),
      warn: vi.fn(),
    }),
  },
}));

const mockUseSuggestionApi = vi.mocked(useSuggestionApi);
const mockUseSuggestionCache = vi.mocked(useSuggestionCache);

const createToast = (): Toast => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
});

const basePromptOptimizer = {
  displayedPrompt: "A sample prompt with highlight",
  inputPrompt: "Input prompt",
} as PromptOptimizer;

const basePayload = {
  highlightedText: "highlight",
  originalText: "highlight",
  displayedPrompt: "A sample prompt with highlight",
  offsets: { start: 24, end: 33 },
};

const createStateHarness = () => {
  let state: SuggestionsData | null = null;
  const setSuggestionsData = vi.fn(
    (action: React.SetStateAction<SuggestionsData | null>) => {
      state = typeof action === "function" ? action(state) : action;
    },
  );
  return { getState: () => state, setSuggestionsData };
};

describe("useSuggestionFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("error handling", () => {
    it("sets error state and toast when fetch fails", async () => {
      const { getState, setSuggestionsData } = createStateHarness();
      const toast = createToast();

      const fetchSuggestions = vi.fn(async ({ onRequestStart }) => {
        onRequestStart?.();
        throw new Error("boom");
      });

      mockUseSuggestionApi.mockReturnValue({
        fetchSuggestions,
        cancelCurrentRequest: vi.fn(),
        isRequestInFlight: vi.fn().mockReturnValue(false),
      });

      mockUseSuggestionCache.mockReturnValue({
        buildCacheKey: vi.fn().mockReturnValue("cache-key"),
        getCachedSuggestions: vi.fn().mockReturnValue(null),
        setCachedSuggestions: vi.fn(),
      });

      const { result } = renderHook(() =>
        useSuggestionFetch({
          promptOptimizer: basePromptOptimizer,
          selectedMode: "video",
          suggestionsData: null,
          setSuggestionsData,
          stablePromptContext: null,
          toast,
          handleSuggestionClick: vi.fn(),
        }),
      );

      await act(async () => {
        await result.current.fetchEnhancementSuggestions(basePayload);
      });

      const updated = getState();
      expect(updated?.isError).toBe(true);
      expect(updated?.errorMessage).toBe("boom");
      expect(updated?.suggestions).toEqual([]);
      expect(toast.error).toHaveBeenCalledWith("Failed to load suggestions");
    });

    it("ignores cancellation errors without showing toast", async () => {
      const { getState, setSuggestionsData } = createStateHarness();
      const toast = createToast();

      const fetchSuggestions = vi.fn(async ({ onRequestStart }) => {
        onRequestStart?.();
        throw new CancellationError("cancelled");
      });

      mockUseSuggestionApi.mockReturnValue({
        fetchSuggestions,
        cancelCurrentRequest: vi.fn(),
        isRequestInFlight: vi.fn().mockReturnValue(false),
      });

      mockUseSuggestionCache.mockReturnValue({
        buildCacheKey: vi.fn().mockReturnValue("cache-key"),
        getCachedSuggestions: vi.fn().mockReturnValue(null),
        setCachedSuggestions: vi.fn(),
      });

      const { result } = renderHook(() =>
        useSuggestionFetch({
          promptOptimizer: basePromptOptimizer,
          selectedMode: "video",
          suggestionsData: null,
          setSuggestionsData,
          stablePromptContext: null,
          toast,
          handleSuggestionClick: vi.fn(),
        }),
      );

      await act(async () => {
        await result.current.fetchEnhancementSuggestions(basePayload);
      });

      expect(toast.error).not.toHaveBeenCalled();
      expect(getState()?.isError).not.toBe(true);
    });
  });

  describe("edge cases", () => {
    it("does not request suggestions for empty selected words", async () => {
      const { setSuggestionsData } = createStateHarness();

      const fetchSuggestions = vi.fn();
      const cancelCurrentRequest = vi.fn();

      mockUseSuggestionApi.mockReturnValue({
        fetchSuggestions,
        cancelCurrentRequest,
        isRequestInFlight: vi.fn().mockReturnValue(false),
      });

      mockUseSuggestionCache.mockReturnValue({
        buildCacheKey: vi.fn(),
        getCachedSuggestions: vi.fn(),
        setCachedSuggestions: vi.fn(),
      });

      const { result } = renderHook(() =>
        useSuggestionFetch({
          promptOptimizer: basePromptOptimizer,
          selectedMode: "video",
          suggestionsData: null,
          setSuggestionsData,
          stablePromptContext: null,
          toast: createToast(),
          handleSuggestionClick: vi.fn(),
        }),
      );

      await act(async () => {
        await result.current.fetchEnhancementSuggestions({
          highlightedText: "",
        });
      });

      expect(fetchSuggestions).not.toHaveBeenCalled();
      expect(cancelCurrentRequest).not.toHaveBeenCalled();
      expect(setSuggestionsData).not.toHaveBeenCalled();
    });

    it("skips duplicate in-flight requests", async () => {
      const { setSuggestionsData } = createStateHarness();
      const fetchSuggestions = vi.fn();
      const cancelCurrentRequest = vi.fn();

      mockUseSuggestionApi.mockReturnValue({
        fetchSuggestions,
        cancelCurrentRequest,
        isRequestInFlight: vi.fn().mockReturnValue(true),
      });

      mockUseSuggestionCache.mockReturnValue({
        buildCacheKey: vi.fn().mockReturnValue("cache-key"),
        getCachedSuggestions: vi.fn(),
        setCachedSuggestions: vi.fn(),
      });

      const { result } = renderHook(() =>
        useSuggestionFetch({
          promptOptimizer: basePromptOptimizer,
          selectedMode: "video",
          suggestionsData: null,
          setSuggestionsData,
          stablePromptContext: null,
          toast: createToast(),
          handleSuggestionClick: vi.fn(),
        }),
      );

      await act(async () => {
        await result.current.fetchEnhancementSuggestions(basePayload);
      });

      expect(fetchSuggestions).not.toHaveBeenCalled();
      expect(cancelCurrentRequest).not.toHaveBeenCalled();
    });
  });

  describe("core behavior", () => {
    it("uses cached suggestions without calling the API", async () => {
      const { getState, setSuggestionsData } = createStateHarness();

      const fetchSuggestions = vi.fn();
      const cancelCurrentRequest = vi.fn();

      mockUseSuggestionApi.mockReturnValue({
        fetchSuggestions,
        cancelCurrentRequest,
        isRequestInFlight: vi.fn().mockReturnValue(false),
      });

      mockUseSuggestionCache.mockReturnValue({
        buildCacheKey: vi.fn().mockReturnValue("cache-key"),
        getCachedSuggestions: vi.fn().mockReturnValue({
          suggestions: [{ text: "cached" }],
          isPlaceholder: false,
        }),
        setCachedSuggestions: vi.fn(),
      });

      const { result } = renderHook(() =>
        useSuggestionFetch({
          promptOptimizer: basePromptOptimizer,
          selectedMode: "video",
          suggestionsData: null,
          setSuggestionsData,
          stablePromptContext: null,
          toast: createToast(),
          handleSuggestionClick: vi.fn(),
        }),
      );

      await act(async () => {
        await result.current.fetchEnhancementSuggestions(basePayload);
      });

      expect(fetchSuggestions).not.toHaveBeenCalled();
      expect(cancelCurrentRequest).toHaveBeenCalledTimes(1);
      expect(getState()?.suggestions).toEqual([{ text: "cached" }]);
      expect(getState()?.isLoading).toBe(false);
    });
  });
});
