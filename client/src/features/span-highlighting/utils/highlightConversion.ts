/**
 * Highlight Conversion Utility
 * Converts labeled spans from the LLM into highlight data structures
 * Now uses unified taxonomy system with namespaced IDs
 */

import { TAXONOMY, normalizeRole } from "@shared/taxonomy";
import { logger } from "@/services/LoggingService";

const log = logger.child("highlightConversion");

const LLM_PARSER_VERSION = "llm-v2-taxonomy";
const CONTEXT_WINDOW_CHARS = 20;

export interface LLMSpan {
  id?: string;
  role?: string;
  category?: string; // API returns 'category', legacy responses may have 'role'
  start: number;
  end: number;
  confidence?: number;
  [key: string]: unknown;
}

export interface Highlight {
  id: string;
  category: string;
  role: string;
  start: number;
  end: number;
  displayStart: number;
  displayEnd: number;
  quote: string;
  displayQuote: string;
  leftCtx: string;
  rightCtx: string;
  displayLeftCtx: string;
  displayRightCtx: string;
  source: string;
  confidence?: number;
  validatorPass: boolean;
  startGrapheme?: number;
  endGrapheme?: number;
  version: string;
  [key: string]: unknown;
}

export interface CanonicalText {
  graphemeIndexForCodeUnit?: (index: number) => number | undefined;
}

/**
 * Get the parent category from a role/category string
 * e.g., "environment.location" → "environment"
 * e.g., "shot.type" → "shot"
 */
function getParentCategory(category: string | null | undefined): string {
  if (!category || typeof category !== "string") return "";
  const dotIndex = category.indexOf(".");
  return dotIndex > 0 ? category.substring(0, dotIndex) : category;
}

/**
 * Check if two categories are compatible for merging
 * Compatible means they share the same parent category
 */
function areCategoriesCompatible(
  category1: string,
  category2: string,
): boolean {
  const parent1 = getParentCategory(category1);
  const parent2 = getParentCategory(category2);
  return parent1 === parent2 && parent1 !== "";
}

/**
 * Helper to merge adjacent spans that were split by newlines/whitespace
 * Uses parent category matching to be consistent with server-side merge
 */
function mergeFragmentedSpans(
  highlights: Highlight[],
  fullText: string,
): Highlight[] {
  if (highlights.length < 2) return highlights;

  const merged: Highlight[] = [];
  let current = highlights[0];
  if (!current) return highlights;

  for (let i = 1; i < highlights.length; i++) {
    const next = highlights[i];
    if (!next) continue;

    // 1. Must have compatible categories (same parent category)
    // This matches the server-side merge logic
    const compatibleCategories = areCategoriesCompatible(
      current.category,
      next.category,
    );

    // 2. Must be adjacent (only whitespace/newlines in between)
    // We assume highlights are already sorted by start
    const gapText = fullText.slice(current.end, next.start);
    const isAdjacent = !gapText.trim(); // True if gap is empty or just whitespace

    if (compatibleCategories && isAdjacent) {
      // MERGE THEM
      // Extend current span to include the next one
      current.end = next.end;
      current.displayEnd = next.end;
      current.quote = fullText.slice(current.start, current.end);
      current.displayQuote = current.quote;

      // Keep the more specific category (one with a dot)
      if (next.category.includes(".") && !current.category.includes(".")) {
        current.category = next.category;
        current.role = next.role;
      }

      // Inherit the right context from the later span
      current.rightCtx = next.rightCtx;
      current.displayRightCtx = next.displayRightCtx;
      if (typeof next.endGrapheme === "number") {
        current.endGrapheme = next.endGrapheme;
      }

      // Combine IDs for debugging (optional)
      current.id = `${current.id}_merged`;
    } else {
      // No merge, push current and move to next
      merged.push(current);
      current = next;
    }
  }
  merged.push(current);

  return merged;
}

/**
 * Converts labeled spans from the LLM into highlight objects
 */
