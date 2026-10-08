/**
 * Enhancement Suggestions Hook (Orchestrator)
 *
 * Main hook for managing enhancement suggestions.
 * Orchestrates suggestion fetching and application.
 *
 * Architecture: Orchestrator pattern
 * Pattern: Delegates to specialized hooks
 *
 * REFACTORED: Reduced from 289 lines to ~35 lines
 * - Validation logic → utils/spanValidation.js
 * - Span processing → utils/spanUtils.js
 * - Apply logic → hooks/useSuggestionApply.js
 * - Fetch logic → hooks/useSuggestionFetch.js
 */

import { useSuggestionApply } from "./useSuggestionApply";
import { useSuggestionFetch } from "./useSuggestionFetch";
import type React from "react";
import type { Toast } from "@hooks/types";
import type { PromptContext } from "@utils/PromptContext/PromptContext";
import type {
  HighlightSnapshot,
  SuggestionItem,
  SuggestionsData,
} from "@features/prompt-optimizer/PromptCanvas/types";
import type { PromptOptimizer } from "@features/prompt-optimizer/context/types";

export interface UseEnhancementSuggestionsParams {
  promptOptimizer: PromptOptimizer;
  selectedMode: string;
  suggestionsData: SuggestionsData | null;
  setSuggestionsData: React.Dispatch<
    React.SetStateAction<SuggestionsData | null>
  >;
  handleDisplayedPromptChange: (prompt: string) => void;
  stablePromptContext: PromptContext | null;
  toast: Toast;
  applyInitialHighlightSnapshot: (
    snapshot: HighlightSnapshot | null,
    options: { bumpVersion: boolean; markPersisted: boolean },
  ) => void;
  latestHighlightRef: React.MutableRefObject<HighlightSnapshot | null>;
  currentPromptUuid: string | null;
  currentPromptDocId: string | null;
  promptHistory: {
    updateEntryOutput: (
      uuid: string,
      docId: string | null,
      output: string,
    ) => void;
  };
}

export interface UseEnhancementSuggestionsReturn {
  fetchEnhancementSuggestions: () => Promise<void>;
  handleSuggestionClick: (suggestion: SuggestionItem | string) => Promise<void>;
}

/**
 * Custom hook for enhancement suggestions
 * Handles fetching and applying suggestions for highlighted text
 */
export function useEnhancementSuggestions({
  promptOptimizer,
  selectedMode,
  suggestionsData,
  setSuggestionsData,
  handleDisplayedPromptChange,
  stablePromptContext,
  toast,
  applyInitialHighlightSnapshot,
  latestHighlightRef,
  currentPromptUuid,
  currentPromptDocId,
  promptHistory,
}: UseEnhancementSuggestionsParams): UseEnhancementSuggestionsReturn {
  // Handle applying suggestions
  const { handleSuggestionClick } = useSuggestionApply({
    suggestionsData,
    handleDisplayedPromptChange,
    setSuggestionsData,
    applyInitialHighlightSnapshot,
    latestHighlightRef,
    toast,
    currentPromptUuid,
    currentPromptDocId,
    promptHistory,
  });

  // Handle fetching suggestions
  const { fetchEnhancementSuggestions } = useSuggestionFetch({
    promptOptimizer,
    selectedMode,
    suggestionsData,
    setSuggestionsData,
    stablePromptContext,
    toast,
    handleSuggestionClick, // Pass down from apply hook
  });

  return {
    fetchEnhancementSuggestions,
    handleSuggestionClick,
  };
}
