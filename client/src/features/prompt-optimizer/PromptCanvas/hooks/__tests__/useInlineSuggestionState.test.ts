import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HighlightSpan } from "@features/span-highlighting/hooks/useHighlightRendering";
import type {
  SuggestionItem,
  SuggestionsData,
} from "@features/prompt-optimizer/PromptCanvas/types";

const {
  mockHandleCustomRequest,
  mockSetCustomRequest,
  mockHandleSuggestionClickWithFeedback,
  mockCustomRequestState,
} = vi.hoisted(() => ({
  mockHandleCustomRequest: vi.fn(),
  mockSetCustomRequest: vi.fn(),
  mockHandleSuggestionClickWithFeedback: vi.fn(),
  mockCustomRequestState: { value: "Please adjust pacing", loading: false },
}));

vi.mock("@components/SuggestionsPanel/hooks/useCustomRequest", () => ({
  useCustomRequest: () => ({
    customRequest: mockCustomRequestState.value,
    setCustomRequest: mockSetCustomRequest,
    handleCustomRequest: mockHandleCustomRequest,
    isCustomLoading: mockCustomRequestState.loading,
  }),
}));

vi.mock("../useSuggestionFeedback", () => ({
  useSuggestionFeedback: () => ({
    handleSuggestionClickWithFeedback: mockHandleSuggestionClickWithFeedback,
  }),
}));

import { useInlineSuggestionState } from "../useInlineSuggestionState";

const spans: HighlightSpan[] = [
  {
    id: "span-1",
    start: 0,
    end: 5,
    text: "alpha",
    quote: "alpha",
    category: "scene",
    confidence: 0.9,
  } as HighlightSpan,
  {
    id: "span-2",
    start: 6,
    end: 10,
    text: "beta",
    quote: "beta",
    category: "style",
    confidence: 0.8,
  } as HighlightSpan,
];

const baseSuggestions = (suggestions: SuggestionItem[]): SuggestionsData => ({
  show: true,
  selectedText: "alpha",
  originalText: "alpha",
  suggestions,
  isLoading: false,
  isError: false,
  errorMessage: null,
  isPlaceholder: false,
  fullPrompt: "alpha beta gamma",
  setSuggestions: vi.fn(),
  onSuggestionClick: vi.fn(),
  onClose: vi.fn(),
});

