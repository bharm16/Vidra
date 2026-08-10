/**
 * AI Client Interface
 * Defines the contract for AI service clients
 *
 * SOLID Principles Applied:
 * - ISP: Minimal interface with only essential methods
 * - DIP: Abstraction that high-level modules depend on
 */

export interface LLMAdapterOptions {
  userMessage?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
  signal?: AbortSignal;
  jsonMode?: boolean;
  isArray?: boolean;
  schema?: Record<string, unknown>;
  responseFormat?: { type: string; [key: string]: unknown };
  messages?: Array<{ role: string; content: MessageContent }>;
  onChunk?: (chunk: string) => void;
}

export type LLMAdapterStreamOptions<
  TOptions extends LLMAdapterOptions = LLMAdapterOptions,
> = TOptions & { onChunk: (chunk: string) => void };

export interface LLMAdapterHealth {
  healthy: boolean;
  [key: string]: unknown;
}

/**
 * What `LLMClient` requires of an adapter.
 *
 * `TOptions` lets an adapter declare the richer options type it actually
 * accepts (e.g. `LlamaCompletionOptions`) while still satisfying the port.
 *
 * `streamComplete` is optional because not every provider streams — Qwen
 * does not. `LLMClient` checks for its presence to decide whether streaming
 * is available, so an adapter that cannot stream must genuinely omit it
 * rather than throw from it.
 */

/**
 * What a caller may ask of an LLM client.
 *
 * Extends the adapter-facing {@link LLMAdapterOptions} rather than restating
 * it: these used to be two unrelated declarations — 21 members here, 12 in a
 * private type inside LLMClient — so the caller-facing type promised options
 * the adapter-facing type had never heard of. Nothing broke, because
 * `_applyDefaults` spreads and the index signature below swallowed the
 * difference, but the types disagreed about what a request is.
 *
 * The members added here are ones the CLIENT layer understands (retry policy,
 * concurrency priority) or that only some providers implement (prefill,
 * bookending, logprobs). Adapters ignore what they don't support.
 */
export interface CompletionOptions extends LLMAdapterOptions {
  /** Concurrency-limiter hint; consumed by LLMClient, never sent upstream. */
  priority?: boolean;
  developerMessage?: string;
  enableBookending?: boolean;
  enableSandwich?: boolean;
  enablePrefill?: boolean;
  seed?: number;
  logprobs?: boolean;
  topLogprobs?: number;
  /** Gemini 2.5+ only: caps thinking tokens, which count against maxTokens. 0 disables thinking. */
  thinkingBudget?: number;
  prediction?: { type: "content"; content: string };
  retryOnValidationFailure?: boolean;
  maxRetries?: number;
}

export type MessageContentPart = {
  type?: string;
  text?: string;
  image_url?: { url: string; detail?: "low" | "high" | "auto" };
  [key: string]: unknown;
};

export type MessageContent =
  | string
  | MessageContentPart[]
  | { text?: string; [key: string]: unknown };

/**
 * Logprob information for a single token
 */
export interface LogprobInfo {
  token: string;
  logprob: number;
  probability: number; // Math.exp(logprob)
}

/**
 * Validation result from ResponseValidator
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  parsed?: unknown;
  confidence: number;
  isRefusal: boolean;
  isTruncated: boolean;
  hasPreamble: boolean;
  hasPostamble: boolean;
  cleanedText?: string;
}

export interface AIResponseMetadata {
  model?: string;
  tokens?: number;
  finishReason?: string;
  usage?: unknown;
  raw?: unknown;
  _original?: unknown;
  provider?: string;
  systemFingerprint?: string;
  requestId?: string;
  optimizations?: string[];
  logprobs?: LogprobInfo[];
  averageConfidence?: number;
  validation?: ValidationResult;
  [key: string]: unknown;
}

export interface AIResponse {
  text: string;
  content?: Array<{ text?: string }>;
  metadata: AIResponseMetadata;
}

export class AIClientError extends Error {
  statusCode: number;
  originalError: unknown;

  constructor(
    message: string,
    statusCode: number,
    originalError: unknown = null,
  ) {
    super(message);
    this.name = "AIClientError";
    this.statusCode = statusCode;
    this.originalError = originalError;
  }
}

export interface IAIClient {
  /**
   * Complete a prompt with the AI model
   */
  complete(
    systemPrompt: string,
    options?: CompletionOptions,
  ): Promise<AIResponse>;

  /**
   * Stream completion (optional - not all clients support this)
   */
  streamComplete?(
    systemPrompt: string,
    options: CompletionOptions & { onChunk: (chunk: string) => void },
  ): Promise<string>;

  /**
   * Health check (optional)
   */
  healthCheck?(): Promise<{
    healthy: boolean;
    provider: string;
    error?: string | undefined;
  }>;

  /**
   * Capabilities declaration (optional)
   */
  capabilities?: {
    streaming?: boolean;
    jsonMode?: boolean;
    logprobs?: boolean;
    seed?: boolean;
    predictedOutputs?: boolean;
    developerRole?: boolean;
    structuredOutputs?: boolean;
  };
}
