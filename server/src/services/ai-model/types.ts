import type {
  AIResponse,
  CompletionOptions,
  IAIClient,
  MessageContent,
} from "@interfaces/IAIClient";
import type { ProviderType } from "@utils/provider/ProviderDetector";

export interface ClientsMap {
  openai: IAIClient | null;
  groq?: IAIClient | null;
  gemini?: IAIClient | null;
  [key: string]: IAIClient | null | undefined;
}

export interface ExecuteParams extends CompletionOptions {
  systemPrompt: string;
  userMessage?: string;
  messages?: Array<{ role: string; content: MessageContent }>;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  jsonMode?: boolean;
  responseFormat?: { type: string; [key: string]: unknown };
  schema?: Record<string, unknown>;
  signal?: AbortSignal;
  priority?: boolean;
  developerMessage?: string;
  enableBookending?: boolean;
  enableSandwich?: boolean;
  seed?: number;
  useSeedFromConfig?: boolean;
  logprobs?: boolean;
  topLogprobs?: number;
}

export interface StreamParams extends Omit<ExecuteParams, "responseFormat"> {
  onChunk: (chunk: string) => void;
}

export interface ModelConfigEntry {
  client: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
  fallbackTo?: string;
  fallbackConfig?: {
    model: string;
    timeout: number;
  };
  strictClient?: boolean;
  responseFormat?: "json_object";
  useSeed?: boolean;
  useDeveloperMessage?: boolean;
  thinkingBudget?: number;
}

export interface RequestOptions extends CompletionOptions {
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
  jsonMode: boolean;
  responseFormat?: { type: string; [key: string]: unknown };
  schema?: Record<string, unknown>;
  enableSandwich?: boolean;
  developerMessage?: string;
  seed?: number;
  logprobs?: boolean;
  topLogprobs?: number;
}

export interface ExecutionPlan {
  primaryConfig: ModelConfigEntry;
  fallback: { client: string; model: string; timeout: number } | null;
}

/**
 * The provider and model that will run — or did run — an operation.
 *
 * This is the router's answer, not the config table's. `ModelConfig[operation]`
 * records what was *requested*; this records what is actually dispatched, after
 * client availability and circuit state are taken into account. The two diverge
 * whenever a provider is unregistered or its circuit is open.
 *
 * Callers that shape a request for a specific provider — a JSON schema, a
 * prompt template, a cache key — must read this. Re-deriving from ModelConfig
 * silently aims provider-specific work at the wrong provider.
 */
export interface ResolvedExecution {
  /** Registered client that runs the call (e.g. "gemini", "qwen"). */
  readonly client: string;
  /** Detected provider family, for provider-specific request shaping. */
  readonly provider: ProviderType;
  readonly model: string;
  /** True when the primary client was bypassed. */
  readonly viaFallback: boolean;
}

/** An `AIResponse` carrying the routing decision that produced it. */
export interface RoutedAIResponse extends AIResponse {
  readonly executedBy: ResolvedExecution;
}
