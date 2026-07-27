import { sha256Hex } from "@utils/hash";
import { VALID_CATEGORIES, TAXONOMY } from "#shared/taxonomy.ts";
import { clamp01 } from "../utils/textUtils.js";

export interface SpanInput {
  text: string;
  start: number;
  end: number;
  role: string;
  confidence?: number;
}

export interface NormalizedSpan {
  text: string;
  start: number;
  end: number;
  role: string;
  confidence: number;
  id?: string;
}

/**
 * Span normalization module
 *
 * Responsible for normalizing role values and confidence scores.
 * Applies validation rules and defaults for invalid values.
 */

/**
 * Generate a stable ID for a span
 * IDs are deterministic and based on text content and position
 *
 * @param {Object} span - The span to generate ID for
 * @param {string} sourceText - The full source text (for hashing)
 * @returns {string} Stable span ID
 */
function generateSpanId(span: SpanInput, sourceText: string): string {
  // Hash the source text to create a deterministic prefix. 8 hex chars is
  // enough for uniqueness within a prompt since span coordinates also
  // participate in the final id.
  const textHash = sha256Hex(sourceText, 8);

  // Combine hash with span coordinates and role for uniqueness
  return `${textHash}-${span.start}-${span.end}-${span.role}`;
}

/**
 * Normalize a single span's role and confidence
 *
 * In strict mode (lenient=false), returns null for invalid roles.
 * In lenient mode (lenient=true), assigns 'subject' for invalid roles.
 *
 * @param {Object} span - The span to normalize
 * @param {string} span.text - Span text
 * @param {number} span.start - Start position
 * @param {number} span.end - End position
 * @param {string} span.role - Role to validate (taxonomy ID)
 * @param {number} span.confidence - Confidence to clamp
 * @param {string} sourceText - The full source text (for ID generation)
 * @param {boolean} lenient - If true, assigns 'subject' for invalid roles; if false, returns null
 * @returns {Object|null} Normalized span with role, confidence, and stable ID, or null if invalid
 */
export function normalizeSpan(
  span: SpanInput,
  sourceText: string,
  lenient = false,
): NormalizedSpan | null {
  const confidence = clamp01(span.confidence);

  // Validate role against taxonomy
  const role =
    typeof span.role === "string" && VALID_CATEGORIES.has(span.role)
      ? span.role
      : lenient
        ? TAXONOMY.SUBJECT.id
        : null;

  // Return null if role is invalid in strict mode
  if (role === null) {
    return null;
  }

  // Create normalized span with role (needed for ID generation)
  const normalizedSpan: NormalizedSpan = {
    text: span.text,
    start: span.start,
    end: span.end,
    role,
    confidence,
  };

  // Generate stable ID
  normalizedSpan.id = generateSpanId(normalizedSpan, sourceText);

  return normalizedSpan;
}
