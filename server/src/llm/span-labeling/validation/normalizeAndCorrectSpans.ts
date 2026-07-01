import { ROLE_SET } from "../config/roles.js";
import { getParentCategory } from "#shared/taxonomy.ts";
import { wordCount } from "../utils/textUtils.js";
import { normalizeSpan } from "../processing/SpanNormalizer.js";
import type { SubstringPositionCache } from "../cache/SubstringPositionCache.js";
import type { SpanValidationError, ValidationPolicy } from "../types.js";
import type {
  SpanInput,
  NormalizedSpan,
} from "../processing/SpanNormalizer.js";

/**
 * Lightly sanitize span text before alignment to improve hit rate on
 * minor formatting differences (quotes, markdown emphasis, extra spaces).
 */
function normalizeSpanTextForLookup(value: string): string {
  if (typeof value !== "string") return "";

  return value
    .replace(/[`"'""]/g, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Validates and corrects span roles.
 * Formerly contained brittle regex overrides; now relies on the upstream model
 * and strict taxonomy validation.
 */
function remapSpanRole(
  text: string,
  role: string,
): { role: string; note?: string } {
  if (!text || !role) return { role };

  // Logic removed: Brittle regex overrides (FOCUS_PATTERN, etc.) were deleting
  // valid spans that didn't match the regex. Trust the model's output or
  // valid taxonomy roles.

  return { role };
}

/**
 * Refine span boundaries to exclude leading/trailing punctuation and leading/trailing prepositions/articles.
 * e.g. "with a woman," -> "woman"
 * e.g. "on 35mm with" -> "35mm"
 */
function refineSpanBoundaries(
  text: string,
  start: number,
  end: number,
): { start: number; end: number; text: string } {
  let newStart = start;
  let newEnd = end;

  // 1. Initial Trim: leading/trailing non-alphanumeric
  // Re-calculate spanText at each step to ensure validity
  let spanText = text.substring(newStart, newEnd);

  const startTrimMatch = spanText.match(/^[^a-zA-Z0-9$]+/);
  if (startTrimMatch) {
    newStart += startTrimMatch[0].length;
  }

  spanText = text.substring(newStart, newEnd);
  const endTrimMatch = spanText.match(/[^a-zA-Z0-9%)]+$/);
  if (endTrimMatch) {
    newEnd -= endTrimMatch[0].length;
  }

  if (newStart >= newEnd) {
    return { start, end, text: text.substring(start, end) };
  }

  // 2. Loop to strip leading prepositions/articles (recursively for "in the", "of a")
  // List: of, with, in, on, at, by, from, to, for, a, an, the
  let changed = true;
  while (changed) {
    changed = false;
    const innerText = text.substring(newStart, newEnd);
    const leadingMatch = innerText.match(
      /^(of|with|in|on|at|by|from|to|for|a|an|the)\s+/i,
    );
    if (leadingMatch) {
      newStart += leadingMatch[0].length;
      changed = true;
    }
  }

  // 3. Loop to strip trailing prepositions/articles (e.g. "camera with")
  changed = true;
  while (changed) {
    changed = false;
    const innerText = text.substring(newStart, newEnd);
    const trailingMatch = innerText.match(
      /\s+(of|with|in|on|at|by|from|to|for|a|an|the)$/i,
    );
    if (trailingMatch) {
      newEnd -= trailingMatch[0].length;
      changed = true;
    }
  }

  // 4. Final safety trim for any exposed punctuation after word removal
  // e.g. "end," -> "end" if punctuation wasn't caught before
  spanText = text.substring(newStart, newEnd);
  const finalTrimMatch = spanText.match(/[^a-zA-Z0-9%)]+$/);
  if (finalTrimMatch) {
    newEnd -= finalTrimMatch[0].length;
  }

  return {
    start: newStart,
    end: newEnd,
    text: text.substring(newStart, newEnd),
  };
}

export interface NormalizeAndCorrectResult {
  sanitized: NormalizedSpan[];
  errors: SpanValidationError[];
  notes: string[];
}

/**
 * Phase 1: Normalize and correct individual spans
 *
 * Handles:
 * - Text field validation
 * - Index auto-correction using position cache
 * - Role normalization and validation
 * - Word count checks for non-technical spans
 *
 * @param spans - Raw spans from LLM
 * @param text - Source text
 * @param policy - Validation policy
 * @param cache - Position cache for span correction
 * @param lenient - If true, drops invalid spans instead of erroring
 * @returns Normalized spans with errors and notes
 */
export function normalizeAndCorrectSpans(
  spans: unknown[],
  text: string,
  policy: ValidationPolicy,
  cache: SubstringPositionCache,
  lenient: boolean,
): NormalizeAndCorrectResult {
  const errors: SpanValidationError[] = [];
  const validationNotes: string[] = [];
  const autoFixNotes: string[] = [];
  const sanitized: NormalizedSpan[] = [];
  const claimedKeys = new Set<string>();

  spans.forEach((originalSpan, index) => {
    const label = `span[${index}]`;
    const span = originalSpan
      ? { ...(originalSpan as Record<string, unknown>) }
      : originalSpan;

    if (!span || typeof span !== "object") {
      if (!lenient)
        errors.push({
          message: `${label} invalid span object`,
          kind: "retryable",
        });
      else validationNotes.push(`${label} dropped: invalid span object`);
      return;
    }

    const spanObj = span as Record<string, unknown>;

    // Check for text field
    if (typeof spanObj.text !== "string" || spanObj.text.length === 0) {
      if (!lenient)
        errors.push({ message: `${label} missing text`, kind: "retryable" });
      else validationNotes.push(`${label} dropped: missing text`);
      return;
    }

    // Find correct indices in source text
    const preferredStart = Number.isInteger(spanObj.start)
      ? (spanObj.start as number)
      : 0;
    let corrected: { start: number; end: number } | null = null;

    // 1. Try exact matches (all occurrences) and pick best unclaimed
    const exactMatches = cache.findAllMatches(text, spanObj.text);
    if (exactMatches.length > 0) {
      // Sort by distance to preferredStart
      exactMatches.sort(
        (a, b) =>
          Math.abs(a.start - preferredStart) -
          Math.abs(b.start - preferredStart),
      );

      // Pick first unclaimed
      for (const m of exactMatches) {
        const key = `${m.start}:${m.end}`;
        if (!claimedKeys.has(key)) {
          corrected = m;
          claimedKeys.add(key);
          break;
        }
      }

      // If all claimed, fallback to best one (will be deduped later if exact duplicate)
      if (!corrected) {
        const fallbackMatch = exactMatches[0];
        if (fallbackMatch) {
          corrected = fallbackMatch;
        }
      }
    }

    // 2. Retry with normalized text if no exact match found
    if (!corrected) {
      const cleanedText = normalizeSpanTextForLookup(spanObj.text);
      if (cleanedText && cleanedText !== spanObj.text) {
        corrected = cache.findBestMatch(text, cleanedText, preferredStart);
      }
    }

    // 3. Last-resort case-insensitive search to catch minor casing mismatches
    if (!corrected) {
      const loweredSource = text.toLowerCase();
      const loweredTarget = normalizeSpanTextForLookup(
        spanObj.text,
      ).toLowerCase();
      const idx = loweredTarget ? loweredSource.indexOf(loweredTarget) : -1;
      if (idx !== -1) {
        corrected = { start: idx, end: idx + loweredTarget.length };
      }
    }

    if (!corrected) {
      if (!lenient) {
        errors.push({
          message: `${label} text "${spanObj.text}" not found in source`,
          kind: "retryable",
        });
      } else {
        validationNotes.push(`${label} dropped: text not found in source`);
      }
      return;
    }

    // If we found a match via fallback (2 or 3), mark it as claimed
    if (corrected) {
      claimedKeys.add(`${corrected.start}:${corrected.end}`);
    }

    // Refine boundaries (trim punctuation/prepositions)
    const refined = refineSpanBoundaries(text, corrected.start, corrected.end);

    // Apply auto-corrected indices
    if (spanObj.start !== refined.start || spanObj.end !== refined.end) {
      autoFixNotes.push(
        `${label} indices adjusted: ${spanObj.start}-${spanObj.end} -> ${refined.start}-${refined.end} ("${refined.text}")`,
      );
    }

    // Create corrected span (immutable)
    // Use refined.text instead of original spanObj.text
    const spanText = refined.text;
    const spanRole =
      typeof spanObj.role === "string"
        ? spanObj.role
        : String(spanObj.role ?? "");
    const remapped = remapSpanRole(spanText, spanRole);
    if (remapped.note) {
      autoFixNotes.push(`${label} ${remapped.note}`);
    }

    const correctedSpan: SpanInput = {
      text: spanText,
      start: refined.start,
      end: refined.end,
      role: remapped.role,
      ...(typeof spanObj.confidence === "number"
        ? { confidence: spanObj.confidence }
        : {}),
    };

    // Normalize role and confidence (includes ID generation)
    const normalized = normalizeSpan(correctedSpan, text, lenient);
    if (!normalized || !normalized.role) {
      if (!lenient) {
        errors.push({
          message: `${label} role "${spanObj.role}" is not in the allowed set (${Array.from(ROLE_SET).join(", ")})`,
          kind: "retryable",
        });
      }
      return;
    }

    // Check if role is a technical category (should be exempt from word limit)
    const isExemptCategory =
      normalized.role.startsWith("technical") ||
      normalized.role.startsWith("style") ||
      normalized.role.startsWith("camera") ||
      normalized.role.startsWith("audio") ||
      normalized.role.startsWith("lighting") ||
      normalized.role === "Specs" || // Keep legacy for safety
      normalized.role === "Style";

    const parentCategory =
      getParentCategory(normalized.role) || normalized.role;
    const adjustedLimit =
      parentCategory === "action" || parentCategory === "environment"
        ? Math.max(policy.nonTechnicalWordLimit ?? 0, 12)
        : (policy.nonTechnicalWordLimit ?? 0);

    // Check word limit for non-exempt spans only
    if (
      !isExemptCategory &&
      adjustedLimit > 0 &&
      wordCount(normalized.text) > adjustedLimit
    ) {
      if (!lenient) {
        // Terminal: the repair prompt forbids changing span text, so an
        // over-limit span can only ever be resolved by dropping it.
        errors.push({
          message: `${label} exceeds non-technical word limit (${adjustedLimit} words)`,
          kind: "terminal",
        });
      } else {
        validationNotes.push(
          `${label} dropped: exceeds non-technical word limit`,
        );
      }
      return;
    }

    sanitized.push(normalized);
  });

  return {
    sanitized,
    errors,
    notes: [...validationNotes, ...autoFixNotes],
  };
}
