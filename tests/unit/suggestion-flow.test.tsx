import React, { useEffect, useMemo, useRef, useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, waitFor, act } from "@testing-library/react";

import { useSuggestionFetch } from "@features/prompt-optimizer/PromptOptimizerContainer/hooks/useSuggestionFetch";
import { useTextSelection } from "@features/prompt-optimizer/PromptCanvas/hooks/useTextSelection";
import { fetchEnhancementSuggestions } from "@features/prompt-optimizer/api/enhancementSuggestionsApi";
import { CancellationError } from "@features/prompt-optimizer/utils/signalUtils";
import type { SuggestionsData } from "@features/prompt-optimizer/PromptCanvas/types";
import type { PromptOptimizer } from "@features/prompt-optimizer/context/types";
import type { Toast } from "@hooks/types";
import { createCanonicalText } from "@/utils/canonicalText";

vi.mock("@features/prompt-optimizer/api/enhancementSuggestionsApi", () => ({
  fetchEnhancementSuggestions: vi.fn().mockResolvedValue({
    suggestions: ["stub"],
    isPlaceholder: false,
  }),
  enhancementSuggestionsApi: {
    fetchEnhancementSuggestions: vi.fn(),
  },
}));

const promptText = "The park is sunny today.";
const spanContext = [
  {
    id: "span-1",
    start: 4,
    end: 8,
    role: "environment.location",
    category: "environment.location",
    quote: "park",
    confidence: 0.9,
  },
  {
    id: "span-2",
    start: 12,
    end: 17,
    role: "style.aesthetic",
    category: "style.aesthetic",
    quote: "sunny",
    confidence: 0.7,
  },
];

const createPromptOptimizer = (prompt: string): PromptOptimizer => ({
  inputPrompt: prompt,
  setInputPrompt: vi.fn(),
  isProcessing: false,
  optimizedPrompt: prompt,
  setOptimizedPrompt: vi.fn(),
  displayedPrompt: prompt,
  setDisplayedPrompt: vi.fn(),
  genericOptimizedPrompt: null,
  previewPrompt: null,
  setPreviewPrompt: vi.fn(),
  previewAspectRatio: null,
  setPreviewAspectRatio: vi.fn(),
  qualityScore: null,
  skipAnimation: false,
  setSkipAnimation: vi.fn(),
  improvementContext: null,
  setImprovementContext: vi.fn(),
  optimizationResultVersion: 0,
  lockedSpans: [],
  optimize: vi.fn().mockResolvedValue(null),
  compile: vi.fn().mockResolvedValue(null),
  resetPrompt: vi.fn(),
  setLockedSpans: vi.fn(),
  addLockedSpan: vi.fn(),
  removeLockedSpan: vi.fn(),
  clearLockedSpans: vi.fn(),
});

function SuggestionFlowHarness(): React.ReactElement {
  const editorRef = useRef<HTMLDivElement>(null);
  const [suggestionsData, setSuggestionsData] =
    useState<SuggestionsData | null>(null);
  const toast = useMemo(
    () =>
      ({
        success: vi.fn(),
        info: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
      }) as Toast,
    [],
  );

  const promptOptimizer = useMemo(() => createPromptOptimizer(promptText), []);

  const parseResult = useMemo(
    () => ({
      canonical: createCanonicalText(promptText),
      spans: spanContext,
      meta: null,
      status: "success" as const,
      error: null,
      displayText: promptText,
      degraded: false,
    }),
    [],
  );

  const { fetchEnhancementSuggestions: triggerFetch } = useSuggestionFetch({
    promptOptimizer,
    selectedMode: "video",
    suggestionsData,
    setSuggestionsData,
    stablePromptContext: null,
    toast,
    handleSuggestionClick: async () => {},
  });

  const { handleHighlightClick } = useTextSelection({
    selectedMode: "video",
    editorRef: editorRef as React.RefObject<HTMLElement>,
    displayedPrompt: promptText,
    parseResult,
    onFetchSuggestions: triggerFetch,
  });

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }
    editorRef.current.innerHTML = [
      "The ",
      '<span class="value-word" ',
      'data-span-id="span-1" ',
      'data-category="environment.location" ',
      'data-start="4" ',
      'data-end="8" ',
      'data-quote="park" ',
      'data-confidence="0.9"',
      ">park</span>",
      " is sunny today.",
    ].join("");
  }, []);

  return <div ref={editorRef} onClick={handleHighlightClick} />;
}

