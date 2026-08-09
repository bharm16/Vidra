/**
 * Llama 3 response normalization.
 *
 * Mirrors `openai/OpenAiResponseParser`. Pure: no adapter state.
 */

import type { AIResponse } from "@interfaces/IAIClient";
import type {
  GroqResponseData,
  LlamaCompletionOptions,
  LogprobInfo,
} from "./types";

/**
 * Normalize response with enhanced metadata
 */
export function normalizeResponse(
  data: GroqResponseData,
  options: LlamaCompletionOptions,
): AIResponse {
  let text = data.choices?.[0]?.message?.content || "";

  /**
   * Handle pre-fill: If we pre-filled with '{', prepend it to the response
   * The API returns only the continuation, not the pre-filled content
   */
  if (options.enablePrefill !== false && options.jsonMode && !options.isArray) {
    if (text && !text.startsWith("{")) {
      text = "{" + text;
    }
  }

  // Extract logprobs for confidence scoring
  let logprobsInfo: LogprobInfo[] | undefined;
  let averageConfidence: number | undefined;

  if (options.logprobs && data.choices?.[0]?.logprobs?.content) {
    logprobsInfo = data.choices[0].logprobs.content.map((item) => ({
      token: item.token,
      logprob: item.logprob,
      probability: Math.exp(item.logprob), // Convert logprob to probability
    }));

    // Calculate average confidence from probabilities
    if (logprobsInfo.length > 0) {
      const sum = logprobsInfo.reduce((acc, item) => acc + item.probability, 0);
      averageConfidence = sum / logprobsInfo.length;
    }
  }

  const optimizations = [
    "llama3-temp-0.1",
    "top_p-0.95",
    "stop-sequences",
    "sandwich-prompting",
    "xml-wrapping",
  ];

  if (options.enablePrefill !== false && options.jsonMode) {
    optimizations.push("prefill-assistant");
  }
  if (options.seed !== undefined) {
    optimizations.push("seed-deterministic");
  }
  if (options.logprobs) {
    optimizations.push("logprobs-confidence");
  }

  const logprobs = logprobsInfo ?? [];
  const metadata = {
    usage: data.usage,
    raw: data,
    _original: data,
    provider: "groq",
    optimizations,
    ...(data.choices?.[0]?.finish_reason
      ? { finishReason: data.choices[0].finish_reason }
      : {}),
    ...(data.system_fingerprint
      ? { systemFingerprint: data.system_fingerprint }
      : {}),
    ...(logprobs.length > 0 ? { logprobs } : {}),
    ...(typeof averageConfidence === "number" ? { averageConfidence } : {}),
  };

  return {
    text,
    metadata,
  };
}
