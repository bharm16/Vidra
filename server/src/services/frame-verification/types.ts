/**
 * Frame verification types
 *
 * Per-span verdicts on whether a generated frame contains what the
 * prompt asked for. Spans carry taxonomy category ids assigned by
 * span labeling — this service never re-classifies text.
 */

export const SPAN_VERDICT_VALUES = ['present', 'absent', 'uncertain'] as const;

export type SpanVerdictValue = (typeof SPAN_VERDICT_VALUES)[number];

export interface FrameVerificationSpan {
  /** The span phrase as it appears in the prompt */
  text: string;
  /** Taxonomy category id (e.g. "subject.identity", "lighting.timeOfDay") */
  category: string;
  start?: number | undefined;
  end?: number | undefined;
}

export interface FrameVerificationRequest {
  /** Image URL or base64 data URI of the generated frame */
  image: string;
  spans: FrameVerificationSpan[];
}

export interface SpanVerdict {
  span: FrameVerificationSpan;
  verdict: SpanVerdictValue;
  /** 0-1; how sure the judge is of the verdict */
  confidence: number;
  /** Short visual evidence for the verdict, when the model provides one */
  evidence?: string;
}

export interface FrameVerificationResult {
  verdicts: SpanVerdict[];
  model: string;
  durationMs: number;
}
