import { SpanProcessor } from "../processing/SpanProcessor.js";
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
 *
 * The processing itself lives in SpanProcessor — this function is the
 * batch-scheduled caller of it (feed every span, then finalize). The streaming
 * route feeds the same processor one span at a time. See SpanProcessor for the
 * accept/finalize split.
 */

/**
 * Validate and process spans with auto-correction and filtering
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

  const processor = new SpanProcessor({
    text,
    policy,
    options,
    cache,
    lenient,
  });
  for (const span of spans) {
    processor.accept(span);
  }
  const processed = processor.finalize();

  const errors = processed.errors.map((error) => error.message);
  const verdict =
    processed.errors.length === 0
      ? "pass"
      : processed.errors.some((error) => error.kind === "retryable")
        ? "retryable"
        : "terminal";

  // Convert back to LLMSpan[]
  const finalSpans: LLMSpan[] = processed.spans.map((s) => ({
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
    ...processed.notes,
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
