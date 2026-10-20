import { useCallback, useRef } from "react";
import { calculateEffectiveDebounce } from "../utils/spanLabelingScheduler.ts";
import type { SpanLabelingPayload } from "./types.ts";

export interface AsyncSchedulerOptions {
  enabled: boolean;
  debounceMs: number;
  useSmartDebounce: boolean;
  immediate: boolean;
}

export interface AsyncSchedulerCallbacks {
  onExecute: (
    payload: SpanLabelingPayload,
    signal: AbortSignal,
  ) => Promise<unknown>;
  onSuccess?: (result: unknown, payload: SpanLabelingPayload) => void;
  onError?: (error: Error, payload: SpanLabelingPayload) => void;
  onLoadingState?: (immediate: boolean) => void;
}

/**
 * Async Scheduler Hook
 *
 * Handles scheduling, debouncing, and abort controller management for async operations.
 * Separates scheduling logic (business logic) from UI state management.
 */
export function useAsyncScheduler(
  options: AsyncSchedulerOptions,
  callbacks: AsyncSchedulerCallbacks,
) {
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const requestIdRef = useRef(0);
  const requestVersionRef = useRef(0);

  const cancelPending = useCallback((): void => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    requestVersionRef.current += 1;
  }, []);

  const schedule = useCallback(
    (payload: SpanLabelingPayload, immediate = false): void => {
      cancelPending();

      if (!options.enabled) {
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      const requestVersion = requestVersionRef.current;

      // Set loading state
      if (callbacks.onLoadingState) {
        callbacks.onLoadingState(immediate);
      }

      const controller = new AbortController();
      abortRef.current = controller;

      const run = async (controller: AbortController): Promise<void> => {
        try {
          const result = await callbacks.onExecute(payload, controller.signal);

          // Check for stale requests
          if (
            requestId !== requestIdRef.current ||
            requestVersion !== requestVersionRef.current
          ) {
            return;
          }

          if (callbacks.onSuccess) {
            callbacks.onSuccess(result, payload);
          }
        } catch (error) {
          const errorObj =
            error instanceof Error ? error : new Error(String(error));

          // Check for stale requests
          if (
            requestId !== requestIdRef.current ||
            requestVersion !== requestVersionRef.current ||
            controller.signal.aborted
          ) {
            return;
          }

          if (callbacks.onError) {
            callbacks.onError(errorObj, payload);
          }
        } finally {
          if (abortRef.current === controller) {
            abortRef.current = null;
          }
        }
      };

      const effectiveDebounce = calculateEffectiveDebounce(payload, {
        enabled: options.enabled,
        debounceMs: options.debounceMs,
        useSmartDebounce: options.useSmartDebounce,
        immediate,
      });

      if (effectiveDebounce === 0) {
        run(controller);
      } else {
        debounceRef.current = setTimeout(() => {
          run(controller);
        }, effectiveDebounce);
      }
    },
    [
      options.enabled,
      options.debounceMs,
      options.useSmartDebounce,
      cancelPending,
      callbacks,
    ],
  );

  return {
    schedule,
    cancelPending,
  };
}
