/**
 * Writing a camera choice into the creator's words.
 *
 * ADR-0022 decision 7: the chosen camera path "lands in the input as an
 * editable camera span that replaces rather than accumulates, per ADR-0010's
 * truth contract". There is no other client-side span writer — spans are
 * derived from text by the labeling pipeline — so this composes the two
 * pieces that already exist: `relocateQuote` (the matcher behind
 * `applySuggestionToPrompt`, which relocates a phrase that may have drifted)
 * and the taxonomy (which decides what counts as camera text).
 *
 * The only classification here is a taxonomy parent lookup on a span the
 * labeler already categorized. Nothing inspects the words themselves.
 */

import { getParentCategory, TAXONOMY } from "@shared/taxonomy";
import { relocateQuote } from "@utils/textQuoteRelocator";
import type { LockedSpan } from "@/features/prompt-optimizer/types";

/** The slice of a labeled span this writer needs (HighlightSnapshot shape). */
export interface CameraPromptSpan {
  start: number;
  end: number;
  category: string;
}

export type CameraDirectionConflict = "locked" | "existing-camera-span";

export interface CameraDirectionSpan {
  start: number;
  end: number;
  category: string;
}

export type CameraDirectionWrite =
  | { outcome: "written"; prompt: string; span: CameraDirectionSpan }
  | {
      outcome: "conflict";
      conflict: CameraDirectionConflict;
      conflictText: string;
    };

export interface WriteCameraDirectionInput {
  /** The creator's current words. */
  prompt: string;
  /** The camera direction sentence to write. */
  direction: string;
  /** The direction this writer last wrote, if any — its replace target. */
  previousDirection?: string | undefined;
  /** Labeled spans of `prompt`, used to find camera words we did not write. */
  spans?: readonly CameraPromptSpan[] | undefined;
  /** Spans the creator locked against rewriting. Never overwritten. */
  lockedSpans?: readonly LockedSpan[] | undefined;
  /**
   * Replace camera words the creator wrote themselves. Off by default: an
   * unasked-for overwrite is exactly the silent behavior D7 forbids, so the
   * caller surfaces the conflict first and only sets this on an explicit
   * "replace those words".
   */
  replaceExistingCameraSpan?: boolean | undefined;
}

interface ReplaceTarget {
  start: number;
  end: number;
  text: string;
  /** True when the target is the direction this writer previously wrote. */
  isOwn: boolean;
}

const isCameraSpan = (span: CameraPromptSpan): boolean =>
  getParentCategory(span.category) === TAXONOMY.CAMERA.id;

const isLocked = (
  lockedSpans: readonly LockedSpan[],
  text: string,
): boolean => {
  const normalized = text.trim();
  return lockedSpans.some(
    (locked) => (locked.text ?? "").trim() === normalized,
  );
};

const findReplaceTarget = (
  prompt: string,
  previousDirection: string | undefined,
  spans: readonly CameraPromptSpan[],
): ReplaceTarget | null => {
  const previous = previousDirection?.trim();
  if (previous) {
    const match = relocateQuote({ text: prompt, quote: previous });
    if (match) {
      return {
        start: match.start,
        end: match.end,
        text: prompt.slice(match.start, match.end),
        isOwn: true,
      };
    }
  }

  const cameraSpan = spans.find(isCameraSpan);
  if (!cameraSpan) return null;

  return {
    start: cameraSpan.start,
    end: cameraSpan.end,
    text: prompt.slice(cameraSpan.start, cameraSpan.end),
    isOwn: false,
  };
};

export function writeCameraDirection({
  prompt,
  direction,
  previousDirection,
  spans = [],
  lockedSpans = [],
  replaceExistingCameraSpan = false,
}: WriteCameraDirectionInput): CameraDirectionWrite {
  const target = findReplaceTarget(prompt, previousDirection, spans);

  if (target) {
    if (isLocked(lockedSpans, target.text)) {
      return {
        outcome: "conflict",
        conflict: "locked",
        conflictText: target.text,
      };
    }
    if (!target.isOwn && !replaceExistingCameraSpan) {
      return {
        outcome: "conflict",
        conflict: "existing-camera-span",
        conflictText: target.text,
      };
    }

    const updatedPrompt =
      prompt.slice(0, target.start) + direction + prompt.slice(target.end);
    return {
      outcome: "written",
      prompt: updatedPrompt,
      span: {
        start: target.start,
        end: target.start + direction.length,
        category: TAXONOMY.CAMERA.id,
      },
    };
  }

  const base = prompt.trimEnd();
  const updatedPrompt = base.length > 0 ? `${base} ${direction}` : direction;
  const start = updatedPrompt.length - direction.length;

  return {
    outcome: "written",
    prompt: updatedPrompt,
    span: { start, end: updatedPrompt.length, category: TAXONOMY.CAMERA.id },
  };
}
