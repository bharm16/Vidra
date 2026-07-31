/**
 * LLM API Cost Rates
 *
 * Per-model cost-per-1K-token lookup for estimating LLM API spend.
 * Rates are approximate and should be updated when providers change pricing.
 *
 * Used by AIModelService to emit cost metrics via MetricsService.
 */

interface TokenCostRate {
  /** Cost per 1K input tokens in USD */
  input: number;
  /** Cost per 1K output tokens in USD */
  output: number;
}

/**
 * Cost rates per 1K tokens (USD).
 *
 * Keys are model ID prefixes — the lookup performs prefix matching so that
 * versioned model IDs (e.g. `gpt-4o-2024-08-06`) resolve to their base rate.
 */
const MODEL_COST_RATES: Record<string, TokenCostRate> = {
  // OpenAI
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-4o": { input: 0.0025, output: 0.01 },

  // Gemini
  "gemini-2.5-flash": { input: 0.00015, output: 0.0006 },
  "gemini-2.0-flash": { input: 0.0001, output: 0.0004 },

  // Groq-hosted Qwen (groq.com pricing as of 2026-07: $0.60/M in, $3.00/M out)
  "qwen/qwen3.6-27b": { input: 0.0006, output: 0.003 },

  // Groq-hosted Llama
  "llama-3.1-8b-instant": { input: 0.00005, output: 0.00008 },

  // Anthropic
  "claude-sonnet-4": { input: 0.003, output: 0.015 },
};

/** Fallback rate for models not in the lookup table. */
const FALLBACK_RATE: TokenCostRate = { input: 0.001, output: 0.002 };

/**
 * Resolve cost rate for a model ID.
 * Uses prefix matching so `gpt-4o-2024-08-06` matches `gpt-4o`.
 */
function resolveRate(model: string): TokenCostRate {
  // Exact match first
  const exact = MODEL_COST_RATES[model];
  if (exact) {
    return exact;
  }

  // Prefix match (longest prefix wins)
  let bestMatch = "";
  for (const prefix of Object.keys(MODEL_COST_RATES)) {
    if (model.startsWith(prefix) && prefix.length > bestMatch.length) {
      bestMatch = prefix;
    }
  }

  const prefixMatch = bestMatch ? MODEL_COST_RATES[bestMatch] : undefined;
  return prefixMatch ?? FALLBACK_RATE;
}

/**
 * Calculate estimated LLM API cost in USD.
 */
export function calculateLLMCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rate = resolveRate(model);
  return (
    (inputTokens / 1000) * rate.input + (outputTokens / 1000) * rate.output
  );
}
