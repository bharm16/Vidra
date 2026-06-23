/**
 * Enhancement Suggestions API
 *
 * Centralized API calls for fetching enhancement suggestions.
 * Context location/extraction is handled upstream so this stays transport-only.
 *
 * Features:
 * - Request cancellation via AbortSignal
 * - Timeout for suggestions requests
 * - Distinguishes timeout vs user cancellation in error handling
 */

import {
  postEnhancementSuggestions,
  type EnhancementSuggestionsResponse,
} from "@/api/enhancementSuggestionsApi";
import { createTimeoutScope } from "../utils/signalUtils";

/** Timeout for suggestion requests in milliseconds */
const SUGGESTION_TIMEOUT_MS = 8000;

interface FetchEnhancementSuggestionsParams {
  highlightedText: string;
  contextBefore: string;
  contextAfter: string;
  fullPrompt: string;
  inputPrompt: string;
  brainstormContext?: unknown | null;
  metadata?: {
    startIndex?: number;
    category?: string;
    confidence?: number;
    quote?: string;
  } | null;
  allLabeledSpans?: unknown[];
  nearbySpans?: unknown[];
  editHistory?: unknown[];
  /** Optional AbortSignal for external cancellation (e.g., user selects new text) */
  signal?: AbortSignal;
}

/**
 * Fetch enhancement suggestions for highlighted text
 *
 * @param params - Parameters including highlighted text, prompt context, and optional abort signal
 * @returns Promise resolving to suggestions response
 * @throws CancellationError if request is cancelled by user (new selection)
 * @throws Error if request times out or network error occurs
 */
export async function fetchEnhancementSuggestions({
  highlightedText,
  contextBefore,
  contextAfter,
  fullPrompt,
  inputPrompt,
  brainstormContext = null,
  metadata = null,
  allLabeledSpans = [],
  nearbySpans = [],
  editHistory = [],
  signal: externalSignal,
}: FetchEnhancementSuggestionsParams): Promise<EnhancementSuggestionsResponse> {
  const timeout = createTimeoutScope(externalSignal, SUGGESTION_TIMEOUT_MS);

  try {
    // MAKE API CALL with cancellation support
    const data = await postEnhancementSuggestions(
      {
        highlightedText, // The text we want to change
        contextBefore, // The text leading up to it (CRITICAL for LLM)
        contextAfter, // The text following it
        fullPrompt,
        originalUserPrompt: inputPrompt,
        brainstormContext:
          brainstormContext &&
          typeof brainstormContext === "object" &&
          "toJSON" in brainstormContext &&
          typeof (brainstormContext as { toJSON?: () => unknown }).toJSON ===
            "function"
            ? (brainstormContext as { toJSON: () => unknown }).toJSON()
            : brainstormContext,
        highlightedCategory: metadata?.category || null,
        highlightedCategoryConfidence: metadata?.confidence || null,
        highlightedPhrase: metadata?.quote || highlightedText,
        allLabeledSpans,
        nearbySpans,
        editHistory,
      },
      { signal: timeout.signal },
    );

    timeout.clear();

    return {
      suggestions: data.suggestions || [],
      isPlaceholder: data.isPlaceholder || false,
      ...(data.metadata ? { metadata: data.metadata } : {}),
      ...(data._debug ? { _debug: data._debug } : {}),
    };
  } catch (error: unknown) {
    timeout.clear();
    timeout.throwOnAbort(error);
    // Re-throw non-abort errors as-is
    throw error;
  }
}

export const enhancementSuggestionsApi = {
  fetchEnhancementSuggestions,
};