export const convertLabeledSpansToHighlights = ({
  spans,
  text,
  canonical,
}: {
  spans: LLMSpan[];
  text: string;
  canonical?: CanonicalText;
}): Highlight[] => {
  if (import.meta.env.DEV) {
    log.debug("convertLabeledSpansToHighlights input", {
      spanCount: Array.isArray(spans) ? spans.length : 0,
      textLength: text?.length,
      sampleSpans: spans?.slice(0, 3),
    });
  }

  if (!Array.isArray(spans) || !text) {
    return [];
  }

  // 1. Convert raw LLM spans to highlight objects
  const rawHighlights = spans
    .map((span, index): Highlight | null => {
      if (!span || typeof span !== "object") {
        if (import.meta.env.DEV) {
          log.debug("convertLabeledSpansToHighlights invalid span object", {
            span,
          });
        }
        return null;
      }

      // Normalize role to valid taxonomy ID (handles both new and legacy formats)
      // API returns 'category', but legacy responses may have 'role'
      const rawRole =
        typeof span.category === "string"
          ? span.category
          : typeof span.role === "string"
            ? span.role
            : TAXONOMY.SUBJECT.id;
      const category = normalizeRole(rawRole);
      const role = rawRole;

      const start = Number(span.start);
      const end = Number(span.end);

      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        if (import.meta.env.DEV) {
          log.debug("convertLabeledSpansToHighlights invalid indices", {
            start,
            end,
            span,
          });
        }
        return null;
      }

      const clampedStart = Math.max(0, Math.min(text.length, start));
      const clampedEnd = Math.max(clampedStart, Math.min(text.length, end));
      if (clampedEnd <= clampedStart) {
        if (import.meta.env.DEV) {
          log.debug("convertLabeledSpansToHighlights clamped empty range", {
            clampedStart,
            clampedEnd,
            span,
          });
        }
        return null;
      }

      const slice = text.slice(clampedStart, clampedEnd);
      if (!slice) {
        if (import.meta.env.DEV) {
          log.debug("convertLabeledSpansToHighlights empty slice", {
            clampedStart,
            clampedEnd,
            span,
          });
        }
        return null;
      }

      const leftCtx = text.slice(
        Math.max(0, clampedStart - CONTEXT_WINDOW_CHARS),
        clampedStart,
      );
      const rightCtx = text.slice(
        clampedEnd,
        Math.min(text.length, clampedEnd + CONTEXT_WINDOW_CHARS),
      );

      const startGrapheme = canonical?.graphemeIndexForCodeUnit
        ? canonical.graphemeIndexForCodeUnit(clampedStart)
        : undefined;
      const endGrapheme = canonical?.graphemeIndexForCodeUnit
        ? canonical.graphemeIndexForCodeUnit(clampedEnd)
        : undefined;

      return {
        id: span.id ?? `llm_${category}_${index}_${clampedStart}_${clampedEnd}`,
        category,
        role,
        start: clampedStart,
        end: clampedEnd,
        displayStart: clampedStart,
        displayEnd: clampedEnd,
        quote: slice,
        displayQuote: slice,
        leftCtx,
        rightCtx,
        displayLeftCtx: leftCtx,
        displayRightCtx: rightCtx,
        source: "llm",
        validatorPass: true,
        version: LLM_PARSER_VERSION,
        ...(typeof span.confidence === "number"
          ? { confidence: span.confidence }
          : {}),
        ...(typeof startGrapheme === "number" ? { startGrapheme } : {}),
        ...(typeof endGrapheme === "number" ? { endGrapheme } : {}),
      };
    })
    .filter((highlight): highlight is Highlight => highlight !== null)
    .sort((a, b) => {
      if (a.start === b.start) {
        return a.end - b.end;
      }
      return a.start - b.start;
    });

  // 2. Merge fragmented spans before returning
  const merged = mergeFragmentedSpans(rawHighlights, text);

  if (import.meta.env.DEV) {
    log.debug("convertLabeledSpansToHighlights result", {
      rawCount: rawHighlights.length,
      mergedCount: merged.length,
    });
  }

  return merged;
};
