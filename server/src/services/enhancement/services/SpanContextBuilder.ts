import { getParentCategory } from "@shared/taxonomy";
import { hashString } from "@utils/hash";
import { SPAN_CONTEXT_LIMITS } from "@config/spanContextLimits";
import type { LabeledSpan, NearbySpan } from "./types";

export interface SpanContextInput {
  allLabeledSpans: LabeledSpan[];
  nearbySpans: NearbySpan[];
  fullPrompt: string;
  highlightedText: string;
  highlightedCategory: string | null;
  phraseRole: string | null;
}

export interface SpanContextResult {
  spanAnchors: string;
  nearbySpanHints: string;
  spanFingerprint: string | null;
  lockedSpanCategories: string[];
  guidanceSpans: Array<{ category?: string; text?: string }>;
}

/**
 * SpanContextBuilder — Builds span-aware context for enhancement requests.
 *
 * Extracted from EnhancementService to isolate clause-boundary detection,
 * anchor selection, nearby-span filtering, and fingerprint hashing.
 *
 * Single Responsibility: Build structured span context for prompt enhancement.
 */
export class SpanContextBuilder {
  buildSpanContext(input: SpanContextInput): SpanContextResult {
    this._assertInputBounds(input);
    const {
      allLabeledSpans,
      nearbySpans,
      fullPrompt,
      highlightedText,
      highlightedCategory,
      phraseRole,
    } = input;

    const normalizedHighlight = highlightedText.trim().toLowerCase();
    const highlightParent =
      getParentCategory(highlightedCategory) ||
      getParentCategory(phraseRole) ||
      null;

    // Dedupe before text searches and clause lookup. Keep insertion order and
    // confidence/range distinctions so category ranking retains its semantics.
    const uniqueSpans = this._dedupeSpans(allLabeledSpans || []);
    const guidanceSpans = uniqueSpans
      .map((span) => ({
        category: span.category || span.role,
        text: span.text,
      }))
      .filter((span) => span.text && span.text.trim());

    const anchorCandidates = uniqueSpans
      .map((span) => ({
        text: (span.text || "").replace(/\s+/g, " ").trim(),
        category: span.category || span.role || "unknown",
        confidence: typeof span.confidence === "number" ? span.confidence : 0,
        start: typeof span.start === "number" ? span.start : undefined,
        end: typeof span.end === "number" ? span.end : undefined,
      }))
      .filter(
        (span) => span.text && span.text.toLowerCase() !== normalizedHighlight,
      );

    const clauses = this._findClauseBoundaries(fullPrompt);
    const fullPromptLower = fullPrompt.toLowerCase();
    const highlightRange = this._resolveSpanRange(
      fullPrompt,
      highlightedText,
      undefined,
      undefined,
      fullPromptLower,
    );
    const highlightClauseIndex = this._findClauseIndex(clauses, highlightRange);

    const sameClauseAnchors = new Map<
      string,
      { text: string; confidence: number }
    >();
    const promptWideAnchors = new Map<
      string,
      { text: string; confidence: number }
    >();
    for (const span of anchorCandidates) {
      const parent = getParentCategory(span.category) || span.category;
      if (!parent) continue;
      if (highlightParent && parent === highlightParent) continue;

      const spanRange = this._resolveSpanRange(
        fullPrompt,
        span.text,
        span.start,
        span.end,
        fullPromptLower,
      );
      const spanClauseIndex = this._findClauseIndex(clauses, spanRange);
      const anchorPool =
        highlightClauseIndex !== null &&
        spanClauseIndex === highlightClauseIndex
          ? sameClauseAnchors
          : promptWideAnchors;

      const existing = anchorPool.get(parent);
      if (!existing || span.confidence > existing.confidence) {
        anchorPool.set(parent, {
          text: span.text,
          confidence: span.confidence,
        });
      }
    }

    const anchorByCategory = new Map<
      string,
      { text: string; confidence: number }
    >(sameClauseAnchors);
    for (const [category, anchor] of promptWideAnchors.entries()) {
      if (!anchorByCategory.has(category)) {
        anchorByCategory.set(category, anchor);
      }
    }

    const anchorLines = Array.from(anchorByCategory.entries())
      .sort(([, a], [, b]) => b.confidence - a.confidence)
      .slice(0, 4)
      .map(
        ([category, span]) =>
          `- ${category}: "${span.text.replace(/"/g, "'")}"`,
      );

    const nearbyCandidates = (nearbySpans || [])
      .map((span) => ({
        text: (span.text || "").replace(/\s+/g, " ").trim(),
        category: span.category || span.role || "unknown",
        distance:
          typeof span.distance === "number"
            ? span.distance
            : Number.MAX_SAFE_INTEGER,
      }))
      .filter(
        (span) => span.text && span.text.toLowerCase() !== normalizedHighlight,
      )
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 4);

    const nearbyLines = nearbyCandidates.map(
      (span) =>
        `- ${getParentCategory(span.category) || span.category}: "${span.text.replace(/"/g, "'")}"`,
    );

