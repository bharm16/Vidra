/**
 * useParseResult Hook
 *
 * Manages parse result state and conversion logic.
 * Extracted from PromptCanvas component to improve separation of concerns.
 */

import { useEffect, useMemo } from "react";
import { logger } from "@/services/LoggingService";
import { createCanonicalText } from "@utils/canonicalText";
import {
  convertLabeledSpansToHighlights,
  createHighlightSignature,
} from "@features/span-highlighting";
import type { CanonicalText } from "@utils/canonicalText";
import type { HighlightSpan } from "@features/span-highlighting/hooks/useHighlightRendering";
import type { ParseResult, ParseResultStatus } from "../types";

const EMPTY_SPANS: HighlightSpan[] = [];

const VALID_STATUSES = new Set<ParseResultStatus>([
  "idle",
  "loading",
  "refreshing",
  "success",
  "stale",
  "error",
]);

export interface UseParseResultOptions {
  labeledSpans: Array<{
    start: number;
    end: number;
    category: string;
    confidence: number;
  }>;
  labeledMeta: Record<string, unknown> | null;
  labelingSignature?: string | null;
  labelingStatus: string;
  labelingError: Error | null;
  enableMLHighlighting: boolean;
  displayedPrompt: string | null;
}

export function useParseResult({
  labeledSpans,
  labeledMeta,
  labelingSignature,
  labelingStatus,
  labelingError,
  enableMLHighlighting,
  displayedPrompt,
}: UseParseResultOptions): ParseResult {
  const log = useMemo(() => logger.child("ParseResult"), []);
  const currentText = displayedPrompt ?? "";
  const canonical = useMemo(
    () => createCanonicalText(currentText) as CanonicalText,
    [currentText],
  );
  const currentSignature = useMemo(
    () => createHighlightSignature(currentText),
    [currentText],
  );
  const signatureMatches =
    !labelingSignature || labelingSignature === currentSignature;

  const spans = useMemo((): HighlightSpan[] => {
    if (!enableMLHighlighting || !currentText.trim()) {
      return EMPTY_SPANS;
    }
    if (!signatureMatches) {
      return EMPTY_SPANS;
    }
    return convertLabeledSpansToHighlights({
      spans: labeledSpans,
      text: currentText,
      canonical,
    }) as HighlightSpan[];
  }, [
    enableMLHighlighting,
    currentText,
    signatureMatches,
    labeledSpans,
    canonical,
  ]);

  const meta =
    enableMLHighlighting && currentText.trim() && !signatureMatches
      ? null
      : labeledMeta;

  // Map upstream SpanLabelingStatus to ParseResultStatus, keeping recognized
  // values and falling back to 'idle' for unexpected strings.
  const status: ParseResultStatus = VALID_STATUSES.has(
    labelingStatus as ParseResultStatus,
  )
    ? (labelingStatus as ParseResultStatus)
    : "idle";

  // Degraded = pipeline had an error but is serving cached/fallback data.
  const degraded =
    status === "stale" || (status === "error" && spans.length > 0);

  const parseResult = useMemo<ParseResult>(
    () => ({
      canonical,
      spans,
      meta,
      status,
      error: labelingError,
      displayText: currentText,
      degraded,
    }),
    [canonical, spans, meta, status, labelingError, currentText, degraded],
  );

  useEffect(() => {
    if (
      !enableMLHighlighting ||
      signatureMatches ||
      labeledSpans.length === 0
    ) {
      return;
    }

    log.debug("Span signature mismatch; dropping labeled spans", {
      labeledSpanCount: labeledSpans.length,
      labelingStatus,
      textLength: currentText.length,
      labelingSignature: labelingSignature
        ? labelingSignature.slice(0, 12)
        : null,
      currentSignature: currentSignature.slice(0, 12),
    });
  }, [
    enableMLHighlighting,
    signatureMatches,
    labeledSpans,
    labelingSignature,
    labelingStatus,
    currentText.length,
    currentSignature,
    log,
  ]);

  useEffect(() => {
    if (!enableMLHighlighting || !signatureMatches) {
      return;
    }

    const highlightCount = spans.length;
    if (labeledSpans.length > 1 && highlightCount <= 1) {
      log.debug("Span conversion produced minimal highlights", {
        labeledSpanCount: labeledSpans.length,
        highlightCount,
        labelingStatus,
        textLength: currentText.length,
        signature: currentSignature.slice(0, 12),
        spanSamples: labeledSpans.slice(0, 3).map((span) => ({
          start: span.start,
          end: span.end,
          role: span.category ?? (span as { role?: string }).role ?? null,
        })),
      });
    }
  }, [
    enableMLHighlighting,
    signatureMatches,
    labeledSpans,
    spans,
    labelingStatus,
    currentText.length,
    currentSignature,
    log,
  ]);

  return parseResult;
}