describe("useInlineSuggestionState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCustomRequestState.value = "Please adjust pacing";
    mockCustomRequestState.loading = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("wraps keyboard navigation and applies active suggestion on Enter", () => {
    const setSelectedSpanId = vi.fn();
    const onClose = vi.fn();
    const suggestionsData = baseSuggestions([
      { text: "First suggestion" },
      { text: "Second suggestion" },
    ]);
    suggestionsData.onClose = onClose;

    const { result } = renderHook(() =>
      useInlineSuggestionState({
        suggestionsData,
        selectedSpanId: "span-1",
        setSelectedSpanId,
        parseResultSpans: spans,
        normalizedDisplayedPrompt: "alpha beta gamma",
        setState: vi.fn(),
      }),
    );

    expect(result.current.activeSuggestionIndex).toBe(0);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    });
    expect(result.current.activeSuggestionIndex).toBe(1);

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown" }),
      );
    });
    expect(result.current.activeSuggestionIndex).toBe(0);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    });

    expect(mockHandleSuggestionClickWithFeedback).toHaveBeenCalledWith(
      suggestionsData.suggestions[0],
    );
    expect(setSelectedSpanId).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalled();
  });

  it("closes the inline popover on Escape", () => {
    const setSelectedSpanId = vi.fn();
    const onClose = vi.fn();
    const suggestionsData = baseSuggestions([{ text: "Only option" }]);
    suggestionsData.onClose = onClose;

    renderHook(() =>
      useInlineSuggestionState({
        suggestionsData,
        selectedSpanId: "span-1",
        setSelectedSpanId,
        parseResultSpans: spans,
        normalizedDisplayedPrompt: "alpha beta gamma",
        setState: vi.fn(),
      }),
    );

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(setSelectedSpanId).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalled();
  });

  it("resets active index when selected span changes and when suggestion count changes", () => {
    const setSelectedSpanId = vi.fn();
    const initialSuggestions = baseSuggestions([
      { text: "First" },
      { text: "Second" },
    ]);

    const { result, rerender } = renderHook(
      ({ selectedSpanId, suggestionsData }) =>
        useInlineSuggestionState({
          suggestionsData,
          selectedSpanId,
          setSelectedSpanId,
          parseResultSpans: spans,
          normalizedDisplayedPrompt: "alpha beta gamma",
          setState: vi.fn(),
        }),
      {
        initialProps: {
          selectedSpanId: "span-1",
          suggestionsData: initialSuggestions,
        },
      },
    );

    act(() => {
      result.current.setActiveSuggestionIndex(1);
    });
    expect(result.current.activeSuggestionIndex).toBe(1);

    rerender({
      selectedSpanId: "span-2",
      suggestionsData: initialSuggestions,
    });
    expect(result.current.activeSuggestionIndex).toBe(0);

    act(() => {
      result.current.setActiveSuggestionIndex(1);
    });
    expect(result.current.activeSuggestionIndex).toBe(1);

    rerender({
      selectedSpanId: "span-2",
      suggestionsData: baseSuggestions([
        { text: "First" },
        { text: "Second" },
        { text: "Third" },
      ]),
    });
    expect(result.current.activeSuggestionIndex).toBe(0);
  });

  it("derives loading, error, and empty states correctly", () => {
    const setSelectedSpanId = vi.fn();

    const { result, rerender } = renderHook(
      ({ suggestionsData }) =>
        useInlineSuggestionState({
          suggestionsData,
          selectedSpanId: "span-1",
          setSelectedSpanId,
          parseResultSpans: spans,
          normalizedDisplayedPrompt: "alpha beta gamma",
          setState: vi.fn(),
        }),
      {
        initialProps: { suggestionsData: null as SuggestionsData | null },
      },
    );

    expect(result.current.isInlineLoading).toBe(true);

    rerender({
      suggestionsData: {
        ...baseSuggestions([]),
        isError: true,
        errorMessage: "Failed to load",
      },
    });
    expect(result.current.isInlineError).toBe(true);
    expect(result.current.inlineErrorMessage).toBe("Failed to load");

    rerender({
      suggestionsData: baseSuggestions([]),
    });
    expect(result.current.isInlineLoading).toBe(false);
    expect(result.current.isInlineError).toBe(false);
    expect(result.current.isInlineEmpty).toBe(true);
  });

  it("derives custom-request disabled state from request content and loading", () => {
    const setSelectedSpanId = vi.fn();
    const suggestionsData = baseSuggestions([{ text: "First" }]);

    const { result, rerender } = renderHook(() =>
      useInlineSuggestionState({
        suggestionsData,
        selectedSpanId: "span-1",
        setSelectedSpanId,
        parseResultSpans: spans,
        normalizedDisplayedPrompt: "alpha beta gamma",
        setState: vi.fn(),
      }),
    );

    expect(result.current.isCustomRequestDisabled).toBe(false);

    mockCustomRequestState.value = "   ";
    rerender();
    expect(result.current.isCustomRequestDisabled).toBe(true);

    mockCustomRequestState.value = "Refine this";
    mockCustomRequestState.loading = true;
    rerender();
    expect(result.current.isCustomRequestDisabled).toBe(true);
  });

  it("flags the selection as motion only when the selected span is camera/action", () => {
    const motionSpans: HighlightSpan[] = [
      {
        id: "cam-1",
        start: 0,
        end: 4,
        text: "pans",
        quote: "pans",
        category: "camera.movement",
        confidence: 0.9,
      } as HighlightSpan,
      {
        id: "sty-1",
        start: 5,
        end: 9,
        text: "warm",
        quote: "warm",
        category: "style",
        confidence: 0.9,
      } as HighlightSpan,
    ];

    const { result, rerender } = renderHook(
      ({ selectedSpanId }: { selectedSpanId: string | null }) =>
        useInlineSuggestionState({
          suggestionsData: baseSuggestions([{ text: "tracks" }]),
          selectedSpanId,
          setSelectedSpanId: vi.fn(),
          parseResultSpans: motionSpans,
          normalizedDisplayedPrompt: "pans warm",
          setState: vi.fn(),
        }),
      { initialProps: { selectedSpanId: "cam-1" as string | null } },
    );

    expect(result.current.isMotionSelection).toBe(true);

    rerender({ selectedSpanId: "sty-1" });
    expect(result.current.isMotionSelection).toBe(false);

    rerender({ selectedSpanId: null });
    expect(result.current.isMotionSelection).toBe(false);
  });
});
