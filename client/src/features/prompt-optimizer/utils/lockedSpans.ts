import type { HighlightSpan } from "@features/span-highlighting";
import type { LockedSpan } from "../types";

const normalize = (value?: string | null): string => (value ?? "").trim();

export const getSpanId = (span: HighlightSpan): string =>
  typeof span.id === "string" && span.id.length > 0
    ? span.id
    : `span_${span.start}_${span.end}`;

export const buildLockedSpan = (span: HighlightSpan): LockedSpan | null => {
  const text = normalize(span.displayQuote ?? span.quote ?? span.text);
  if (!text) {
    return null;
  }

  return {
    id: getSpanId(span),
    text,
    leftCtx: normalize(span.displayLeftCtx ?? span.leftCtx),
    rightCtx: normalize(span.displayRightCtx ?? span.rightCtx),
    ...(typeof span.category === "string" ? { category: span.category } : {}),
    ...(typeof span.source === "string" ? { source: span.source } : {}),
    ...(typeof span.confidence === "number"
      ? { confidence: span.confidence }
      : {}),
  };
};

export const findLockedSpanIndex = (
  lockedSpans: LockedSpan[],
  span: HighlightSpan | null,
): number => {
  if (!span) {
    return -1;
  }
  const spanId = getSpanId(span);
  const spanText = normalize(span.displayQuote ?? span.quote ?? span.text);

  return lockedSpans.findIndex((locked) => {
    if (locked.id === spanId) {
      return true;
    }
    if (!spanText || normalize(locked.text) !== spanText) {
      return false;
    }
    return true;
  });
};

export const isSpanLocked = (
  lockedSpans: LockedSpan[],
  span: HighlightSpan | null,
): boolean => findLockedSpanIndex(lockedSpans, span) >= 0;
