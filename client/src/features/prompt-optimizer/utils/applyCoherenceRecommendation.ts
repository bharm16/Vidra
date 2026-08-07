import type { HighlightSnapshot } from "@features/prompt-optimizer/PromptCanvas/types";
import type {
  CoherenceRecommendation,
  CoherenceSpan,
} from "@features/prompt-optimizer/types/coherence";
import type { HighlightSpan } from "@features/span-highlighting";
import { applySpanEditToPrompt } from "./applySpanEdit";
import {
  updateHighlightSnapshotForSuggestion,
  updateHighlightSnapshotForRemoval,
} from "./updateHighlightSnapshot";
import { updateSpanListForSuggestion } from "./updateSpanListForSuggestion";

const isFiniteNumber = (value: unknown): value is number =>
  Number.isFinite(value);

const normalizeCoherenceSpans = (spans: CoherenceSpan[]): HighlightSpan[] =>
  spans
    .filter(
      (span) =>
        isFiniteNumber(span.start) &&
        isFiniteNumber(span.end) &&
        span.end > span.start,
    )
    .map((span) => ({
      ...span,
      start: span.start as number,
      end: span.end as number,
    }));

interface ApplyCoherenceRecommendationParams {
  recommendation: CoherenceRecommendation;
  prompt: string;
  spans: CoherenceSpan[];
  highlightSnapshot: HighlightSnapshot | null;
}

export interface ApplyCoherenceRecommendationResult {
  updatedPrompt: string | null;
  updatedSnapshot: HighlightSnapshot | null;
}

export function applyCoherenceRecommendation({
  recommendation,
  prompt,
  spans,
  highlightSnapshot,
}: ApplyCoherenceRecommendationParams): ApplyCoherenceRecommendationResult {
  if (!prompt) {
    return { updatedPrompt: null, updatedSnapshot: null };
  }

  let workingPrompt = prompt;
  let workingSnapshot = highlightSnapshot;
  let workingSpans = normalizeCoherenceSpans(spans);

  recommendation.edits.forEach((edit) => {
    const span = edit.spanId
      ? (workingSpans.find((candidate) => candidate.id === edit.spanId) ?? null)
      : null;

    const result = applySpanEditToPrompt({
      prompt: workingPrompt,
      edit,
      span: span as unknown as CoherenceSpan | null,
    });

    if (
      !result.updatedPrompt ||
      !isFiniteNumber(result.matchStart) ||
      !isFiniteNumber(result.matchEnd)
    ) {
      return;
    }

    const matchStart = result.matchStart as number;
    const matchEnd = result.matchEnd as number;
    const replacementText =
      edit.type === "replaceSpanText" ? (edit.replacementText ?? "") : "";

    if (workingSnapshot) {
      const nextSnapshot =
        edit.type === "replaceSpanText"
          ? updateHighlightSnapshotForSuggestion({
              snapshot: workingSnapshot,
              matchStart,
              matchEnd,
              replacementText,
              nextPrompt: result.updatedPrompt,
              targetSpanId: span?.id ?? null,
              targetStart: span?.start ?? null,
              targetEnd: span?.end ?? null,
              targetCategory: span?.category ?? null,
            })
          : updateHighlightSnapshotForRemoval({
              snapshot: workingSnapshot,
              matchStart,
              matchEnd,
              nextPrompt: result.updatedPrompt,
              targetSpanId: span?.id ?? null,
              targetStart: span?.start ?? null,
              targetEnd: span?.end ?? null,
              targetCategory: span?.category ?? null,
            });

      if (nextSnapshot) {
        workingSnapshot = nextSnapshot;
      }
    }

    workingSpans = updateSpanListForSuggestion({
      spans: workingSpans,
      matchStart,
      matchEnd,
      replacementText,
      targetSpanId: span?.id ?? null,
      targetStart: span?.start ?? null,
      targetEnd: span?.end ?? null,
      targetCategory: span?.category ?? null,
      removeTarget: edit.type === "removeSpan",
    });

    workingPrompt = result.updatedPrompt;
  });

  if (!workingPrompt || workingPrompt === prompt) {
    return { updatedPrompt: null, updatedSnapshot: null };
  }

  return {
    updatedPrompt: workingPrompt,
    updatedSnapshot: workingSnapshot,
  };
}
