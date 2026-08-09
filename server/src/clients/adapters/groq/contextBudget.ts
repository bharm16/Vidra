/**
 * Llama 3 context-window budgeting.
 *
 * Estimating prompt tokens, refusing oversized requests, and sizing
 * max_tokens are one concern with real arithmetic in it, and none of it had
 * direct test coverage while it was private to a 1,046-line adapter.
 *
 * `checkContextSize` takes its logger rather than reading adapter state, so
 * the whole cluster is pure functions.
 */

import type { ILogger } from "@interfaces/ILogger";

/**
 * Estimate context size in tokens
 *
 * Llama 3 PDF Section 8.3: "Performance on complex retrieval tasks degrades
 * as context fills up... keep between 8k and 32k tokens where the 8B model's
 * attention is sharpest."
 *
 * Rough estimate: 1 token ≈ 4 characters for English text
 */
export function estimateContextTokens(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
): number {
  const systemTokens = Math.ceil(systemPrompt.length / 4);
  const messageTokens = messages.reduce(
    (sum, msg) => sum + Math.ceil(msg.content.length / 4),
    0,
  );
  return systemTokens + messageTokens;
}

/**
 * Monitor context size and warn if outside optimal range
 *
 * Llama 3.1 8B supports 128k context but performs best at 8k-32k
 */
export function checkContextSize(estimatedTokens: number, log: ILogger): void {
  const OPTIMAL_MIN = 1000; // Suspiciously small
  const OPTIMAL_MAX = 32000; // Upper bound for reliable attention
  const WARNING_MAX = 64000; // Performance degradation likely
  const HARD_MAX = 128000; // Model limit

  if (estimatedTokens > HARD_MAX) {
    log.error("Context exceeds model limit", new Error("Context too large"), {
      operation: "_monitorContextSize",
      estimated: estimatedTokens,
      limit: HARD_MAX,
    });
  } else if (estimatedTokens > WARNING_MAX) {
    log.warn("Context significantly exceeds optimal range", {
      operation: "_monitorContextSize",
      estimated: estimatedTokens,
      optimal: "8k-32k",
      recommendation: "Consider RAG to reduce context size",
    });
  } else if (estimatedTokens > OPTIMAL_MAX) {
    log.info("Context exceeds optimal range for 8B model", {
      operation: "_monitorContextSize",
      estimated: estimatedTokens,
      optimal: "8k-32k",
    });
  }
}

/**
 * Calculate appropriate max_tokens based on task type
 *
 * Llama 3 PDF Section 6.1: "Set this aggressively to prevent infinite loops
 * (a common failure mode). If expecting a 50-word summary, set to ~100 tokens."
 *
 * Structured outputs need less tokens than creative tasks
 */
export function calculateMaxTokens(
  isStructuredOutput: boolean,
  requestedTokens?: number,
  expectedSize?: "small" | "medium" | "large",
): number {
  // If explicitly set, respect it but cap structured output
  if (requestedTokens !== undefined) {
    if (isStructuredOutput) {
      // Cap structured output to prevent runaway generation
      return Math.min(requestedTokens, 2048);
    }
    return requestedTokens;
  }

  // Smart defaults based on task type
  if (isStructuredOutput) {
    switch (expectedSize) {
      case "small":
        return 256; // Simple extraction, few fields
      case "medium":
        return 512; // Standard JSON response
      case "large":
        return 1024; // Complex nested structures
      default:
        return 512; // Conservative default for JSON
    }
  }

  // Creative/chat tasks get more headroom
  switch (expectedSize) {
    case "small":
      return 512;
    case "medium":
      return 1024;
    case "large":
      return 2048;
    default:
      return 1024;
  }
}
