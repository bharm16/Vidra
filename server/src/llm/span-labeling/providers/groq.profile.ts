import { logger } from "@infrastructure/Logger";
import { GROQ_SPAN_LABELING_JSON_SCHEMA } from "../schemas/SpanLabelingSchema";
import type { LabelSpansResult, LLMSpan } from "../types";
import type { SpanProviderProfile, SpanResponseMetadata } from "./types";

/**
 * Groq-hosted Llama 3 (and Qwen, which shares Groq's JSON-mode handling).
 *
 * Groq's JSON schema support is validation-based rather than
 * grammar-constrained, so the prompt carries the rules and few-shot examples,
 * and token-level logprobs are used to cap self-reported confidence.
 */

function addProviderMetadata(
  result: LabelSpansResult,
  metadata: SpanResponseMetadata,
  logprobsApplied: boolean,
  averageConfidence?: number,
): LabelSpansResult {
  return {
    ...result,
    meta: {
      ...result.meta,
      _clientType: "groq",
      _providerOptimizations: {
        provider: "groq",
        logprobsAdjustment: logprobsApplied,
        averageLogprobsConfidence: averageConfidence,
        optimizations: metadata?.optimizations || [],
      },
    },
  };
}

/**
 * Cap self-reported confidence at what the token probabilities support.
 *
 * Llama 3 reports confidence optimistically; the logprobs are the more
 * reliable signal, so the lower of the two wins.
 */
function adjustConfidenceFromLogprobs(
  result: LabelSpansResult,
  metadata: SpanResponseMetadata,
): LabelSpansResult {
  if (!metadata?.averageConfidence) {
    logger.debug("groq span profile: no logprobs data for adjustment", {
      hasMetadata: !!metadata,
      spanCount: result.spans?.length || 0,
    });
    return addProviderMetadata(result, metadata, false);
  }

  const averageConfidence = metadata.averageConfidence;

  if (!result.spans?.length) {
    return addProviderMetadata(result, metadata, false);
  }

  const adjustedSpans = result.spans.map((span: LLMSpan) => {
    const originalConfidence = span.confidence ?? 1.0;
    const adjustedConfidence = Math.min(originalConfidence, averageConfidence);

    if (originalConfidence - adjustedConfidence > 0.1) {
      logger.debug("groq span profile: significant confidence adjustment", {
        spanText: span.text?.substring(0, 30),
        original: originalConfidence,
        adjusted: adjustedConfidence,
        logprobsAvg: averageConfidence,
      });
    }

    return {
      ...span,
      confidence: adjustedConfidence,
      _originalConfidence: originalConfidence,
    };
  });

  logger.info("groq span profile: applied logprobs confidence adjustment", {
    spanCount: adjustedSpans.length,
    averageLogprobsConfidence: averageConfidence,
    adjustedCount: adjustedSpans.filter(
      (s: LLMSpan & { _originalConfidence?: number }) =>
        s._originalConfidence && (s.confidence ?? 0) < s._originalConfidence,
    ).length,
  });

  return addProviderMetadata(
    { ...result, spans: adjustedSpans },
    metadata,
    true,
    averageConfidence,
  );
}

export const groqSpanProfile: SpanProviderProfile = {
  id: "groq",
  promptProviderName: "groq",
  jsonSchema: GROQ_SPAN_LABELING_JSON_SCHEMA,

  requestOptions: {
    // The Groq adapter already handles sandwich prompting.
    enableBookending: false,
    useFewShot: true,
    useSeedFromConfig: true,
    enableLogprobs: true,
  },

  rawTextPayload: false,
  relaxValidation: false,

  postProcess: adjustConfidenceFromLogprobs,
};
