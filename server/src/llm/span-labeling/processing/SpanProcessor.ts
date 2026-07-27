import { mergeAdjacentSpans } from "./AdjacentSpanMerger.js";
import { deduplicateSpans } from "./SpanDeduplicator.js";
import { resolveOverlaps } from "./OverlapResolver.js";
import { filterHeaders } from "./HeaderFilter.js";
import { filterNonVisualSpans } from "./VisualOnlyFilter.js";
import { filterByConfidence } from "./ConfidenceFilter.js";
import { truncateToMaxSpans } from "./SpanTruncator.js";
import { normalizeAndCorrectSpans } from "../validation/normalizeAndCorrectSpans.js";
import type { SubstringPositionCache } from "../cache/SubstringPositionCache.js";
import type {
  ProcessingOptions,
  SpanLike,
  SpanValidationError,
  ValidationPolicy,
} from "../types.js";

/**
 * The single span-processing pipeline, split into the two scheduling shapes
 * the product needs.
 *
 * Before this module the blocking route and the streaming route ran two
 * different pipelines under one name: the blocking route applied eight
 * processing phases, the streaming route applied none. Streaming is the path
 * the client actually takes, so every filter fix landed on code users never
 * executed.
 *
 * The pipeline is now staged instead of duplicated:
 *
 * - `accept(raw)` runs the stages that are decidable from a single span:
 *   normalization + index correction + stable id, confidence defaulting,
 *   the header filter, the non-visual filter, the confidence threshold, and
 *   the `maxSpans` budget. Its return value is what a streaming caller may put
 *   on the wire *now*. Every raw span is buffered regardless of the verdict.
 *
 * - `finalize()` runs the stages that need the whole set — sort, adjacent
 *   merge, dedupe, overlap resolution, truncation — over everything that was
 *   buffered, in exactly the order the blocking path has always used. It is
 *   authoritative: a batch caller ignores `accept`'s return value entirely and
 *   reads only this.
 *
 * Because `accept` buffers rejected spans rather than discarding them,
 * `finalize()` sees the same input the old batch pipeline saw, and the blocking
 * path's observable output is unchanged.
 */
export interface SpanProcessorParams {
  text: string;
  policy: ValidationPolicy;
  options: ProcessingOptions;
  cache: SubstringPositionCache;
  /** Lenient mode drops invalid spans instead of raising retryable errors. */
  lenient?: boolean;
}

export interface SpanProcessorResult {
  spans: SpanLike[];
  notes: string[];
  errors: SpanValidationError[];
}

/** A raw span carries `role`, or `category` when the provider streams NDJSON. */
function withResolvedRole(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const record = raw as Record<string, unknown>;
  if (typeof record.role === "string" && record.role) return record;
  if (typeof record.category === "string" && record.category) {
    return { ...record, role: record.category };
  }
  return record;
}

export class SpanProcessor {
  private readonly text: string;
  private readonly policy: ValidationPolicy;
  private readonly options: ProcessingOptions;
  private readonly cache: SubstringPositionCache;
  private readonly lenient: boolean;

  private readonly buffered: unknown[] = [];
  private acceptedCount = 0;

  constructor({
    text,
    policy,
    options,
    cache,
    lenient = false,
  }: SpanProcessorParams) {
    this.text = text;
    this.policy = policy;
    this.options = options;
    this.cache = cache;
    this.lenient = lenient;
  }

  /**
   * Stage one raw span.
   *
   * Returns the span a streaming caller may emit immediately, or `null` when
   * the per-span stages reject it or the `maxSpans` budget is spent. The raw
   * span is buffered either way — `finalize()` is the authority.
   */
  accept(raw: unknown): SpanLike | null {
    const resolved = withResolvedRole(raw);
    this.buffered.push(resolved);

    const maxSpans = this.options.maxSpans ?? 10;
    if (this.acceptedCount >= maxSpans) {
      return null;
    }

    // Per-span normalization. Errors and notes are discarded here: the
    // authoritative pass in finalize() normalizes the whole buffer at once,
    // which is what lets identical span texts claim distinct occurrences.
    const normalized = normalizeAndCorrectSpans(
      [resolved],
      this.text,
      this.policy,
      this.cache,
      this.lenient,
    ).sanitized;

    const candidate = normalized[0];
    if (!candidate) return null;

    const span: SpanLike = { ...candidate };

    const headerChecked = filterHeaders([span]).spans;
    if (headerChecked.length === 0) return null;

    const visualChecked = filterNonVisualSpans(headerChecked, this.text).spans;
    if (visualChecked.length === 0) return null;

    const confidenceChecked = filterByConfidence(
      visualChecked,
      this.options.minConfidence ?? 0,
    ).spans;
    const kept = confidenceChecked[0];
    if (!kept) return null;

    this.acceptedCount += 1;
    return kept;
  }

  /**
   * Run the whole-set stages over every span fed to `accept`.
   *
   * Phase 1: normalize and index-correct the full buffer
   * Phase 2: sort by position
   * Phase 2.5: merge adjacent spans with compatible categories
   * Phase 3: deduplicate
   * Phase 4: resolve overlaps
   * Phase 4.5: drop section headers and labels
   * Phase 4.75: drop non-visual spans and alternative sections
   * Phase 5: filter by confidence
   * Phase 6: truncate to maxSpans
   */
  finalize(): SpanProcessorResult {
    const phase1 = normalizeAndCorrectSpans(
      this.buffered,
      this.text,
      this.policy,
      this.cache,
      this.lenient,
    );

    const sanitized = phase1.sanitized;

    sanitized.sort((a, b) => {
      const aStart = a.start ?? 0;
      const bStart = b.start ?? 0;
      const aEnd = a.end ?? 0;
      const bEnd = b.end ?? 0;
      if (aStart === bStart) return aEnd - bEnd;
      return aStart - bStart;
    });

    const spansForMerge = sanitized.map((s) => ({
      ...s,
      start: s.start ?? 0,
      end: s.end ?? 0,
      confidence: s.confidence ?? 0,
    }));
    const { spans: merged, notes: mergeNotes } = mergeAdjacentSpans(
      spansForMerge,
      this.text,
    );

    const { spans: deduplicated, notes: dedupeNotes } =
      deduplicateSpans(merged);

    const { spans: resolved, notes: overlapNotes } = resolveOverlaps(
      deduplicated,
      this.policy.allowOverlap === true,
    );

    const { spans: headersFiltered, notes: headerNotes } =
      filterHeaders(resolved);

    const { spans: nonVisualFiltered, notes: nonVisualNotes } =
      filterNonVisualSpans(headersFiltered, this.text);

    const { spans: confidenceFiltered, notes: confidenceNotes } =
      filterByConfidence(nonVisualFiltered, this.options.minConfidence ?? 0);

    const { spans: finalSpans, notes: truncationNotes } = truncateToMaxSpans(
      confidenceFiltered,
      this.options.maxSpans ?? 10,
    );

    return {
      spans: finalSpans,
      notes: [
        ...phase1.notes,
        ...mergeNotes,
        ...dedupeNotes,
        ...overlapNotes,
        ...headerNotes,
        ...nonVisualNotes,
        ...confidenceNotes,
        ...truncationNotes,
      ],
      errors: phase1.errors,
    };
  }
}
