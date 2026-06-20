/**
 * Header and Label Filtering Module
 *
 * Filters out spans that are section headers, category labels, or markdown formatting
 * rather than actual content. These are commonly over-extracted from structured prompts.
 *
 * Problem addressed:
 * - "camera" extracted as span when it's just a section header
 * - "Aspect Ratio" extracted when it's a label, not a value
 * - "## Technical Specs" markdown headers being labeled
 */
import type { SpanLike } from "../types.js";
import { getAllParentCategories } from "#shared/taxonomy.ts";

interface FilterResult {
  spans: SpanLike[];
  notes: string[];
}

/**
 * Patterns that indicate a span is a header/label rather than content
 */
const HEADER_PATTERNS: RegExp[] = [
  // Markdown headers
  /^#{1,6}\s+/,

  // Common spec labels
  /^(aspect ratio|frame rate|resolution|duration|fps|format)\s*:?$/i,

  // Bold section titles like **Camera** or **TECHNICAL SPECS**
  /^\*\*[^*]+\*\*$/,

  // Numbered/bulleted list markers alone
  /^[-•*]\s*$/,
  /^\d+[.)]\s*$/,

  // All-caps section headers (CAMERA, LIGHTING, etc.)
  /^[A-Z][A-Z\s]{2,}$/,
];

/**
 * Section-header words filtered when they appear as standalone spans.
 *
 * The taxonomy parent-category words (camera, lighting, subject, …) are sourced
 * from the canonical TAXONOMY via getAllParentCategories(), so this filter cannot
 * drift when a category is added or renamed — the sibling VisualOnlyFilter derives
 * its meta-labels from the same source. Only words that are NOT taxonomy parent
 * categories are listed explicitly: spec labels are taxonomy *attributes* (not
 * parents) and have no parent-category source to derive from; "composition", the
 * multi-word headers, and the angle labels are not in the taxonomy at all.
 */
const NON_TAXONOMY_HEADER_LABELS = [
  // Section header that is not a taxonomy parent category
  "composition",

  // Technical spec labels (taxonomy attributes, not parent categories)
  "aspect ratio",
  "frame rate",
  "resolution",
  "duration",
  "fps",
  "format",

  // Common multi-word headers
  "technical specs",
  "technical specifications",
  "alternative approaches",
  "alternatives",
  "variations",
  "style reference",
  "film stock",

  // Angle/movement labels (when standalone)
  "eye-level",
  "eye level",
  "high angle",
  "low angle",
];

const STANDALONE_LABELS = new Set<string>([
  ...getAllParentCategories(),
  ...NON_TAXONOMY_HEADER_LABELS,
]);

/**
 * Check if a span text matches header/label patterns
 */
function isHeaderOrLabel(text: string): boolean {
  const trimmed = text.trim();

  // Empty or very short spans are suspicious
  if (trimmed.length < 2) {
    return true;
  }

  // Check against regex patterns
  for (const pattern of HEADER_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }

  // Check against known standalone labels
  const normalized = trimmed
    .toLowerCase()
    .replace(/[:\-_*#]/g, "")
    .trim();
  if (STANDALONE_LABELS.has(normalized)) {
    return true;
  }

  // Check for colon-terminated labels (e.g., "Duration:", "Camera:")
  if (/^[A-Za-z\s]+:\s*$/.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Filter out header and label spans from the extraction results
 *
 * @param spans - Spans to filter
 * @returns Filtered spans and notes about what was removed
 */
export function filterHeaders(spans: SpanLike[]): FilterResult {
  const notes: string[] = [];

  const filtered = spans.filter((span) => {
    const text = typeof span.text === "string" ? span.text : "";

    if (isHeaderOrLabel(text)) {
      notes.push(
        `Dropped header/label "${text}" at ${span.start ?? "?"}-${span.end ?? "?"} (role: ${span.role ?? "unknown"})`,
      );
      return false;
    }

    return true;
  });

  return { spans: filtered, notes };
}

/**
 * Check if text is likely a header (exported for testing)
 */
export function isLikelyHeader(text: string): boolean {
  return isHeaderOrLabel(text);
}