    const lockedSpanCategories = Array.from(
      new Set(
        nearbyCandidates
          .map((span) => getParentCategory(span.category) || span.category)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const fingerprintSeed = [...anchorLines, ...nearbyLines]
      .map((line) => line.replace(/^-\s*/, ""))
      .join("|");
    const spanFingerprint = fingerprintSeed
      ? hashString(fingerprintSeed).toString(36)
      : null;

    return {
      spanAnchors: anchorLines.join("\n"),
      nearbySpanHints: nearbyLines.join("\n"),
      spanFingerprint,
      lockedSpanCategories,
      guidanceSpans,
    };
  }

  _findClauseBoundaries(
    fullPrompt: string,
  ): Array<{ start: number; end: number }> {
    if (typeof fullPrompt !== "string" || !fullPrompt.trim()) {
      return [];
    }

    const clauseRanges: Array<{ start: number; end: number }> = [];
    const delimiterPattern = /[.;]|\bwhile\b|\bas\b|\band\b/gi;
    let clauseStart = 0;
    let match: RegExpExecArray | null;

    while ((match = delimiterPattern.exec(fullPrompt)) !== null) {
      const clauseEnd = match.index;
      const trimmed = this._trimRange(fullPrompt, clauseStart, clauseEnd - 1);
      if (trimmed) {
        clauseRanges.push(trimmed);
      }
      clauseStart = match.index + match[0].length;
    }

    const trailingClause = this._trimRange(
      fullPrompt,
      clauseStart,
      fullPrompt.length - 1,
    );
    if (trailingClause) {
      clauseRanges.push(trailingClause);
    }

    if (clauseRanges.length === 0) {
      const wholeRange = this._trimRange(fullPrompt, 0, fullPrompt.length - 1);
      return wholeRange ? [wholeRange] : [];
    }

    return clauseRanges;
  }

  _trimRange(
    text: string,
    start: number,
    end: number,
  ): { start: number; end: number } | null {
    let trimmedStart = Math.max(0, start);
    let trimmedEnd = Math.min(text.length - 1, end);

    while (trimmedStart <= trimmedEnd && /\s/.test(text[trimmedStart] || "")) {
      trimmedStart += 1;
    }
    while (trimmedEnd >= trimmedStart && /\s/.test(text[trimmedEnd] || "")) {
      trimmedEnd -= 1;
    }

    return trimmedStart <= trimmedEnd
      ? { start: trimmedStart, end: trimmedEnd }
      : null;
  }

  _resolveSpanRange(
    fullPrompt: string,
    spanText: string,
    start?: number,
    end?: number,
    fullPromptLower?: string,
  ): { start: number; end: number } | null {
    if (
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      (end as number) > (start as number)
    ) {
      const boundedStart = Math.max(0, start as number);
      const boundedEnd = Math.min(fullPrompt.length - 1, (end as number) - 1);
      return boundedStart <= boundedEnd
        ? { start: boundedStart, end: boundedEnd }
        : null;
    }

    const normalizedText = spanText.trim().toLowerCase();
    if (!normalizedText) return null;
    const haystack = fullPromptLower ?? fullPrompt.toLowerCase();
    const index = haystack.indexOf(normalizedText);
    if (index < 0) return null;
    return { start: index, end: index + normalizedText.length - 1 };
  }

  _findClauseIndex(
    clauses: Array<{ start: number; end: number }>,
    spanRange: { start: number; end: number } | null,
  ): number | null {
    if (!spanRange || clauses.length === 0) {
      return null;
    }

    // Ranges are sorted and inclusive. Delimiters and trimmed whitespace are
    // gaps, so a start between clauses must still resolve to null.
    let low = 0;
    let high = clauses.length - 1;
    while (low <= high) {
      const middle = low + Math.floor((high - low) / 2);
      const clause = clauses[middle];
      if (!clause) return null;
      if (spanRange.start < clause.start) high = middle - 1;
      else if (spanRange.start > clause.end) low = middle + 1;
      else return middle;
    }

    return null;
  }

  private _dedupeSpans(spans: LabeledSpan[]): LabeledSpan[] {
    const seen = new Set<string>();
    return spans.filter((span) => {
      const key = JSON.stringify([
        span.text.replace(/\s+/g, " ").trim(),
        span.category || span.role,
        span.confidence ?? 0,
        span.start,
        span.end,
      ]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private _assertInputBounds(input: SpanContextInput): void {
    if (input.fullPrompt.length > SPAN_CONTEXT_LIMITS.maxPromptLength ||
        input.highlightedText.length > SPAN_CONTEXT_LIMITS.maxTextLength) {
      throw new RangeError("Span context prompt exceeds the supported length");
    }
    for (const spans of [input.allLabeledSpans, input.nearbySpans]) {
      if (spans.length > SPAN_CONTEXT_LIMITS.maxSpans) {
        throw new RangeError(`Span context must not exceed ${SPAN_CONTEXT_LIMITS.maxSpans} spans per array`);
      }
      for (const span of spans) {
        if (!span.text.trim() || span.text.length > SPAN_CONTEXT_LIMITS.maxTextLength ||
            span.role.length > SPAN_CONTEXT_LIMITS.maxCategoryLength ||
            (span.category?.length ?? 0) > SPAN_CONTEXT_LIMITS.maxCategoryLength) {
          throw new RangeError("Span context text exceeds the supported bounds");
        }
        const { start, end } = span;
        if (start === undefined && end === undefined) continue;
        if (start === undefined || end === undefined || !Number.isInteger(start) ||
            !Number.isInteger(end) || start < 0 || end <= start || end > input.fullPrompt.length) {
          throw new RangeError("Span offsets must form a nonempty range within fullPrompt");
        }
      }
    }
  }
}
