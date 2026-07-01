/**
 * Span Validation Utilities
 *
 * Pure functions for validating and sanitizing span data.
 * Extracted from useEnhancementSuggestions.js to eliminate duplication.
 *
 * Architecture: Pure utility functions (no dependencies)
 * Pattern: Single responsibility - validation only
 */

interface SpanInput {
  quote?: string;
  text?: string;
  role?: string;
  category?: string;
  confidence?: number;
  start?: number;
  end?: number;
  [key: string]: unknown;
}

export interface NormalizedSpan {
  text: string;
  role: string;
  category: string;
  confidence?: number;
  start?: number;
  end?: number;
}

/**
 * Check if a span object is valid
 */
export function isValidSpan(span: unknown): span is SpanInput {
  if (!span || typeof span !== "object") {
    return false;
  }

  const spanObj = span as SpanInput;
  const text = spanObj.quote || spanObj.text || "";
  return typeof text === "string" && text.trim().length > 0;
}

/**
 * Filter array of spans to only valid ones
 */
export function sanitizeSpans(spans: unknown[]): SpanInput[] {
  if (!Array.isArray(spans)) {
    return [];
  }

  return spans.filter(isValidSpan);
}

/**
 * Validate and normalize a span to standard format
 */
export function normalizeSpan(span: unknown): NormalizedSpan | null {
  if (!isValidSpan(span)) {
    return null;
  }

  const text = (span.quote || span.text || "").trim();

  // Public span category contract: `category` is normalized server-side and
  // always valid. A span without one is structurally invalid — drop it
  // rather than inventing the invalid "unknown".
  if (!span.category) {
    return null;
  }

  const normalized: NormalizedSpan = {
    text,
    role: span.category,
    category: span.category,
  };

  if (typeof span.confidence === "number") {
    normalized.confidence = span.confidence;
  }
  if (typeof span.start === "number") {
    normalized.start = span.start;
  }
  if (typeof span.end === "number") {
    normalized.end = span.end;
  }

  return normalized;
}
