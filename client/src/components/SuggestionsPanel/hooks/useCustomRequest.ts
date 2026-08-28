/**
 * useCustomRequest Hook
 *
 * Manages custom request input state and API interactions.
 *
 * Features:
 * - Request cancellation via SuggestionRequestManager
 * - 8-second timeout for requests
 * - Proper error handling (no error-as-suggestion anti-pattern)
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { fetchCustomSuggestions } from "@features/prompt-optimizer/api/customSuggestionsApi";
import { logger } from "@/services/LoggingService";
import { SuggestionRequestManager } from "@features/prompt-optimizer/utils/SuggestionRequestManager";
import { CancellationError } from "@features/prompt-optimizer/utils/signalUtils";

import type { SuggestionItem } from "./types";

interface UseCustomRequestParams {
  selectedText?: string;
  fullPrompt?: string;
  contextBefore?: string;
  contextAfter?: string;
  metadata?: Record<string, unknown> | null;
  onCustomRequest?: (request: string) => Promise<SuggestionItem[]>;
  setSuggestions?: (suggestions: SuggestionItem[], category?: string) => void;
  /** NEW: Proper error state handler - Requirement 3.1 */
  setError?: (message: string) => void;
}

interface UseCustomRequestReturn {
  customRequest: string;
  setCustomRequest: (value: string) => void;
  handleCustomRequest: () => Promise<void>;
  isCustomLoading: boolean;
}

/** Configuration for request manager (no debounce for custom requests) */
const REQUEST_CONFIG = {
  debounceMs: 0, // No debounce - user explicitly clicked button
  timeoutMs: 8000,
};

/**
 * Custom hook for handling custom suggestion requests
 *
 * Features:
 * - Request cancellation on new request
 * - 8-second timeout
 * - Proper error handling via setError callback
 */
export function useCustomRequest({
  selectedText = "",
  fullPrompt = "",
  contextBefore,
  contextAfter,
  metadata = null,
  onCustomRequest = undefined,
  setSuggestions = undefined,
  setError = undefined,
}: UseCustomRequestParams = {}): UseCustomRequestReturn {
  const [customRequest, setCustomRequest] = useState("");
  const [isCustomLoading, setIsCustomLoading] = useState(false);

  // Request manager instance (no debounce for custom requests)
  const requestManagerRef = useRef<SuggestionRequestManager>(
    new SuggestionRequestManager(REQUEST_CONFIG),
  );

  // Cleanup on unmount
  useEffect(() => {
    const requestManager = requestManagerRef.current;
    return () => {
      requestManager.dispose();
    };
  }, []);

  /**
   * Handle custom request submission
   */
  const handleCustomRequest = useCallback(async (): Promise<void> => {
    const trimmedRequest = customRequest.trim();
    if (!trimmedRequest) return;
    if (!selectedText.trim() || !fullPrompt.trim()) {
      if (setError) {
        setError("Select text in the prompt before applying a custom request.");
      }
      return;
    }

    const startTime = performance.now();
    const operation = "handleCustomRequest";
    logger.startTimer(operation);

    // Check client-side cache before making a network request
    const cached =
      requestManagerRef.current.getCached<SuggestionItem[]>(trimmedRequest);
    if (cached) {
      if (setSuggestions && Array.isArray(cached)) {
        setSuggestions(cached, undefined);
      }
      logger.info("Custom suggestions served from cache", {
        hook: "useCustomRequest",
        operation,
        suggestionCount: cached.length,
      });
      return;
    }

    setIsCustomLoading(true);

    // Clear any previous error
    if (setError) {
      setError("");
    }

    try {
      const result = await requestManagerRef.current.scheduleRequest(
        trimmedRequest, // Use request text as dedup key
        async (signal) => {
          // If custom handler provided, use it
          if (typeof onCustomRequest === "function") {
            return onCustomRequest(trimmedRequest);
          }

          // Otherwise, use default API with cancellation support
          const suggestions = await fetchCustomSuggestions({
            highlightedText: selectedText,
            customRequest: trimmedRequest,
            fullPrompt,
            ...(contextBefore ? { contextBefore } : {}),
            ...(contextAfter ? { contextAfter } : {}),
            ...(metadata ? { metadata } : {}),
            signal, // Pass abort signal for cancellation
          });

          return suggestions;
        },
      );

      // Update suggestions with result
      if (setSuggestions && Array.isArray(result)) {
        setSuggestions(result, undefined);
      }

      const duration = logger.endTimer(operation);
      logger.info("Custom suggestions fetched successfully", {
        hook: "useCustomRequest",
        operation,
        duration,
        suggestionCount: Array.isArray(result) ? result.length : 0,
      });
    } catch (error) {
      // Silently ignore cancellation - don't update state
      if (error instanceof CancellationError) {
        return;
      }

      const duration = logger.endTimer(operation);
      logger.error("Error fetching custom suggestions", error as Error, {
        hook: "useCustomRequest",
        operation,
        duration,
        customRequestLength: trimmedRequest.length,
        selectedTextLength: selectedText.length,
      });

      // Set error state properly (not as a fake suggestion) - Requirement 3.1
      if (setError) {
        setError("Failed to load custom suggestions. Please try again.");
      }
      // Note: We no longer set error as a suggestion item (removed anti-pattern)
    } finally {
      setIsCustomLoading(false);
      setCustomRequest("");
    }
  }, [
    customRequest,
    selectedText,
    fullPrompt,
    contextBefore,
    contextAfter,
    metadata,
    onCustomRequest,
    setSuggestions,
    setError,
  ]);

  return {
    customRequest,
    setCustomRequest,
    handleCustomRequest,
    isCustomLoading,
  };
}
