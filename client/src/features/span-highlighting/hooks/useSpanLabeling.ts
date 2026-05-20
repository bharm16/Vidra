/**
 * useSpanLabeling - Orchestrator Hook
 *
 * Coordinates span labeling workflow by delegating to:
 * - SpanLabelingApi: API calls
 * - spanLabelingCache: Caching
 * - spanLabelingScheduler: Scheduling/debouncing
 * - spanLabelingErrorHandler: Error handling
 * - spanLabelingResultEmitter: Result emission
 *
 * Single Responsibility: Orchestrate the span labeling workflow
 */

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { logger } from "@/services/LoggingService";
import { DEFAULT_POLICY, DEFAULT_OPTIONS } from "../config/index.ts";
import { sanitizeText, hashString } from "../utils/index.ts";
import { SpanLabelingApi } from "../api/index.ts";
import {
  createDisabledState,
  createLoadingState,
} from "../utils/spanLabelingScheduler.ts";
import {
  shouldHandleError,
  createFallbackResult,
  createErrorStateWithFallback,
  createErrorState,
  logErrorWarning,
} from "../utils/spanLabelingErrorHandler.ts";
import { useAsyncScheduler } from "./useAsyncScheduler.ts";
import { useSpanLabelingCache } from "./useSpanLabelingCache.ts";
import { useSpanLabelingCacheService } from "../context/SpanLabelingContext.tsx";
import { predictiveCacheService } from "@/services/PredictiveCacheService";
import type {
  LabeledSpan,
  SpanMeta,
  SpanLabelingResult,
  SpanLabelingStatus,
  SpanLabelingState,
  SpanLabelingPolicy,
  SpanLabelingPayload,
  InitialData,
  UseSpanLabelingOptions,
  UseSpanLabelingReturn,
} from "./types";

// Re-export types for backward compatibility
export type {
  LabeledSpan,
  SpanMeta,
  SpanLabelingResult,
  SpanLabelingStatus,
  SpanLabelingState,
  SpanLabelingPolicy,
  SpanLabelingPayload,
  InitialData,
  UseSpanLabelingOptions,
  UseSpanLabelingReturn,
} from "./types";

export const createHighlightSignature = (
  text: string | null | undefined,
): string => {
  return hashString(sanitizeText(text ?? ""));
};

/**
 * Shallow structural equality. Sufficient for the SpanLabelingPolicy shape
 * (flat object with primitive fields) and dramatically cheaper than the prior
 * 2× JSON.stringify on every render of the keystroke-driven editor.
 */
function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  const aKeys = Object.keys(a as object);
  const bKeys = Object.keys(b as object);
  if (aKeys.length !== bKeys.length) return false;
  const aRec = a as Record<string, unknown>;
  const bRec = b as Record<string, unknown>;
  for (const k of aKeys) {
    if (!Object.is(aRec[k], bRec[k])) return false;
  }
  return true;
}

/**
 * Stabilizes object references by content-equality check. Used so callers that
 * forget to wrap policy in useMemo still get a stable reference here. Was
 * previously implemented with JSON.stringify; switched to a shallow compare
 * because the keystroke critical path can't afford double-stringify per render.
 */
function useDeepCompareMemoize<T>(value: T): T {
  const ref = useRef<T>(value);
  const signalRef = useRef<number>(0);

  if (!shallowEqual(value, ref.current)) {
    ref.current = value;
    signalRef.current += 1;
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => ref.current, [signalRef.current]);
}

function normalizeMetaVersion(
  meta: SpanMeta | null,
  templateVersion: string,
): SpanMeta | null {
  if (!meta || typeof meta !== "object") {
    return { version: templateVersion };
  }

  const normalized = { ...meta } as Record<string, unknown>;
  if (typeof normalized.version !== "string" || !normalized.version.trim()) {
    normalized.version = templateVersion;
  }

  return normalized as SpanMeta;
}

/**
 * Hook to call the /api/llm/label-spans endpoint with debounce + cancellation.
 */
