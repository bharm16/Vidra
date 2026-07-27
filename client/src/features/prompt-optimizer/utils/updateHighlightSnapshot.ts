import { createHighlightSignature } from "@features/span-highlighting";
import { SPAN_LABELING_TEMPLATE_VERSIONS } from "@shared/spanLabeling";
import type { HighlightSnapshot } from "@features/prompt-optimizer/PromptCanvas/types";

const isFiniteNumber = (value: unknown): value is number =>
  Number.isFinite(value);

const shiftNumber = (value: unknown, delta: number): number | undefined => {
  if (!isFiniteNumber(value)) {
    return undefined;
  }
  return value + delta;
};

interface UpdateHighlightSnapshotParams {
  snapshot: HighlightSnapshot | null;
  matchStart: number | null | undefined;
  matchEnd: number | null | undefined;
  replacementText: string;
  nextPrompt: string;
  targetSpanId?: string | null;
  targetStart?: number | null;
  targetEnd?: number | null;
  targetCategory?: string | null;
}

interface RemoveHighlightSnapshotParams {
  snapshot: HighlightSnapshot | null;
  matchStart: number | null | undefined;
  matchEnd: number | null | undefined;
  nextPrompt: string;
  targetSpanId?: string | null;
  targetStart?: number | null;
  targetEnd?: number | null;
  targetCategory?: string | null;
}

export function updateHighlightSnapshotForSuggestion({
  snapshot,
  matchStart,
  matchEnd,
  replacementText,
  nextPrompt,
  targetSpanId,
  targetStart,
  targetEnd,
  targetCategory,
}: UpdateHighlightSnapshotParams): HighlightSnapshot | null {
  if (!snapshot || !Array.isArray(snapshot.spans) || !nextPrompt) {
    return null;
  }

  if (
    !isFiniteNumber(matchStart) ||
    !isFiniteNumber(matchEnd) ||
    matchEnd < matchStart
  ) {
    return null;
  }

  const replacementLength = replacementText.length;
  const replacedLength = matchEnd - matchStart;
  const delta = replacementLength - replacedLength;

  const spans = snapshot.spans;
  let targetIndex = -1;

  if (targetSpanId) {
    targetIndex = spans.findIndex((span) => {
      const spanRecord = span as Record<string, unknown>;
      return spanRecord && spanRecord.id === targetSpanId;
    });
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
    return null;
  }

  const updatedSpans = spans.reduce<HighlightSnapshot["spans"]>(
    (acc, span, index) => {
      if (!span || !isFiniteNumber(span.start) || !isFiniteNumber(span.end)) {
        acc.push(span);
        return acc;
      }

      const overlaps = span.start < matchEnd && span.end > matchStart;

      if (index === targetIndex) {
        const nextStart = matchStart;
        const nextEnd = matchStart + replacementLength;
        const updatedSpan = { ...(span as Record<string, unknown>) } as Record<
          string,
          unknown
        >;
        updatedSpan.start = nextStart;
        updatedSpan.end = nextEnd;
        if (updatedSpan.displayStart !== undefined) {
          updatedSpan.displayStart = nextStart;
        }
        if (updatedSpan.displayEnd !== undefined) {
          updatedSpan.displayEnd = nextEnd;
        }
        if (updatedSpan.startGrapheme !== undefined) {
          updatedSpan.startGrapheme = undefined;
        }
        if (updatedSpan.endGrapheme !== undefined) {
          updatedSpan.endGrapheme = undefined;
        }
        acc.push(updatedSpan as HighlightSnapshot["spans"][number]);
        return acc;
      }

      if (overlaps) {
        return acc;
      }

      if (span.start >= matchEnd) {
        const nextStart = span.start + delta;
        const nextEnd = span.end + delta;
        const updatedSpan = { ...(span as Record<string, unknown>) } as Record<
          string,
          unknown
        >;
        updatedSpan.start = nextStart;
        updatedSpan.end = nextEnd;
        if (updatedSpan.displayStart !== undefined) {
          updatedSpan.displayStart = nextStart;
        }
        if (updatedSpan.displayEnd !== undefined) {
          updatedSpan.displayEnd = nextEnd;
        }
        if (updatedSpan.startGrapheme !== undefined) {
          updatedSpan.startGrapheme = shiftNumber(
            updatedSpan.startGrapheme,
            delta,
          );
        }
        if (updatedSpan.endGrapheme !== undefined) {
          updatedSpan.endGrapheme = shiftNumber(updatedSpan.endGrapheme, delta);
        }
        acc.push(updatedSpan as HighlightSnapshot["spans"][number]);
        return acc;
      }

      acc.push(span);
      return acc;
    },
    [],
  );

  return {
    ...snapshot,
    spans: updatedSpans,
    signature: createHighlightSignature(nextPrompt),
    updatedAt: new Date().toISOString(),
    meta: {
      ...(snapshot.meta ?? {}),
      version: SPAN_LABELING_TEMPLATE_VERSIONS.STANDARD,
      localUpdate: true,
    },
  };
}

