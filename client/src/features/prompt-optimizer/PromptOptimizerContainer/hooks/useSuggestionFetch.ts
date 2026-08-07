/**
 * Suggestion Fetch Hook
 *
 * Handles fetching enhancement suggestions for highlighted text.
 * Extracted from useEnhancementSuggestions.js.
 *
 * Features:
 * - Request cancellation (abort in-flight requests on new selection)
 * - Deduplication (prevent duplicate requests for same text)
 * - Trailing-edge debouncing (wait for user to stop selecting)
 * - TTL-based caching (instant results for repeated selections)
 * - Proper error handling with retry capability
 *
 * Architecture: Custom React hook
 * Pattern: Single responsibility - suggestion fetching
 */

import { useCallback } from "react";
import type React from "react";
import type { PromptContext } from "@utils/PromptContext/PromptContext";
import type { PromptOptimizer } from "@features/prompt-optimizer/context/types";
import type {
  SuggestionItem,
  SuggestionsData,
} from "@features/prompt-optimizer/PromptCanvas/types";
import { buildSuggestionContext } from "@features/prompt-optimizer/utils/enhancementSuggestionContext";
import { CancellationError } from "@features/prompt-optimizer/utils/signalUtils";
import {
  prepareSpanContext,
  buildSpanFingerprint,
} from "@features/span-highlighting/utils/spanProcessing";
import type { HighlightSpan } from "@features/span-highlighting";
import type { Toast } from "@hooks/types";
import { logger } from "@/services/LoggingService";
import { sanitizeError } from "@/utils/logging";
import { useSuggestionApi } from "./useSuggestionApi";
import { useSuggestionCache } from "./useSuggestionCache";
import { mergeSuggestions } from "../utils/mergeSuggestions";

interface FetchPayload {
  highlightedText?: string;
  originalText?: string;
  displayedPrompt?: string;
  range?: Range | null;
  offsets?: { start?: number; end?: number } | null;
  metadata?: SuggestionsData["metadata"];
  trigger?: string;
  allLabeledSpans?: unknown[];
}

type SetSuggestionsData = React.Dispatch<
  React.SetStateAction<SuggestionsData | null>
>;

interface UseSuggestionFetchParams {
  promptOptimizer: PromptOptimizer;
  selectedMode: string;
  suggestionsData: SuggestionsData | null;
  setSuggestionsData: SetSuggestionsData;
  stablePromptContext: PromptContext | null;
  toast: Toast;
  handleSuggestionClick: (suggestion: SuggestionItem | string) => Promise<void>;
}

const log = logger.child("useSuggestionFetch");
export { mergeSuggestions } from "../utils/mergeSuggestions";

function buildResponseMetadata(response: {
  metadata?: Record<string, unknown> | null;
  _debug?: Record<string, unknown> | null;
}): Record<string, unknown> | null {
  const merged = {
    ...(response.metadata ?? {}),
    ...(response._debug ? { _debug: response._debug } : {}),
  };

  return Object.keys(merged).length > 0 ? merged : null;
}

/**
 * Hook for fetching enhancement suggestions
 *
 * Features:
 * - Request cancellation on new selection
 * - Deduplication of in-flight requests
 * - Trailing-edge debouncing (150ms)
 * - TTL-based caching (5 minutes)
 * - Proper error handling with retry
 */
