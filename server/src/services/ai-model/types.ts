import type {
  CompletionOptions,
  IAIClient,
  MessageContent,
} from "@interfaces/IAIClient";

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