describe("Suggestion flow", () => {
  const fetchMock = vi.mocked(fetchEnhancementSuggestions);

  beforeEach(() => {
    fetchMock.mockClear();
  });

  it("passes normalized span context to suggestion API on highlight click", async () => {
    const { container } = render(<SuggestionFlowHarness />);
    const highlight = container.querySelector(".value-word");
    expect(highlight).not.toBeNull();

    fireEvent.click(highlight as Element);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const payload = fetchMock.mock.calls[0]?.[0];
    expect(payload?.highlightedText).toBe("park");
    expect(payload?.allLabeledSpans).toEqual([
      {
        text: "park",
        role: "environment.location",
        category: "environment.location",
        confidence: 0.9,
        start: 4,
        end: 8,
      },
      {
        text: "sunny",
        role: "style.aesthetic",
        category: "style.aesthetic",
        confidence: 0.7,
        start: 12,
        end: 17,
      },
    ]);
    expect(payload?.nearbySpans).toEqual([
      expect.objectContaining({
        text: "sunny",
        position: "after",
        start: 12,
        end: 17,
      }),
    ]);
  });
});

/**
 * Integration tests for useSuggestionFetch hook
 *
 * Tests the full flow: selection → debounce → cache → API → state
 * Validates Requirements: 1.1, 1.3, 2.1, 3.1, 6.3
 */
