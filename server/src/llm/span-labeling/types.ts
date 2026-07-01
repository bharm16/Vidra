/**
 * Types for span labeling service
 */

/**
 * Span from LLM response
 */
export interface LLMSpan {
  text: string;
  start?: number;
  end?: number;
  role: string;
  confidence?: number;
}

/**
 * Normalized span shape for processing pipelines
 */
export interface SpanLike {
  text: string;
  start: number;
  end: number;
  role?: string;
  category?: string;
  confidence?: number;
  [key: string]: unknown;
}

/**
 * Metadata from LLM response
 */
export interface LLMMeta {
  version: string;
  notes: string;
  [key: string]: unknown;
}

/**
 * LLM response structure
 */
export interface LLMResponse {
  spans?: LLMSpan[];
  meta?: LLMMeta;
  isAdversarial?: boolean;
  is_adversarial?: boolean;
}

/**
 * Validation policy
 */
export interface ValidationPolicy {
  nonTechnicalWordLimit?: number;
  allowOverlap?: boolean;
  [key: string]: unknown;
}

/**
 * Processing options
 */
export interface ProcessingOptions {
  maxSpans?: number;
  minConfidence?: number;
  templateVersion?: string;
  [key: string]: unknown;
}

/**
 * Label spans parameters
 */
export interface LabelSpansParams {
  text: string;
  maxSpans?: number;
  minConfidence?: number;
  policy?: ValidationPolicy;
  templateVersion?: string;
  enableRepair?: boolean;
}

/**
 * How a failed validation can be resolved.
 *
 * - `retryable`: a repair round-trip could plausibly fix the error (wrong
 *   indices, malformed span, role outside the taxonomy).
 * - `terminal`: the only resolution is dropping the span — the repair prompt
 *   forbids changing span text, so errors like word-limit violations can
 *   never be repaired. Callers should skip the repair round-trip and
 *   re-validate leniently instead.
 */
export type SpanValidationErrorKind = "retryable" | "terminal";

export interface SpanValidationError {
  message: string;
  kind: SpanValidationErrorKind;
}

export type SpanValidationVerdict = "pass" | SpanValidationErrorKind;

/**
 * Validation result
 */
export interface ValidationResult {
  ok: boolean;
  /**
   * `pass` when ok; otherwise `retryable` if at least one error could be
   * fixed by a repair round-trip, `terminal` when every error can only be
   * resolved by dropping the offending span.
   */
  verdict: SpanValidationVerdict;
  errors: string[];
  result: {
    spans: LLMSpan[];
    meta: LLMMeta;
    isAdversarial?: boolean;
    analysisTrace?: string | null;
  };
}

/**
 * Label spans result
 */
export interface LabelSpansResult {
  spans: LLMSpan[];
  meta: LLMMeta;
  isAdversarial?: boolean;
  analysisTrace?: string | null;
}
