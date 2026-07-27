/**
 * Adjacent Span Merger Module
 *
 * Merges adjacent spans that belong to the same parent category.
 * Fixes LLM fragmentation issues like "Action" + "Shot" → "Action Shot"
 */
import { getParentCategory } from "#shared/taxonomy.ts";
import type { SpanLike } from "../types.js";

interface MergeOptions {
  maxMergedWords?: number;
}

interface MergeResult {
  spans: SpanLike[];
  notes: string[];
}

/**
 * Check if two roles are compatible for merging
 * Compatible means they share the same parent category
 * @param {string} role1 - First role
 * @param {string} role2 - Second role
 * @returns {boolean} True if compatible
 */
function areRolesCompatible(role1: string, role2: string): boolean {
  const parent1 = getParentCategory(role1);
  const parent2 = getParentCategory(role2);
  return parent1 !== null && parent1 === parent2;
}

/**
 * Check if the gap between two spans contains only mergeable characters
 * Mergeable: whitespace, comma, hyphen, underscore
 * @param {string} gap - The text between spans
 * @returns {boolean} True if gap is mergeable
 */
function isMergeableGap(gap: string): boolean {
  if (!gap || gap.length === 0) return true;
  if (gap.length > 3) return false; // Don't merge if gap is too large

  // Allow only whitespace, comma, hyphen, underscore between spans
  return /^[\s,\-_]+$/.test(gap);
}

/**
 * Select the more specific role between two roles
 * Prefers attribute roles (e.g., "shot.type") over parent roles (e.g., "shot")
 * @param {string} role1 - First role
 * @param {string} role2 - Second role
 * @returns {string} The more specific role
 */
function selectMoreSpecificRole(role1: string, role2: string): string {
  const hasAttribute1 = role1.includes(".");
  const hasAttribute2 = role2.includes(".");

  // Prefer the one with an attribute
  if (hasAttribute1 && !hasAttribute2) return role1;
  if (hasAttribute2 && !hasAttribute1) return role2;

  // If both have attributes or neither, prefer the first one
  return role1;
}

/**
 * Count words in a text string
 * @param {string} text - Text to count words in
 * @returns {number} Word count
 */
function countWords(text: unknown): number {
  if (!text || typeof text !== "string") return 0;
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

/**
 * Merge adjacent spans with compatible categories
 *
 * @param {Array} spans - Sorted spans array (must be sorted by start position)
 * @param {string} sourceText - Original text for gap analysis
 * @param {Object} options - Merge options
 * @param {number} options.maxMergedWords - Maximum words in merged span (default: 8)
 * @returns {{spans: Array, notes: Array}}
 */
export function mergeAdjacentSpans(
  spans: SpanLike[] | null | undefined,
  sourceText: string,
  options: MergeOptions = {},
): MergeResult {
  const { maxMergedWords = 8 } = options;

  if (!spans || spans.length <= 1) {
    return { spans: spans || [], notes: [] };
  }

  const merged: SpanLike[] = [];
  const notes: string[] = [];
  let i = 0;

  while (i < spans.length) {
    const firstSpan = spans[i];
    if (!firstSpan) {
      i++;
      continue;
    }
    let current: SpanLike = { ...firstSpan };
    let mergeCount = 0;

    // Try to merge with subsequent spans
    while (i + 1 < spans.length) {
      const next = spans[i + 1];
      if (!next) break;

      // Check if spans are adjacent
      const gap = sourceText.substring(current.end, next.start);

      if (!isMergeableGap(gap)) {
        break; // Gap too large or contains invalid characters
      }

      // Check if roles are compatible
      if (typeof current.role !== "string" || typeof next.role !== "string") {
        break;
      }
      if (!areRolesCompatible(current.role, next.role)) {
        break; // Different parent categories
      }

      // Check if merged span would be too long
      const mergedText = sourceText.substring(current.start, next.end);
      if (countWords(mergedText) > maxMergedWords) {
        break; // Would exceed word limit
      }

      // Merge the spans
      const currentConfidence =
        typeof current.confidence === "number" ? current.confidence : 0;
      const nextConfidence =
        typeof next.confidence === "number" ? next.confidence : 0;
      const mergedRole = selectMoreSpecificRole(current.role, next.role);
      current = {
        ...current,
        text: mergedText,
        end: next.end,
        role: mergedRole,
        confidence: (currentConfidence + nextConfidence) / 2,
        // Preserve the ID from the first span
      };

      mergeCount++;
      i++;
    }

    if (mergeCount > 0) {
      notes.push(
        `Merged ${mergeCount + 1} adjacent ${getParentCategory(current.role) ?? ""} spans: "${current.text}"`,
      );
    }

    merged.push(current);
    i++;
  }

  return { spans: merged, notes };
}
