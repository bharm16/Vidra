import {
  describe,
  expect,
  it,
  beforeEach,
  vi,
  type MockedFunction,
} from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useSuggestionApply } from "@features/prompt-optimizer/PromptOptimizerContainer/hooks/useSuggestionApply";
import { applySuggestionToPrompt } from "@features/prompt-optimizer/utils/applySuggestion";
import { updateHighlightSnapshotForSuggestion } from "@features/prompt-optimizer/utils/updateHighlightSnapshot";
import {
  clearSpanEditHistory,
  getRecentSpanEdits,
} from "@features/prompt-optimizer/hooks/useEditHistory";
import type {
  HighlightSnapshot,
  SuggestionItem,
  SuggestionsData,
} from "@features/prompt-optimizer/PromptCanvas/types";
import type { Toast } from "@hooks/types";

const { logSpies } = vi.hoisted(() => ({
  logSpies: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@features/prompt-optimizer/utils/applySuggestion", () => ({
  applySuggestionToPrompt: vi.fn(),
}));

vi.mock("@features/prompt-optimizer/utils/updateHighlightSnapshot", () => ({
  updateHighlightSnapshotForSuggestion: vi.fn(),
}));

vi.mock("@/services/LoggingService", () => ({
  logger: {
    child: () => logSpies,
  },
}));

const mockApplySuggestionToPrompt = vi.mocked(applySuggestionToPrompt);
const mockUpdateHighlightSnapshot = vi.mocked(
  updateHighlightSnapshotForSuggestion,
);

const createToast = (): Toast => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
});

const createSuggestionsData = (): SuggestionsData => ({
  show: true,
  selectedText: "world",
  originalText: "world",
  suggestions: [],
  isLoading: false,
  isPlaceholder: false,
  fullPrompt: "Hello world",
  offsets: { start: 6, end: 11 },
  metadata: {
    category: "style",
    spanId: "span-1",
    start: 6,
    end: 11,
    span: {
      id: "span-1",
      start: 6,
      end: 11,
      category: "style",
      confidence: 0.9,
    },
  },
});

