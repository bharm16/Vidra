/**
 * Span Processing Utilities
 *
 * Business logic for processing labeled spans.
 * Extracted from useEnhancementSuggestions.js.
 *
 * Architecture: Pure utility functions
 * Pattern: Single responsibility - span processing logic
 */

import {
  sanitizeSpans,
  normalizeSpan,
  type NormalizedSpan,
} from "./spanValidation";

export interface SpanMetadata {
  start?: number;
  end?: number;
  [key: string]: unknown;
}

export interface SpanWithText {
  start?: number;
  end?: number;
  quote?: string;
  text?: string;
  role?: string;
  category?: string;
  confidence?: number;
  [key: string]: unknown;
}

export interface NearbySpan {
  text: string;
  role: string;
  category: string;
  confidence?: number;
  distance: number;
  position: "before" | "after";
  start: number;
  end: number;
}

export interface SpanContext {
  simplifiedSpans: NormalizedSpan[];
  nearbySpans: NearbySpan[];
}

interface SpanFingerprintOptions {
  maxSpans?: number;
  maxNearby?: number;
  maxTextLength?: number;
}

/**
 * Find spans that are near the selected text
 */
export function findNearbySpans(
  metadata: SpanMetadata | null | undefined,
  allSpans: SpanWithText[],
  threshold = 100,
): NearbySpan[] {
  if (!metadata || !Array.isArray(allSpans) || allSpans.length === 0) {
    return [];
  }

  const selectedStart = metadata.start ?? -1;
  const selectedEnd = metadata.end ?? -1;

  if (selectedStart < 0 || selectedEnd < 0) {
    return [];
  }

  type SpanWithRange = SpanWithText & { start: number; end: number };

  return allSpans
    .filter((span): span is SpanWithRange => {
      if (typeof span.start !== "number" || typeof span.end !== "number") {
        return false;
      }
      // Don't include the selected span itself
      if (span.start === selectedStart && span.end === selectedEnd) {
        return false;
      }

      // Calculate distance
      const distanceBefore = selectedStart - span.end;
      const distanceAfter = span.start - selectedEnd;

      // Include if within threshold (before or after)
      return (
        (distanceBefore >= 0 && distanceBefore <= threshold) ||
        (distanceAfter >= 0 && distanceAfter <= threshold)
      );
    })
    .map((span) => {
      // Calculate exact distance
      const distanceBefore = selectedStart - span.end;
      const distanceAfter = span.start - selectedEnd;
      const distance = distanceBefore >= 0 ? distanceBefore : distanceAfter;
      const position: "before" | "after" =
        distanceBefore >= 0 ? "before" : "after";

      // Public span category contract: `category` is normalized server-side
      // and always valid; spans without one are dropped below.
      return {
        text: (span.quote || span.text || "").trim(),
        role: span.category ?? "",
        category: span.category ?? "",
        distance,
        position,
        start: span.start,
        end: span.end,
        ...(typeof span.confidence === "number"
          ? { confidence: span.confidence }
          : {}),
      };
    })
    .filter((span) => span.text && span.category) // Drop empty text or category
    .sort((a, b) => a.distance - b.distance); // Sort by proximity
}

/**
 * Build simplified span objects for API payload
 * Defensive mapping with validation
 */
export function buildSimplifiedSpans(spans: unknown[]): NormalizedSpan[] {
  const sanitized = sanitizeSpans(spans);

  return sanitized
    .map(normalizeSpan)
    .filter(
      (span): span is NormalizedSpan =>
        span !== null && typeof span.text === "string" && span.text.length > 0,
    );
}

/**
 * Prepare span context for API request
 */
export function prepareSpanContext(
  metadata: SpanMetadata | null | undefined,
  allLabeledSpans: unknown[],
): SpanContext {
  // Sanitize input spans
  const sanitizedSpans = sanitizeSpans(allLabeledSpans);

  // Build simplified spans
  const simplifiedSpans = buildSimplifiedSpans(sanitizedSpans);

  // Find nearby spans
  const nearbySpans = findNearbySpans(metadata, sanitizedSpans, 100).filter(
    (span) => span.text && span.text.length > 0,
  );

  return {
    simplifiedSpans,
    nearbySpans,
  };
}

/**
 * Build a stable fingerprint for span context (for caching/deduplication)
 */
export function buildSpanFingerprint(
  simplifiedSpans: NormalizedSpan[],
  nearbySpans: NearbySpan[],
  options: SpanFingerprintOptions = {},
): string {
  const { maxSpans = 6, maxNearby = 4, maxTextLength = 40 } = options;

  const normalize = (value: string): string =>
    value.trim().toLowerCase().slice(0, maxTextLength);

  const spanPart = simplifiedSpans
    .slice(0, maxSpans)
    .map((span) => `${span.category || span.role}:${normalize(span.text)}`)
    .join("|");

  const nearbyPart = nearbySpans
    .slice(0, maxNearby)
    .map((span) => `${span.category || span.role}:${normalize(span.text)}`)
    .join("|");

  const combined = [spanPart, nearbyPart].filter(Boolean).join("||");
  return combined;
}
