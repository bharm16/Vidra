/**
 * Span Labeling Pipeline Hook
 *
 * Composes the full labeling → parsing → highlight rendering chain into a
 * single hook. This encapsulates the invariant that labeled spans must pass
 * through the signature gate (useParseResult) before being rendered, and
 * that highlight rendering operates on the diff of the parse result.
 *
 * Extracted from PromptCanvas to reduce wiring complexity and make the
 * labeling pipeline independently testable.
 */

import { useMemo, useRef, useCallback, useEffect } from "react";
import type React from "react";
import {
  PERFORMANCE_CONFIG,
  DEFAULT_LABELING_POLICY,
  TEMPLATE_VERSIONS,
} from "@config/performance.config";
import { sanitizeText, useSpanLabeling } from "@/features/span-highlighting";
import { useHighlightRendering } from "@/features/span-highlighting";
import { useHighlightFingerprint } from "@/features/span-highlighting";
import type { SpanLabelingResult } from "@/features/span-highlighting/hooks/types";
import type { HighlightSnapshot } from "../types";
import { useSpanDataConversion } from "./useSpanDataConversion";
import { useParseResult } from "./useParseResult";
import { escapeHTMLForMLHighlighting } from "../../utils/textFormatting";

export interface SpanLabelingPipelineInput {
  displayedPrompt: string | null;
  promptUuid: string | null;
  selectedMode: string;
  showResults: boolean;
  initialHighlights: HighlightSnapshot | null;
  initialHighlightsVersion: number;
  optimizationResultVersion: number;
  editorRef: React.RefObject<HTMLElement>;
  showHighlights: boolean;
  i2vContext?: { isI2VMode?: boolean } | null | undefined;
  onHighlightsPersist?: ((result: SpanLabelingResult) => void) | undefined;
  syncVersionHighlights: (
    snapshot: HighlightSnapshot,
    promptText: string,
  ) => void;
  versioningPromptUuid: string | null;
}

// Return type is inferred to avoid duplicating complex span types.

export function useSpanLabelingPipeline({
  displayedPrompt,
  promptUuid,
  selectedMode,
  showResults,
  initialHighlights,
  initialHighlightsVersion,
  optimizationResultVersion,
  editorRef,
  showHighlights,
  i2vContext,
  onHighlightsPersist,
  syncVersionHighlights,
  versioningPromptUuid,
}: SpanLabelingPipelineInput) {
  const enableMLHighlighting = selectedMode === "video" && showResults;

  // Normalize to NFC so span offsets and rendered text stay aligned.
  const normalizedDisplayedPrompt = useMemo(
    () => (displayedPrompt == null ? null : sanitizeText(displayedPrompt)),
    [displayedPrompt],
  );

  const labelingPolicy = useMemo(() => DEFAULT_LABELING_POLICY, []);

  // Span data conversion
  const { memoizedInitialHighlights } = useSpanDataConversion({
    initialHighlights,
    promptUuid,
    displayedPrompt: normalizedDisplayedPrompt,
    enableMLHighlighting,
    initialHighlightsVersion,
  });

  // Detect fresh optimization for immediate labeling
  const previousOptimizationResultVersionRef = useRef(
    optimizationResultVersion,
  );
  const shouldLabelImmediately =
    optimizationResultVersion > 0 &&
    optimizationResultVersion !== previousOptimizationResultVersionRef.current;

  useEffect(() => {
    previousOptimizationResultVersionRef.current = optimizationResultVersion;
  }, [optimizationResultVersion]);

  // Labeling result handler — builds HighlightSnapshot for versioning/persistence
  const handleLabelingResult = useCallback(
    (result: SpanLabelingResult): void => {
      if (!enableMLHighlighting || !result) {
        return;
      }
      if (onHighlightsPersist) {
        onHighlightsPersist(result);
      }

      if (Array.isArray(result.spans) && result.signature) {
        const snapshot: HighlightSnapshot = {
          spans: result.spans,
          meta: result.meta ?? null,
          signature: result.signature,
          cacheId:
            result.cacheId ??
            (versioningPromptUuid ? String(versioningPromptUuid) : null),
          updatedAt: new Date().toISOString(),
        };
        syncVersionHighlights(snapshot, normalizedDisplayedPrompt ?? "");
      }
    },
    [
      enableMLHighlighting,
      onHighlightsPersist,
      versioningPromptUuid,
      normalizedDisplayedPrompt,
      syncVersionHighlights,
    ],
  );

  // Core labeling hook
  const {
    spans: labeledSpans,
    meta: labeledMeta,
    status: labelingStatus,
    error: labelingError,
    signature: labelingSignature,
  } = useSpanLabeling({
    text: enableMLHighlighting ? (normalizedDisplayedPrompt ?? "") : "",
    initialData: memoizedInitialHighlights,
    initialDataVersion: initialHighlightsVersion,
    cacheKey: enableMLHighlighting && promptUuid ? String(promptUuid) : null,
    enabled: enableMLHighlighting && Boolean(normalizedDisplayedPrompt?.trim()),
    immediate: shouldLabelImmediately,
    maxSpans: PERFORMANCE_CONFIG.MAX_HIGHLIGHTS,
    minConfidence: PERFORMANCE_CONFIG.MIN_CONFIDENCE_SCORE,
    policy: labelingPolicy,
    templateVersion: i2vContext?.isI2VMode
      ? TEMPLATE_VERSIONS.SPAN_LABELING_I2V
      : TEMPLATE_VERSIONS.SPAN_LABELING_V1,
    debounceMs: PERFORMANCE_CONFIG.DEBOUNCE_DELAY_MS,
    onResult: handleLabelingResult,
  });

  // Signature gate — only apply spans when they match current text
  const parseResult = useParseResult({
    labeledSpans,
    labeledMeta,
    labelingSignature,
    labelingStatus,
    labelingError,
    enableMLHighlighting,
    displayedPrompt: normalizedDisplayedPrompt,
  });

  // Category-accordion span transformation
  const categorySpans = useMemo(
    () =>
      parseResult.spans.map((span) => {
        const { confidence, category, ...rest } = span;
        return {
          ...rest,
          id: span.id ?? `span_${span.start}_${span.end}`,
          quote: span.quote ?? span.text ?? "",
          ...(typeof confidence === "number" ? { confidence } : {}),
          ...(category !== undefined ? { category } : {}),
        };
      }),
    [parseResult.spans],
  );

  // Highlight fingerprint for change detection
  const highlightFingerprint = useHighlightFingerprint(enableMLHighlighting, {
    spans: parseResult.spans,
    displayText: parseResult.displayText,
  });

  // Formatted HTML for the editor surface (ML highlighting container)
  const formattedHTML = useMemo(
    () => escapeHTMLForMLHighlighting(normalizedDisplayedPrompt || ""),
    [normalizedDisplayedPrompt],
  );

  // DOM highlight rendering
  useHighlightRendering({
    editorRef,
    parseResult: {
      spans: parseResult.spans,
      displayText: parseResult.displayText,
    },
    enabled: enableMLHighlighting && showHighlights,
    fingerprint: highlightFingerprint,
    text: normalizedDisplayedPrompt ?? "",
  });

  return {
    normalizedDisplayedPrompt,
    parseResult,
    categorySpans,
    highlightFingerprint,
    formattedHTML,
    enableMLHighlighting,
    labelingStatus,
    labelingSignature,
  };
}