describe("useSuggestionFetch integration", () => {
  const fetchMock = vi.mocked(fetchEnhancementSuggestions);

  // Test harness component that exposes hook state
  function TestHarness({
    onStateChange,
    initialMode = "video",
  }: {
    onStateChange?: (data: SuggestionsData | null) => void;
    initialMode?: string;
  }): React.ReactElement {
    const [suggestionsData, setSuggestionsData] =
      useState<SuggestionsData | null>(null);
    const toast = useMemo(
      () =>
        ({
          success: vi.fn(),
          info: vi.fn(),
          warning: vi.fn(),
          error: vi.fn(),
        }) as Toast,
      [],
    );

    const promptOptimizer = useMemo(
      () => createPromptOptimizer(promptText),
      [],
    );

    const { fetchEnhancementSuggestions: triggerFetch } = useSuggestionFetch({
      promptOptimizer,
      selectedMode: initialMode,
      suggestionsData,
      setSuggestionsData,
      stablePromptContext: null,
      toast,
      handleSuggestionClick: async () => {},
    });

    // Notify parent of state changes
    useEffect(() => {
      onStateChange?.(suggestionsData);
    }, [suggestionsData, onStateChange]);

    return (
      <div>
        <button
          data-testid="fetch-park"
          onClick={() =>
            triggerFetch({
              highlightedText: "park",
              displayedPrompt: promptText,
            })
          }
        >
          Fetch Park
        </button>
        <button
          data-testid="fetch-sunny"
          onClick={() =>
            triggerFetch({
              highlightedText: "sunny",
              displayedPrompt: promptText,
            })
          }
        >
          Fetch Sunny
        </button>
        <div data-testid="loading">
          {suggestionsData?.isLoading ? "loading" : "not-loading"}
        </div>
        <div data-testid="error">
          {suggestionsData?.isError ? "error" : "no-error"}
        </div>
        <div data-testid="suggestions">
          {suggestionsData?.suggestions?.length ?? 0}
        </div>
        <div data-testid="has-retry">
          {suggestionsData?.onRetry ? "has-retry" : "no-retry"}
        </div>
      </div>
    );
  }

  beforeEach(() => {
    fetchMock.mockClear();
    fetchMock.mockResolvedValue({
      suggestions: ["suggestion 1", "suggestion 2"],
      isPlaceholder: false,
    });
  });

  it("should update state with suggestions after successful fetch", async () => {
    const { getByTestId } = render(<TestHarness />);

    // Trigger fetch
    fireEvent.click(getByTestId("fetch-park"));

    // Wait for debounce + API response
    await waitFor(
      () => {
        expect(getByTestId("suggestions").textContent).toBe("2");
      },
      { timeout: 1000 },
    );

    expect(getByTestId("loading").textContent).toBe("not-loading");
    expect(getByTestId("error").textContent).toBe("no-error");
  });

  it("should set error state with onRetry callback on API error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network error"));

    const { getByTestId } = render(<TestHarness />);

    // Trigger fetch
    fireEvent.click(getByTestId("fetch-park"));

    // Wait for error state
    await waitFor(
      () => {
        expect(getByTestId("error").textContent).toBe("error");
      },
      { timeout: 1000 },
    );

    expect(getByTestId("loading").textContent).toBe("not-loading");
    expect(getByTestId("has-retry").textContent).toBe("has-retry");
  });

  it("should not update state when request is cancelled (CancellationError)", async () => {
    fetchMock.mockRejectedValueOnce(new CancellationError("Request cancelled"));

    const { getByTestId } = render(<TestHarness />);

    // Trigger fetch
    fireEvent.click(getByTestId("fetch-park"));

    // Wait a bit for any state updates
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Should not show error state for cancellation
    expect(getByTestId("error").textContent).toBe("no-error");
  });

  it("should not fetch when mode is not video", async () => {
    const { getByTestId } = render(<TestHarness initialMode="text" />);

    // Trigger fetch
    fireEvent.click(getByTestId("fetch-park"));

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Should not have called API
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should not fetch for empty highlighted text", async () => {
    function EmptyTextHarness(): React.ReactElement {
      const [suggestionsData, setSuggestionsData] =
        useState<SuggestionsData | null>(null);
      const toast = useMemo(
        () =>
          ({
            success: vi.fn(),
            info: vi.fn(),
            warning: vi.fn(),
            error: vi.fn(),
          }) as Toast,
        [],
      );

      const promptOptimizer = useMemo(
        () => createPromptOptimizer(promptText),
        [],
      );

      const { fetchEnhancementSuggestions: triggerFetch } = useSuggestionFetch({
        promptOptimizer,
        selectedMode: "video",
        suggestionsData,
        setSuggestionsData,
        stablePromptContext: null,
        toast,
        handleSuggestionClick: async () => {},
      });

      return (
        <button
          data-testid="fetch-empty"
          onClick={() =>
            triggerFetch({
              highlightedText: "   ",
              displayedPrompt: promptText,
            })
          }
        >
          Fetch Empty
        </button>
      );
    }

    const { getByTestId } = render(<EmptyTextHarness />);

    // Trigger fetch with empty text
    fireEvent.click(getByTestId("fetch-empty"));

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Should not have called API
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should return cached results without API call on second request", async () => {
    const { getByTestId } = render(<TestHarness />);

    // First fetch
    fireEvent.click(getByTestId("fetch-park"));

    await waitFor(
      () => {
        expect(getByTestId("suggestions").textContent).toBe("2");
      },
      { timeout: 1000 },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Second fetch for same text - should use cache
    fireEvent.click(getByTestId("fetch-park"));

    // Should immediately show results (cache hit)
    await waitFor(() => {
      expect(getByTestId("suggestions").textContent).toBe("2");
    });

    // Should not have made another API call (cache hit)
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