export function updateHighlightSnapshotForRemoval({
  snapshot,
  matchStart,
  matchEnd,
  nextPrompt,
  targetSpanId,
  targetStart,
  targetEnd,
  targetCategory,
}: RemoveHighlightSnapshotParams): HighlightSnapshot | null {
  if (!snapshot || !Array.isArray(snapshot.spans) || !nextPrompt) {
    return null;
  }

  if (
    !isFiniteNumber(matchStart) ||
    !isFiniteNumber(matchEnd) ||
    matchEnd < matchStart
  ) {
    return null;
  }

  const replacedLength = matchEnd - matchStart;
  const delta = -replacedLength;

  const spans = snapshot.spans;
  let targetIndex = -1;

  if (targetSpanId) {
    targetIndex = spans.findIndex((span) => {
      const spanRecord = span as Record<string, unknown>;
      return spanRecord && spanRecord.id === targetSpanId;
    });
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
    return null;
  }

  const updatedSpans = spans.reduce<HighlightSnapshot["spans"]>(
    (acc, span, index) => {
      if (!span || !isFiniteNumber(span.start) || !isFiniteNumber(span.end)) {
        acc.push(span);
        return acc;
      }

      const overlaps = span.start < matchEnd && span.end > matchStart;

      if (index === targetIndex) {
        return acc;
      }

      if (overlaps) {
        return acc;
      }

      if (span.start >= matchEnd) {
        const nextStart = span.start + delta;
        const nextEnd = span.end + delta;
        const updatedSpan = { ...(span as Record<string, unknown>) } as Record<
          string,
          unknown
        >;
        updatedSpan.start = nextStart;
        updatedSpan.end = nextEnd;
        if (updatedSpan.displayStart !== undefined) {
          updatedSpan.displayStart = nextStart;
        }
        if (updatedSpan.displayEnd !== undefined) {
          updatedSpan.displayEnd = nextEnd;
        }
        if (updatedSpan.startGrapheme !== undefined) {
          updatedSpan.startGrapheme = shiftNumber(
            updatedSpan.startGrapheme,
            delta,
          );
        }
        if (updatedSpan.endGrapheme !== undefined) {
          updatedSpan.endGrapheme = shiftNumber(updatedSpan.endGrapheme, delta);
        }
        acc.push(updatedSpan as HighlightSnapshot["spans"][number]);
        return acc;
      }

      acc.push(span);
      return acc;
    },
    [],
  );

  return {
    ...snapshot,
    spans: updatedSpans,
    signature: createHighlightSignature(nextPrompt),
    updatedAt: new Date().toISOString(),
    meta: {
      ...(snapshot.meta ?? {}),
      version: SPAN_LABELING_TEMPLATE_VERSIONS.STANDARD,
      localUpdate: true,
    },
  };
}
