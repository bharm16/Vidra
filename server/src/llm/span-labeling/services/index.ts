/**
 * Span Labeling Services - Index
 *
 * Provider-specific LLM clients for span labeling operations.
 * Use LlmClientFactory.createLlmClient() to get the appropriate client.
 *
 * Architecture:
 * - RobustLlmClient: Base class with shared validation/repair logic
 * - GroqLlmClient: Groq/Llama 3 optimizations (logprobs, few-shot)
 * - OpenAILlmClient: OpenAI/GPT-4o optimizations (developer role, strict schema)
 * - LlmClientFactory: Maps the router's resolved provider to the right client
 */

export {
  RobustLlmClient,
  type ModelResponse,
  type ProviderRequestOptions,
} from "./RobustLlmClient.js";
export { GroqLlmClient } from "./GroqLlmClient.js";
export { OpenAILlmClient } from "./OpenAILlmClient.js";
export { createLlmClient, spanClientProviderFor } from "./LlmClientFactory.js";
export type {
  ILlmClient,
  LlmSpanParams,
  LlmClientProvider,
} from "./ILlmClient.js";