export function useSpanLabeling({
  text,
  initialData = null,
  initialDataVersion = 0,
  cacheKey = null,
  enabled = true,
  immediate = false,
  maxSpans = DEFAULT_OPTIONS.maxSpans,
  minConfidence = DEFAULT_OPTIONS.minConfidence,
  policy,
  templateVersion = DEFAULT_OPTIONS.templateVersion,
  debounceMs = DEFAULT_OPTIONS.debounceMs,
  useSmartDebounce = DEFAULT_OPTIONS.useSmartDebounce,
  onResult,
}: UseSpanLabelingOptions = {}): UseSpanLabelingReturn {
  const log = useMemo(() => logger.child("useSpanLabeling"), []);

  const [state, setState] = useState<SpanLabelingState>({
    spans: [],
    meta: null,
    status: "idle",
    error: null,
    signature: null,
  });

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const requestIdRef = useRef(0);
  const requestVersionRef = useRef(0);
  const lastPayloadRef = useRef<SpanLabelingPayload | null>(null);
  const onResultRef = useRef(onResult);
  const lastEmitKeyRef = useRef<string | null>(null);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  // 1. Stabilize the Policy internally using deep comparison
  // This prevents infinite loops even if caller forgets to useMemo
  const stablePolicy = useDeepCompareMemoize(policy);
  const mergedPolicy = useMemo((): SpanLabelingPolicy => {
    if (!stablePolicy || typeof stablePolicy !== "object") {
      return { ...DEFAULT_POLICY };
    }
    return {
      ...DEFAULT_POLICY,
      ...stablePolicy,
      allowOverlap: stablePolicy.allowOverlap === true,
    };
  }, [stablePolicy]);

  // 2. Stabilize initialData using signature-based comparison
  // This prevents infinite loops if caller passes new object with same content
  const initialDataRef = useRef(initialData);
  const stableInitialData = useMemo(() => {
    const current = initialDataRef.current;

    // Check if identity changed but content signature is identical
    if (
      initialData !== current &&
      initialData?.signature === current?.signature &&
      initialData?.meta?.version === current?.meta?.version
    ) {
      // Return the OLD reference to prevent effect firing
      return current;
    }

    // Content actually changed, update ref and return new reference
    initialDataRef.current = initialData;
    return initialData;
  }, [initialData]);

  // Get cache service from context (dependency injection)
  const cacheService = useSpanLabelingCacheService();
  const { checkCache: checkCacheForPayload, setCache: setCacheForPayload } =
    useSpanLabelingCache(cacheService);

  const performRequest = useCallback(
    async (
      payload: SpanLabelingPayload,
      signal: AbortSignal | null,
    ): Promise<{ spans: LabeledSpan[]; meta: SpanMeta | null }> => {
      // Use streaming API
      // We accumulate spans in a local array and update state incrementally
      const accumSpans: LabeledSpan[] = [];
      const signature = hashString(payload.text ?? "");
      const flushIntervalMs = 100;
      const flushSpanBatchSize = 20;
      const logEvery = 25;
      let isActive = true;
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      let lastFlushAt = Date.now();
      let lastFlushedCount = 0;
      let receivedCount = 0;

      const flush = (): void => {
        if (!isActive || signal?.aborted) return;
        lastFlushAt = Date.now();
        lastFlushedCount = accumSpans.length;
        setState((prev) => {
          if (prev.status === "error") return prev;
          return {
            ...prev,
            status: "success",
            spans: accumSpans.slice(),
            signature,
            meta: prev.meta || { streaming: true },
          };
        });
      };

      const scheduleFlush = (): void => {
        if (flushTimer || !isActive) return;
        const delay = Math.max(0, flushIntervalMs - (Date.now() - lastFlushAt));
        flushTimer = setTimeout(() => {
          flushTimer = null;
          flush();
        }, delay);
      };

      const requestFlush = (): void => {
        if (accumSpans.length - lastFlushedCount >= flushSpanBatchSize) {
          if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
          }
          flush();
          return;
        }
        scheduleFlush();
      };

      try {
        return await SpanLabelingApi.labelSpansStream(
          payload,
          (span) => {
            receivedCount++;
            if (receivedCount === 1 || receivedCount % logEvery === 0) {
              log.debug("Span stream progress", { spanCount: receivedCount });
            }
            accumSpans.push(span);
            // Optimistic update: Show spans as they arrive
            // Update in batches to reduce render churn
            requestFlush();
          },
          signal,
        );
      } finally {
        isActive = false;
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
      }
    },
    [log],
  );

  const emitResult = useCallback(
    (
      {
        spans,
        meta,
        text,
        cacheId,
        signature,
      }: {
        spans: LabeledSpan[];
        meta: SpanMeta | null;
        text: string;
        cacheId?: string | null;
        signature: string;
      },
      source: SpanLabelingResult["source"],
    ): void => {
      if (!onResultRef.current) return;
      if (!Array.isArray(spans) || !spans.length) return;
      const normalizedText = sanitizeText(text);
      const effectiveSignature = signature ?? hashString(normalizedText ?? "");
      const key = `${effectiveSignature}::${source}`;
      if (lastEmitKeyRef.current === key) {
        return;
      }
      lastEmitKeyRef.current = key;
      log.info("Result emitted", { spanCount: spans.length, source });
      onResultRef.current({
        spans,
        meta: meta ?? null,
        text: normalizedText,
        signature: effectiveSignature,
        cacheId: cacheId ?? null,
        source,
      });
    },
    [log],
  );

  // Memoize callbacks to prevent recreating the schedule function on every render
  const onLoadingState = useCallback((immediate: boolean) => {
    setState((prev) =>
      createLoadingState(
        immediate,
        prev.status,
        prev.spans,
        prev.meta,
        prev.signature,
      ),
    );
  }, []);

  const onSuccess = useCallback(
    (result: unknown, payload: SpanLabelingPayload) => {
      const apiResult = result as {
        spans: LabeledSpan[];
        meta: SpanMeta | null;
      };
      const signature = hashString(payload.text ?? "");
      const normalizedMeta = normalizeMetaVersion(
        apiResult.meta,
        templateVersion,
      );
      const normalizedResult = {
        spans: apiResult.spans,
        meta: normalizedMeta,
        signature,
      };

      log.info("Success", { spanCount: normalizedResult.spans.length });

      // Wrap in startTransition — applying 60+ span highlights is a non-urgent
      // state update that should yield to user input (typing, clicking).
      startTransition(() => {
        setState({
          spans: normalizedResult.spans,
          meta: normalizedResult.meta,
          status: "success",
          error: null,
          signature,
        });
      });

      setCacheForPayload(payload, normalizedResult);

      // Record pattern for predictive caching (network fetch = cache miss)
      predictiveCacheService.recordRequest({
        text: payload.text,
        policy: payload.policy as unknown as Record<string, unknown> | null,
        templateVersion: payload.templateVersion ?? null,
        cacheHit: false,
      });

      emitResult(
        {
          spans: normalizedResult.spans,
          meta: normalizedMeta,
          text: payload.text,
          cacheId: payload.cacheId ?? null,
          signature,
        },
        "network",
      );
    },
    [setCacheForPayload, emitResult, log, templateVersion],
  );

  const onError = useCallback(
    (error: Error, payload: SpanLabelingPayload) => {
      log.error("Error", error);
      const fallbackResult = createFallbackResult(payload, error, cacheService);

      if (fallbackResult) {
        setState(createErrorStateWithFallback(fallbackResult, error));
        logErrorWarning(error, payload, fallbackResult.meta.cacheAge);
        emitResult(fallbackResult, "cache-fallback");
        return;
      }

      setState(createErrorState(error));
    },
    [emitResult, cacheService, log],
  );

  // Stabilize callbacks object to prevent infinite re-renders
  const callbacks = useMemo(
    () => ({
      onExecute: performRequest,
      onLoadingState,
      onSuccess,
      onError,
    }),
    [performRequest, onLoadingState, onSuccess, onError],
  );

  // Use async scheduler for debouncing and abort management
  // Note: Stale request checking is handled inside useAsyncScheduler before callbacks are invoked
  const { schedule: scheduleRequest, cancelPending } = useAsyncScheduler(
    {
      enabled,
      debounceMs,
      useSmartDebounce,
      immediate,
    },
    callbacks,
  );

  const schedule = useCallback(
    (payload: SpanLabelingPayload, immediate = false): void => {
      performance.mark("span-labeling-start");

      if (!enabled) {
        lastPayloadRef.current = null;
        setState(createDisabledState());
        return;
      }

      lastPayloadRef.current = payload;

      // Check cache if not immediate
      if (!immediate) {
        const cacheResult = checkCacheForPayload(payload);

        if (cacheResult.cached) {
          const normalizedMeta = normalizeMetaVersion(
            cacheResult.cached.meta as SpanMeta | null,
            templateVersion,
          );
          performance.mark("span-cache-hit");
          performance.measure(
            "span-labeling-cache-hit",
            "span-labeling-start",
            "span-cache-hit",
          );

          setState({
            spans: Array.isArray(cacheResult.cached.spans)
              ? cacheResult.cached.spans
              : [],
            meta: normalizedMeta,
            status: "success",
            error: null,
            signature: cacheResult.cached.signature,
          });
          // Record cache hit for predictive caching pattern tracking
          predictiveCacheService.recordRequest({
            text: payload.text,
            policy: payload.policy as unknown as Record<string, unknown> | null,
            templateVersion: payload.templateVersion ?? null,
            cacheHit: true,
          });

          emitResult(
            {
              spans: cacheResult.cached.spans as LabeledSpan[],
              meta: normalizedMeta,
              text: payload.text,
              cacheId: cacheResult.cached.cacheId ?? payload.cacheId ?? null,
              signature: cacheResult.cached.signature,
            },
            immediate ? "refresh-cache" : "cache",
          );
          return;
        }
      }

      // Schedule API request
      scheduleRequest(payload, immediate);
    },
    [
      enabled,
      checkCacheForPayload,
      scheduleRequest,
      emitResult,
      templateVersion,
    ],
  );

  useEffect(() => {
    const normalized = sanitizeText(text);
    if (!enabled || !normalized.trim()) {
      cancelPending();
      setState(createDisabledState());
      return;
    }

    const payload: SpanLabelingPayload = {
      text: normalized,
      maxSpans,
      minConfidence,
      policy: mergedPolicy,
      templateVersion,
      isI2VMode: templateVersion?.toLowerCase().startsWith("i2v") ?? false,
      ...(typeof cacheKey === "string" ? { cacheId: cacheKey } : {}),
    };

    lastPayloadRef.current = payload;

    // Use stableInitialData to prevent infinite loops
    // Check if this is a local update (from applying a suggestion) - if so, trust it
    const isLocalUpdate = Boolean(
      stableInitialData?.meta &&
        (stableInitialData.meta as Record<string, unknown>).localUpdate ===
          true,
    );

    const initialVersion =
      typeof stableInitialData?.meta?.version === "string"
        ? stableInitialData.meta.version
        : null;
    const versionMatches =
      !initialVersion || initialVersion === templateVersion;
    const initialMatch =
      stableInitialData &&
      Array.isArray(stableInitialData.spans) &&
      stableInitialData.spans.length > 0 &&
      stableInitialData.signature === hashString(normalized ?? "") &&
      (isLocalUpdate || versionMatches);

    // Debug: trace initialMatch evaluation
    if (import.meta.env.DEV) {
      log.debug("initialMatch check", {
        hasStableData: Boolean(stableInitialData),
        hasSpans:
          Array.isArray(stableInitialData?.spans) &&
          stableInitialData.spans.length > 0,
        isLocalUpdate,
        initialMatch,
      });
    }

    if (initialMatch) {
      const normalizedMeta = normalizeMetaVersion(
        stableInitialData.meta ?? null,
        templateVersion,
      );
      cancelPending();
      setState({
        spans: stableInitialData.spans,
        meta: normalizedMeta,
        status: "success",
        error: null,
        signature: stableInitialData.signature ?? hashString(normalized ?? ""),
      });
      setCacheForPayload(payload, {
        spans: stableInitialData.spans,
        meta: normalizedMeta,
        signature: stableInitialData.signature ?? hashString(normalized ?? ""),
      });
      emitResult(
        {
          spans: stableInitialData.spans,
          meta: normalizedMeta,
          text: normalized,
          cacheId: payload.cacheId ?? null,
          signature: stableInitialData.signature,
        },
        "initial",
      );
      return;
    }

    schedule(payload, immediate);
    return () => cancelPending();
  }, [
    text,
    enabled,
    maxSpans,
    minConfidence,
    mergedPolicy, // Now stable via useDeepCompareMemoize
    templateVersion,
    schedule,
    cancelPending,
    cacheKey,
    stableInitialData, // DEPEND ON THIS, NOT initialData - prevents infinite loops
    initialDataVersion,
    emitResult,
    immediate,
    log,
    setCacheForPayload,
  ]);

  const refresh = useCallback((): void => {
    if (!lastPayloadRef.current) return;
    schedule(lastPayloadRef.current, true);
  }, [schedule]);

  // Trigger predictive cache pre-warming when status settles to 'success'
  useEffect(() => {
    if (state.status !== "success" || !enabled) return;
    predictiveCacheService.preWarmCache(async (params) => {
      const preWarmPayload: SpanLabelingPayload = {
        text: params.text,
        maxSpans,
        minConfidence,
        policy: (params.policy ?? mergedPolicy) as SpanLabelingPolicy,
        templateVersion: params.templateVersion ?? templateVersion,
        isI2VMode:
          (params.templateVersion ?? templateVersion)
            ?.toLowerCase()
            .startsWith("i2v") ?? false,
      };
      return SpanLabelingApi.labelSpansStream(preWarmPayload, () => {}, null);
    });
  }, [
    state.status,
    enabled,
    maxSpans,
    minConfidence,
    mergedPolicy,
    templateVersion,
  ]);

  useEffect(() => () => cancelPending(), [cancelPending]);

  return {
    spans: state.spans,
    meta: state.meta,
    status: state.status,
    error: state.error,
    signature: state.signature,
    refresh,
  };
}

// Note: Cache clearing/snapshot functions moved to cache service
// Access via useSpanLabelingCacheService() hook if needed
