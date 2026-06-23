/**
 * Custom Suggestions API
 *
 * Centralized API calls for fetching custom suggestions.
 * Uses Zod schemas for runtime validation at API boundaries.
 *
 * Features:
 * - Request cancellation via AbortSignal
 * - 3-second timeout for suggestions requests
 * - Distinguishes timeout vs user cancellation in error handling
 */

import { API_ENDPOINTS } from "@components/SuggestionsPanel/config/panelConfig";
import { CustomSuggestionsResponseSchema } from "./customSuggestionsSchema";
import { createTimeoutScope } from "@features/prompt-optimizer/utils/signalUtils";
import { buildFirebaseAuthHeaders } from "@/services/http/firebaseAuth";
import type { SuggestionItem } from "@components/SuggestionsPanel/hooks/types";

/** Timeout for custom suggestion requests in milliseconds */
const CUSTOM_SUGGESTION_TIMEOUT_MS = 3000;

interface FetchCustomSuggestionsParams {
  highlightedText: string;
  customRequest: string;
  fullPrompt: string;
  contextBefore?: string;
  contextAfter?: string;
  metadata?: Record<string, unknown> | null;
  /** Optional AbortSignal for external cancellation */
  signal?: AbortSignal;
}

/**
 * Fetch custom suggestions from the backend
 *
 * @param params - Parameters including highlighted text, custom request, and optional abort signal
 * @returns Promise resolving to array of suggestion strings
 * @throws CancellationError if request is cancelled by user
 * @throws Error if request times out or network error occurs
 */
export async function fetchCustomSuggestions({
  highlightedText,
  customRequest,
  fullPrompt,
  contextBefore,
  contextAfter,
  metadata,
  signal: externalSignal,
}: FetchCustomSuggestionsParams): Promise<SuggestionItem[]> {
  const fetchFn = typeof fetch !== "undefined" ? fetch : null;

  if (!fetchFn) {
    throw new Error("Fetch API unavailable");
  }

  const timeout = createTimeoutScope(
    externalSignal,
    CUSTOM_SUGGESTION_TIMEOUT_MS,
  );

  try {
    const authHeaders = await buildFirebaseAuthHeaders();
    const response = await fetchFn(API_ENDPOINTS.CUSTOM_SUGGESTIONS, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({
        highlightedText,
        customRequest,
        fullPrompt: fullPrompt || "",
        contextBefore,
        contextAfter,
        metadata: metadata ?? undefined,
      }),
      signal: timeout.signal,
    });

    timeout.clear();

    if (!response.ok) {
      throw new Error(
        `Failed to fetch custom suggestions: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as unknown;
    const parsed = CustomSuggestionsResponseSchema.parse(data);

    return parsed.suggestions
      .map((item) => (typeof item === "string" ? { text: item } : item))
      .filter(
        (item) => typeof item.text === "string" && item.text.trim().length > 0,
      );
  } catch (error: unknown) {
    timeout.clear();
    timeout.throwOnAbort(error);
    // Re-throw non-abort errors as-is
    throw error;
  }
}

/**
 * Custom Suggestions API object (for namespace compatibility)
 */
export const customSuggestionsApi = {
  fetchCustomSuggestions,
};
