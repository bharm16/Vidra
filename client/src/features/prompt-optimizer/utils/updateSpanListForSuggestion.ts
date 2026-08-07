import type { HighlightSpan } from "@features/span-highlighting";

const isFiniteNumber = (value: unknown): value is number =>
  Number.isFinite(value);

const shiftNumber = (value: unknown, delta: number): number | undefined => {
  if (!isFiniteNumber(value)) {
    return undefined;
  }
  return value + delta;
};

interface UpdateSpanListParams {
  spans: HighlightSpan[];
  matchStart: number | null | undefined;
  matchEnd: number | null | undefined;
  replacementText: string;
  targetSpanId?: string | null;
  targetStart?: number | null;
  targetEnd?: number | null;
  targetCategory?: string | null;
  removeTarget?: boolean;
}

export function updateSpanListForSuggestion({
  spans,
  matchStart,
  matchEnd,
  replacementText,
  targetSpanId,
  targetStart,
  targetEnd,
  targetCategory,
  removeTarget = false,
}: UpdateSpanListParams): HighlightSpan[] {
  if (!Array.isArray(spans) || spans.length === 0) {
    return spans;
  }

  if (
    !isFiniteNumber(matchStart) ||
    !isFiniteNumber(matchEnd) ||
    matchEnd < matchStart
  ) {
    return spans;
  }

  const replacementLength = replacementText.length;
  const replacedLength = matchEnd - matchStart;
  const delta = replacementLength - replacedLength;

  let targetIndex = -1;

  if (targetSpanId) {
    targetIndex = spans.findIndex((span) => span?.id === targetSpanId);
  }

  if (
    targetIndex < 0 &&
    isFiniteNumber(targetStart) &&
    isFiniteNumber(targetEnd)
  ) {
    targetIndex = spans.findIndex(
      (span) => span && span.start === targetStart && span.end === targetEnd,
    );
  }

  if (
    targetIndex < 0 &&
    isFiniteNumber(targetStart) &&
    isFiniteNumber(targetEnd) &&
    targetCategory
  ) {
    targetIndex = spans.findIndex(
      (span) =>
        span &&
        span.start === targetStart &&
        span.end === targetEnd &&
        span.category === targetCategory,
    );
  }

  if (targetIndex < 0) {
    targetIndex = spans.findIndex(
      (span) => span && span.start < matchEnd && span.end > matchStart,
    );
  }

  if (targetIndex < 0) {
    return spans;
  }

  return spans.reduce<HighlightSpan[]>((acc, span, index) => {
    if (!span || !isFiniteNumber(span.start) || !isFiniteNumber(span.end)) {
      acc.push(span);
      return acc;
    }

    const overlaps = span.start < matchEnd && span.end > matchStart;

    if (index === targetIndex) {
      if (removeTarget) {
        return acc;
      }
      const nextStart = matchStart;
      const nextEnd = matchStart + replacementLength;
      const updatedSpan: HighlightSpan = { ...span };
      updatedSpan.start = nextStart;
      updatedSpan.end = nextEnd;
      updatedSpan.displayStart = nextStart;
      updatedSpan.displayEnd = nextEnd;
      updatedSpan.text = replacementText;
      updatedSpan.quote = replacementText;
      updatedSpan.displayQuote = replacementText;
      updatedSpan.displayLeftCtx = undefined;
      updatedSpan.displayRightCtx = undefined;
      updatedSpan.leftCtx = undefined;
      updatedSpan.rightCtx = undefined;
      updatedSpan.startGrapheme = undefined;
      updatedSpan.endGrapheme = undefined;
      acc.push(updatedSpan);
      return acc;
    }

    if (overlaps) {
      return acc;
    }

    if (span.start >= matchEnd) {
      const nextStart = span.start + delta;
      const nextEnd = span.end + delta;
      const updatedSpan: HighlightSpan = { ...span };
      updatedSpan.start = nextStart;
      updatedSpan.end = nextEnd;
      updatedSpan.displayStart = nextStart;
      updatedSpan.displayEnd = nextEnd;
      updatedSpan.startGrapheme = shiftNumber(updatedSpan.startGrapheme, delta);
      updatedSpan.endGrapheme = shiftNumber(updatedSpan.endGrapheme, delta);
      acc.push(updatedSpan);
      return acc;
    }

    acc.push(span);
    return acc;
  }, []);
}
