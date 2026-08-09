/**
 * Type definitions for the Groq/Llama adapter.
 *
 * Mirrors `openai/types.ts`: the adapter's request/response contracts live
 * beside its message builder, response normalizer and context budgeter so
 * those modules can be imported without pulling in the transport.
 */

export interface LlamaCompletionOptions {
  userMessage?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
  signal?: AbortSignal;
  jsonMode?: boolean;
  isArray?: boolean;
  responseFormat?: { type: string; [key: string]: unknown };
  schema?: Record<string, unknown>;
  messages?: Array<{ role: string; content: string }>;
  onChunk?: (chunk: string) => void;
  enableSandwich?: boolean; // Llama 3 PDF Section 3.2: Sandwich prompting
  enablePrefill?: boolean; // Llama 3 PDF Section 3.3: Pre-fill assistant with "{"
  seed?: number; // Reproducibility: Same seed + input = deterministic output
  logprobs?: boolean; // Token-level confidence (more reliable than self-reported)
  topLogprobs?: number; // Number of top logprobs to return (1-5)
  retryOnValidationFailure?: boolean; // Auto-retry on malformed response
  maxRetries?: number; // Max retry attempts (default: 2)
  expectedOutputSize?: "small" | "medium" | "large"; // Hint for max_tokens calculation
}

export interface GroqAdapterConfig {
  apiKey: string;
  baseURL?: string;
  defaultModel?: string;
  defaultTimeout?: number;
}

export interface LogprobInfo {
  token: string;
  logprob: number;
  probability: number; // Converted from logprob: Math.exp(logprob)
}

export interface GroqResponseData {
  choices?: Array<{
    message?: { content?: string };
    logprobs?: {
      content?: Array<{
        token: string;
        logprob: number;
        top_logprobs?: Array<{ token: string; logprob: number }>;
      }>;
    };
    finish_reason?: string;
  }>;
  model?: string;
  usage?: unknown;
  system_fingerprint?: string;
}
