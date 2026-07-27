/**
 * Regression: the edit history recorded by the apply path must be visible to
 * the fetch path.
 *
 * Both paths used to call a `useEditHistory` hook backed by a plain
 * `useReducer`, so each call site got its own private list. Nothing the apply
 * path recorded ever reached the fetch path, and the `editHistory` field on
 * every enhancement request was permanently `[]`.
 *
 * The hooks are rendered independently here on purpose — that separation is
 * exactly what broke the invariant.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { fetchEnhancementSuggestions } from "@features/prompt-optimizer/api/enhancementSuggestionsApi";
import { clearSpanEditHistory } from "@features/prompt-optimizer/hooks/useEditHistory";
import { buildSuggestionContext } from "@features/prompt-optimizer/utils/enhancementSuggestionContext";
import type { SuggestionsData } from "@features/prompt-optimizer/PromptCanvas/types";
import type { Toast } from "@hooks/types";
import { useSuggestionApply } from "../useSuggestionApply";
import { useSuggestionApi } from "../useSuggestionApi";

vi.mock("@features/prompt-optimizer/api/enhancementSuggestionsApi", () => ({
  fetchEnhancementSuggestions: vi.fn(),
}));

const PROMPT = "a wide shot of a lighthouse at dusk";
const SELECTED = "wide shot";
const REPLACEMENT = "slow push-in";

const buildSuggestionsData = (): SuggestionsData => ({
  show: true,
  selectedText: SELECTED,
  originalText: SELECTED,
  suggestions: [],
  isLoading: false,
  isPlaceholder: false,
  fullPrompt: PROMPT,
  offsets: {
    start: PROMPT.indexOf(SELECTED),
    end: PROMPT.indexOf(SELECTED) + SELECTED.length,
  },
  metadata: { category: "camera" },
  allLabeledSpans: [],
});

const toast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
} as unknown as Toast;

const renderApplyHook = () =>
  renderHook(() =>
    useSuggestionApply({
      suggestionsData: buildSuggestionsData(),
      handleDisplayedPromptChange: vi.fn(),
      setSuggestionsData: vi.fn(),
      applyInitialHighlightSnapshot: vi.fn(),
      latestHighlightRef: { current: null },
      toast,
      currentPromptUuid: null,
      currentPromptDocId: null,
      promptHistory: { updateEntryOutput: vi.fn() },
    }),
  );

const renderApiHook = () =>
  renderHook(() =>
    useSuggestionApi({
      promptOptimizer: { inputPrompt: PROMPT },
      stablePromptContext: null,
    }),
  );

describe("suggestion edit history (regression)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSpanEditHistory();
    vi.mocked(fetchEnhancementSuggestions).mockResolvedValue({
      suggestions: [],
      isPlaceholder: false,
    });
  });

  it("sends an edit recorded by the apply path on the next fetch", async () => {
    const apply = renderApplyHook();
    await act(async () => {
      await apply.result.current.handleSuggestionClick(REPLACEMENT);
    });

    const api = renderApiHook();
    await act(async () => {
      await api.result.current.fetchSuggestions({
        dedupKey: "dedup-key",
        normalizedHighlight: "lighthouse",
        normalizedPrompt: PROMPT,
        suggestionContext: buildSuggestionContext(PROMPT, "lighthouse", null),
        metadata: null,
        allLabeledSpans: [],
      });
    });

    expect(fetchEnhancementSuggestions).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(fetchEnhancementSuggestions).mock.calls[0]?.[0];
    expect(payload?.editHistory).toEqual([
      expect.objectContaining({
        original: SELECTED,
        replacement: REPLACEMENT,
        category: "camera",
      }),
    ]);
  });

  it("sends an empty edit history when nothing has been applied", async () => {
    const api = renderApiHook();
    await act(async () => {
      await api.result.current.fetchSuggestions({
        dedupKey: "dedup-key",
        normalizedHighlight: "lighthouse",
        normalizedPrompt: PROMPT,
        suggestionContext: buildSuggestionContext(PROMPT, "lighthouse", null),
        metadata: null,
        allLabeledSpans: [],
      });
    });

    const payload = vi.mocked(fetchEnhancementSuggestions).mock.calls[0]?.[0];
    expect(payload?.editHistory).toEqual([]);
  });
});