describe("useSuggestionApply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSpanEditHistory();
  });

  it("returns early when there is no suggestion data", async () => {
    const setSuggestionsData: MockedFunction<
      (data: SuggestionsData | null) => void
    > = vi.fn();
    const handleDisplayedPromptChange: MockedFunction<
      (prompt: string) => void
    > = vi.fn();
    const applyInitialHighlightSnapshot: MockedFunction<
      (
        snapshot: HighlightSnapshot | null,
        options: { bumpVersion: boolean; markPersisted: boolean },
      ) => void
    > = vi.fn();

    const { result } = renderHook(() =>
      useSuggestionApply({
        suggestionsData: null,
        handleDisplayedPromptChange,
        setSuggestionsData,
        applyInitialHighlightSnapshot,
        latestHighlightRef: { current: null },
        toast: createToast(),
        currentPromptUuid: null,
        currentPromptDocId: null,
        promptHistory: { updateEntryOutput: vi.fn() },
      }),
    );

    await act(async () => {
      await result.current.handleSuggestionClick("Try this");
    });

    expect(mockApplySuggestionToPrompt).not.toHaveBeenCalled();
    expect(setSuggestionsData).not.toHaveBeenCalled();
  });

  it("applies a suggestion, updates highlights, and persists output", async () => {
    const setSuggestionsData: MockedFunction<
      (data: SuggestionsData | null) => void
    > = vi.fn();
    const handleDisplayedPromptChange: MockedFunction<
      (prompt: string) => void
    > = vi.fn();
    const applyInitialHighlightSnapshot: MockedFunction<
      (
        snapshot: HighlightSnapshot | null,
        options: { bumpVersion: boolean; markPersisted: boolean },
      ) => void
    > = vi.fn();
    const updateEntryOutput: MockedFunction<
      (uuid: string, docId: string | null, output: string) => void
    > = vi.fn();

    const updatedSnapshot: HighlightSnapshot = {
      spans: [{ start: 6, end: 11, category: "style", confidence: 0.9 }],
      signature: "sig-1",
    };

    mockApplySuggestionToPrompt.mockResolvedValue({
      updatedPrompt: "Hello there",
      matchStart: 6,
      matchEnd: 11,
    });
    mockUpdateHighlightSnapshot.mockReturnValue(updatedSnapshot);

    const suggestionsData = createSuggestionsData();

    const { result } = renderHook(() =>
      useSuggestionApply({
        suggestionsData,
        handleDisplayedPromptChange,
        setSuggestionsData,
        applyInitialHighlightSnapshot,
        latestHighlightRef: { current: updatedSnapshot },
        toast: createToast(),
        currentPromptUuid: "uuid-1",
        currentPromptDocId: "doc-1",
        promptHistory: { updateEntryOutput },
      }),
    );

    const suggestion: SuggestionItem = { text: "there", category: "style" };

    await act(async () => {
      await result.current.handleSuggestionClick(suggestion);
    });

    expect(mockApplySuggestionToPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Hello world",
        suggestionText: "there",
        highlight: "world",
      }),
    );

    expect(mockUpdateHighlightSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: updatedSnapshot,
        matchStart: 6,
        matchEnd: 11,
        replacementText: "there",
        nextPrompt: "Hello there",
        targetSpanId: "span-1",
      }),
    );

    expect(applyInitialHighlightSnapshot).toHaveBeenCalledWith(
      updatedSnapshot,
      {
        bumpVersion: true,
        markPersisted: false,
      },
    );
    expect(handleDisplayedPromptChange).toHaveBeenCalledWith("Hello there");
    expect(updateEntryOutput).toHaveBeenCalledWith(
      "uuid-1",
      "doc-1",
      "Hello there",
    );
    expect(getRecentSpanEdits()).toEqual([
      expect.objectContaining({
        original: "world",
        replacement: "there",
        category: "style",
      }),
    ]);
    expect(setSuggestionsData).toHaveBeenCalledWith(null);
  });

  it("reports failures when suggestion application throws", async () => {
    const setSuggestionsData: MockedFunction<
      (data: SuggestionsData | null) => void
    > = vi.fn();
    const handleDisplayedPromptChange: MockedFunction<
      (prompt: string) => void
    > = vi.fn();
    const applyInitialHighlightSnapshot: MockedFunction<
      (
        snapshot: HighlightSnapshot | null,
        options: { bumpVersion: boolean; markPersisted: boolean },
      ) => void
    > = vi.fn();
    const toast = createToast();

    mockApplySuggestionToPrompt.mockRejectedValue(new Error("Boom"));

    const { result } = renderHook(() =>
      useSuggestionApply({
        suggestionsData: createSuggestionsData(),
        handleDisplayedPromptChange,
        setSuggestionsData,
        applyInitialHighlightSnapshot,
        latestHighlightRef: { current: null },
        toast,
        currentPromptUuid: null,
        currentPromptDocId: null,
        promptHistory: { updateEntryOutput: vi.fn() },
      }),
    );

    await act(async () => {
      await result.current.handleSuggestionClick("try");
    });

    expect(toast.error).toHaveBeenCalledWith("Failed to apply suggestion");
    expect(setSuggestionsData).not.toHaveBeenCalled();
    expect(getRecentSpanEdits()).toEqual([]);
    expect(logSpies.error).toHaveBeenCalled();
  });

  it("notifies when no replacement text is found", async () => {
    const setSuggestionsData: MockedFunction<
      (data: SuggestionsData | null) => void
    > = vi.fn();
    const handleDisplayedPromptChange: MockedFunction<
      (prompt: string) => void
    > = vi.fn();
    const applyInitialHighlightSnapshot: MockedFunction<
      (
        snapshot: HighlightSnapshot | null,
        options: { bumpVersion: boolean; markPersisted: boolean },
      ) => void
    > = vi.fn();
    const toast = createToast();

    mockApplySuggestionToPrompt.mockResolvedValue({ updatedPrompt: null });

    const { result } = renderHook(() =>
      useSuggestionApply({
        suggestionsData: createSuggestionsData(),
        handleDisplayedPromptChange,
        setSuggestionsData,
        applyInitialHighlightSnapshot,
        latestHighlightRef: { current: null },
        toast,
        currentPromptUuid: "uuid-1",
        currentPromptDocId: "doc-1",
        promptHistory: { updateEntryOutput: vi.fn() },
      }),
    );

    await act(async () => {
      await result.current.handleSuggestionClick("try");
    });

    expect(toast.error).toHaveBeenCalledWith(
      "Could not locate text to replace",
    );
    expect(setSuggestionsData).toHaveBeenCalledWith(null);
    expect(getRecentSpanEdits()).toEqual([]);
  });
});
