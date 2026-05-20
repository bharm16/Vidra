import type { LLMSpan, LabelSpansParams, LabelSpansResult } from "../types";

/**
 * Shared port for prompt span labeling consumers.
 *
 * Wraps `labelSpans` (and optionally a cache) behind a DI-friendly seam so
 * downstream services don't reach into the SpanLabelingService function
 * directly. Multiple consumers (model intelligence, optimization evaluation,
 * request batching) all flow through this port.
 */
export interface PromptSpanProvider {
  /**
   * Label spans for a given prompt and return only the span array — the
   * common case for consumers that don't care about meta/isAdversarial.
   */
  label(
    prompt: string,
    options?: Omit<LabelSpansParams, "text">,
  ): Promise<LLMSpan[]>;

  /**
   * Label spans and return the full `LabelSpansResult` (spans + meta +
   * isAdversarial flag + analysisTrace). Used by the public
   * /api/llm/label-spans-batch endpoint which needs the complete payload.
   */
  labelFull(
    prompt: string,
    options?: Omit<LabelSpansParams, "text">,
  ): Promise<LabelSpansResult>;
}
