import { mergeAdjacentSpans } from "../processing/AdjacentSpanMerger.js";
import { deduplicateSpans } from "../processing/SpanDeduplicator.js";
import { resolveOverlaps } from "../processing/OverlapResolver.js";
import { filterHeaders } from "../processing/HeaderFilter.js";
import { filterNonVisualSpans } from "../processing/VisualOnlyFilter.js";
import { filterByConfidence } from "../processing/ConfidenceFilter.js";
import { truncateToMaxSpans } from "../processing/SpanTruncator.js";
import { normalizeAndCorrectSpans } from "./normalizeAndCorrectSpans.js";
import type {
  ProcessingOptions,
  ValidationPolicy,
  ValidationResult,
  LLMSpan,
} from "../types.js";
import type { SubstringPositionCache } from "../cache/SubstringPositionCache.js";

/**
 * Comprehensive span validation and processing
 *
 * This is the core validation orchestrator that:
 * 1. Validates individual spans (text, indices, role)
 * 2. Auto-corrects indices using position cache
 * 3. Applies processing pipeline (dedupe, overlap, filter, truncate)
 * 4. Supports strict and lenient validation modes
 */

/**
 * Validate and process spans with auto-correction and filtering
 *
 * Phase 1: Individual span validation & auto-correction
 * Phase 2: Sorting by position
 * Phase 2.5: Merge adjacent spans with compatible categories
 * Phase 3: Deduplication
 * Phase 4: Overlap resolution
 * Phase 5: Confidence filtering
 * Phase 6: Truncation to max spans
 *
 * @param {Object} params
 * @param {Array} params.spans - Raw spans from LLM
 * @param {Object} params.meta - Metadata from LLM response
 * @param {string} params.text - Source text
 * @param {Object} params.policy - Validation policy
 * @param {Object} params.options - Processing options
 * @param {number} params.attempt - Validation attempt (1 = strict, 2 = lenient)
 * @param {SubstringPositionCache} params.cache - Position cache for span correction
 * @param {boolean} params.isAdversarial - Whether input was flagged as adversarial
 * @param {string} params.analysisTrace - Chain-of-thought reasoning from LLM
 * @returns {Object} {ok: boolean, errors: Array, result: {spans: Array, meta: Object, analysisTrace: string}}
 */
interface MetaLike {
  version?: string;
  notes?: string | string[];
  [key: string]: unknown;
}

interface ValidateSpansParams {
  spans: unknown[];
  meta?: MetaLike;
  text: string;
  policy: ValidationPolicy;
  options: ProcessingOptions;
  attempt?: number;
  cache: SubstringPositionCache;
  isAdversarial?: boolean;
  analysisTrace?: string | null;
}

export function validateSpans({
  spans,
  meta,
  text,
  policy,
  options,
  attempt = 1,
  cache,
  isAdversarial = false,
  analysisTrace = null,
}: ValidateSpansParams): ValidationResult {
  const lenient = attempt > 1;

  // Phase 1: Normalize and correct individual spans
  const phase1Result = normalizeAndCorrectSpans(
    spans,
    text,
    policy,
    cache,
    lenient,
  );
  const sanitized = phase1Result.sanitized;
  const errors = phase1Result.errors.map((error) => error.message);
  const verdict =
    phase1Result.errors.length === 0
      ? "pass"
      : phase1Result.errors.some((error) => error.kind === "retryable")
        ? "retryable"
        : "terminal";
  const phase1Notes = phase1Result.notes;

  // Phase 2: Sort by position
  sanitized.sort((a, b) => {
    const aStart = a.start ?? 0;
    const bStart = b.start ?? 0;
    const aEnd = a.end ?? 0;
    const bEnd = b.end ?? 0;
    if (aStart === bStart) return aEnd - bEnd;
    return aStart - bStart;
  });

  // Phase 2.5: Merge adjacent spans with compatible categories
  // Fixes LLM fragmentation like "Action" + "Shot" → "Action Shot"
  // Cast to SpanLike[] since we've validated start/end exist
  const spansForMerge = sanitized.map((s) => ({
    ...s,
    start: s.start ?? 0,
    end: s.end ?? 0,
    confidence: s.confidence ?? 0,
  }));
  const { spans: merged, notes: mergeNotes } = mergeAdjacentSpans(
    spansForMerge,
    text,
  );

  // Phase 3: Deduplicate
  const { spans: deduplicated, notes: dedupeNotes } = deduplicateSpans(merged);

  // Phase 4: Resolve overlaps
  const { spans: resolved, notes: overlapNotes } = resolveOverlaps(
    deduplicated,
    policy.allowOverlap === true,
  );

  // Phase 4.5: Filter out section headers and labels
  const { spans: headersFiltered, notes: headerNotes } =
    filterHeaders(resolved);

  // Phase 4.75: Filter out non-visual spans and alternative sections
  const { spans: nonVisualFiltered, notes: nonVisualNotes } =
    filterNonVisualSpans(headersFiltered, text);

  // Phase 5: Filter by confidence
  const { spans: confidenceFiltered, notes: confidenceNotes } =
    filterByConfidence(nonVisualFiltered, options.minConfidence ?? 0);

  // Phase 6: Truncate to max spans
  const { spans: finalSpansRaw, notes: truncationNotes } = truncateToMaxSpans(
    confidenceFiltered,
    options.maxSpans ?? 10,
  );

  // Convert back to LLMSpan[]
  const finalSpans: LLMSpan[] = finalSpansRaw.map((s) => ({
    text: s.text,
    role: typeof s.role === "string" ? s.role : "subject",
    start: s.start,
    end: s.end,
    ...(typeof s.confidence === "number" ? { confidence: s.confidence } : {}),
  }));

  // Combine all notes
  const combinedNotes = [
    ...(Array.isArray(meta?.notes) ? meta.notes : []),
    ...(typeof meta?.notes === "string" && meta.notes ? [meta.notes] : []),
    ...(isAdversarial ? ["input flagged as adversarial"] : []),
    ...phase1Notes,
    ...mergeNotes,
    ...dedupeNotes,
    ...overlapNotes,
    ...headerNotes,
    ...nonVisualNotes,
    ...confidenceNotes,
    ...truncationNotes,
  ].filter(Boolean);

  return {
    ok: errors.length === 0,
    verdict,
    errors,
    result: {
      spans: finalSpans,
      meta: {
        version:
          typeof meta?.version === "string" && meta.version.trim()
            ? meta.version.trim()
            : (options.templateVersion as string),
        notes: combinedNotes.join(" | "),
        // Preserve NLP pipeline stats for evaluation/telemetry
        ...(typeof meta?.closedVocab === "number" && {
          closedVocab: meta.closedVocab,
        }),
        ...(typeof meta?.openVocab === "number" && {
          openVocab: meta.openVocab,
        }),
        ...(typeof meta?.tier1Latency === "number" && {
          tier1Latency: meta.tier1Latency,
        }),
        ...(typeof meta?.tier2Latency === "number" && {
          tier2Latency: meta.tier2Latency,
        }),
        ...(typeof meta?.latency === "number" && { latency: meta.latency }),
        ...(typeof meta?.source === "string" && { source: meta.source }),
      },
      isAdversarial: Boolean(isAdversarial),
      analysisTrace: analysisTrace || null,
    },
  };
}