export function useSuggestionFetch({
  promptOptimizer,
  selectedMode,
  setSuggestionsData,
  stablePromptContext,
  toast,
  handleSuggestionClick,
}: UseSuggestionFetchParams): {
  fetchEnhancementSuggestions: (payload?: FetchPayload) => Promise<void>;
} {
  const displayedPrompt = promptOptimizer.displayedPrompt;
  const { buildCacheKey, getCachedSuggestions, setCachedSuggestions } =
    useSuggestionCache();
  const { fetchSuggestions, cancelCurrentRequest, isRequestInFlight } =
    useSuggestionApi({
      promptOptimizer,
      stablePromptContext,
    });

  const updateSuggestions = useCallback(
    (newSuggestions: SuggestionItem[]): void => {
      setSuggestionsData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          suggestions: mergeSuggestions(prev.suggestions || [], newSuggestions),
          isPlaceholder: false,
          isError: false,
          errorMessage: null,
        };
      });
    },
    [setSuggestionsData],
  );

  /**
   * Fetch enhancement suggestions for highlighted text
   *
   * Flow:
   * 1. Validate input and check mode
   * 2. Check deduplication (skip if same text in-flight)
   * 3. Cancel any previous request
   * 4. Check cache (return immediately if hit)
   * 5. Schedule debounced request
   * 6. Show loading state after debounce fires
   * 7. Fetch from API with cancellation support
   * 8. Cache results and update state
   */
  const fetchEnhancementSuggestions = useCallback(
    async (payload: FetchPayload = {}): Promise<void> => {
      const {
        highlightedText,
        originalText,
        displayedPrompt: payloadPrompt,
        range,
        offsets,
        metadata: rawMetadata = null,
        allLabeledSpans = [],
      } = payload;

      const trimmedHighlight = (highlightedText || "").trim();
      const normalizedHighlight = trimmedHighlight.normalize("NFC");
      const rawPrompt = payloadPrompt ?? displayedPrompt ?? "";
      const normalizedPrompt = rawPrompt.normalize("NFC");
      const metadata: SuggestionsData["metadata"] = rawMetadata
        ? ({
            ...rawMetadata,
            ...(rawMetadata.span ? { span: { ...rawMetadata.span } } : {}),
          } as SuggestionsData["metadata"])
        : null;
      const normalizedLabeledSpans: HighlightSpan[] = Array.isArray(
        allLabeledSpans,
      )
        ? (allLabeledSpans as HighlightSpan[])
        : [];

      // Early returns for invalid cases
      if (selectedMode !== "video" || !trimmedHighlight) {
        return;
      }

      const preferIndexRaw =
        metadata?.span?.start ?? metadata?.start ?? offsets?.start ?? null;
      const preferIndex =
        typeof preferIndexRaw === "number" && Number.isFinite(preferIndexRaw)
          ? preferIndexRaw
          : null;

      const suggestionContext = buildSuggestionContext(
        normalizedPrompt,
        normalizedHighlight,
        preferIndex,
        1000,
      );

      const spanContext = prepareSpanContext(metadata, allLabeledSpans);
      // Use client-computed fingerprint as a fallback. The server returns an
      // authoritative spanFingerprint in its response which is stored in the
      // cache; subsequent hits will use that instead.
      const spanFingerprint = buildSpanFingerprint(
        spanContext.simplifiedSpans,
        spanContext.nearbySpans,
      );

      if (!suggestionContext.found) {
        log.warn(
          "Could not locate highlight in prompt; context may be inaccurate",
          {
            operation: "buildSuggestionContext",
            highlightLength: normalizedHighlight.length,
            promptLength: normalizedPrompt.length,
            preferIndex,
          },
        );
      }

      // Check cache BEFORE showing loading state - Requirement 6.3
      const cacheKey = buildCacheKey({
        normalizedHighlight,
        normalizedPrompt,
        suggestionContext,
        category: metadata?.category ?? null,
        spanFingerprint,
      });

      // DEDUPLICATION: Use cache key to avoid duplicate in-flight requests
      const dedupKey = cacheKey;

      // Check if same request is already in-flight (prevents duplicate requests)
      if (isRequestInFlight(dedupKey)) {
        return; // Skip duplicate - Requirement 2.1
      }

      // Cancel any previous request (different text) - Requirement 1.1
      cancelCurrentRequest();

      const cached = getCachedSuggestions(cacheKey);
      if (cached) {
        // Cache hit - return immediately without API call
        setSuggestionsData(() => ({
          show: true,
          selectedText: trimmedHighlight,
          originalText: originalText || trimmedHighlight,
          suggestions: cached.suggestions ?? [],
          isLoading: false,
          isError: false,
          errorMessage: null,
          isPlaceholder: cached.isPlaceholder,
          fullPrompt: normalizedPrompt,
          range: range ?? null,
          offsets: offsets ?? null,
          metadata: metadata ?? null,
          responseMetadata: buildResponseMetadata(cached),
          allLabeledSpans: normalizedLabeledSpans,
          setSuggestions: updateSuggestions,
          onSuggestionClick: handleSuggestionClick,
          onClose: () => setSuggestionsData(null),
        }));
        return;
      }

      // Retry function for error state - Requirement 3.3
      const retryFn = () => {
        void fetchEnhancementSuggestions(payload);
      };

      // Schedule debounced request - Requirement 4.1, 4.2
      // NOTE: Loading state is shown AFTER debounce fires (inside scheduleRequest)
      try {
        const result = await fetchSuggestions({
          dedupKey,
          normalizedHighlight,
          normalizedPrompt,
          suggestionContext,
          metadata,
          allLabeledSpans: normalizedLabeledSpans,
          onRequestStart: () => {
            setSuggestionsData(() => ({
              show: true,
              selectedText: trimmedHighlight,
              originalText: originalText || trimmedHighlight,
              suggestions: [],
              isLoading: true,
              isError: false,
              errorMessage: null,
              isPlaceholder: false,
              fullPrompt: normalizedPrompt,
              range: range ?? null,
              offsets: offsets ?? null,
              metadata: metadata ?? null,
              responseMetadata: null,
              allLabeledSpans: normalizedLabeledSpans,
              onRetry: retryFn,
              setSuggestions: updateSuggestions,
              onSuggestionClick: handleSuggestionClick,
              onClose: () => setSuggestionsData(null),
            }));
          },
        });

        // Cache the result - Requirement 6.1
        const cachedResult = setCachedSuggestions(cacheKey, result);

        // If the server returned an authoritative fingerprint, also cache under
        // that key so future requests using the server fingerprint get a hit.
        if (
          result.spanFingerprint &&
          result.spanFingerprint !== spanFingerprint
        ) {
          const serverCacheKey = buildCacheKey({
            normalizedHighlight,
            normalizedPrompt,
            suggestionContext,
            category: metadata?.category ?? null,
            spanFingerprint: result.spanFingerprint,
          });
          if (serverCacheKey !== cacheKey) {
            setCachedSuggestions(serverCacheKey, result);
          }
        }

        setSuggestionsData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            suggestions: cachedResult.suggestions ?? [],
            isLoading: false,
            isError: false,
            errorMessage: null,
            isPlaceholder: cachedResult.isPlaceholder,
            responseMetadata: buildResponseMetadata(cachedResult),
            onRetry: retryFn,
          };
        });
      } catch (error) {
        // Silently ignore cancellation - don't update state - Requirement 1.2, 1.3
        if (error instanceof CancellationError) {
          return;
        }

        const errObj =
          error instanceof Error
            ? error
            : new Error(sanitizeError(error).message);
        log.error("Error fetching suggestions", errObj, {
          operation: "fetchEnhancementSuggestions",
        });
        toast.error("Failed to load suggestions");

        // Set error state with retry callback - Requirement 3.1, 3.3
        setSuggestionsData((prev) => {
          if (!prev) return null;
          const updated: SuggestionsData = {
            ...prev,
            isLoading: false,
            isError: true,
            errorMessage:
              errObj.message || "Failed to load suggestions. Please try again.",
            suggestions: [],
            responseMetadata: null,
            onRetry: retryFn, // Wire up retry callback
          };
          return updated;
        });
      }
    },
    [
      buildCacheKey,
      cancelCurrentRequest,
      fetchSuggestions,
      getCachedSuggestions,
      displayedPrompt,
      selectedMode,
      setSuggestionsData,
      setCachedSuggestions,
      toast,
      handleSuggestionClick,
      isRequestInFlight,
      updateSuggestions,
    ],
  );

  return {
    fetchEnhancementSuggestions,
  };
}
