/**
 * LLM Client Factory
 *
 * Selects the client whose prompt and JSON-schema shaping matches the provider
 * that will actually run the request.
 *
 * The provider is supplied by the caller, from `aiService.resolveExecution()`.
 * It is deliberately NOT re-derived here. This module used to resolve it from
 * `process.env` and `ModelConfig` through a five-tier cascade — neither of
 * which can see client availability or circuit state — so a Gemini-shaped
 * request could be built for a call the router had already rerouted to the
 * Groq-hosted fallback.
 *
 * CRITICAL CONSTRAINT: Changes to Groq must not affect OpenAI behavior. The
 * factory pattern ensures this by routing to completely separate
 * implementations.
 */

import { logger } from "@infrastructure/Logger";
import { RobustLlmClient } from "./RobustLlmClient";
import { GroqLlmClient } from "./GroqLlmClient";
import { OpenAILlmClient } from "./OpenAILlmClient";
import { GeminiLlmClient } from "./GeminiLlmClient";
import type { ProviderType } from "@utils/provider/ProviderDetector";
import type { ILlmClient, LlmClientProvider } from "./ILlmClient";

/**
 * Map an executing provider onto the client that shapes requests for it.
 *
 * Qwen is Groq-hosted and shares Groq's JSON-mode handling, so it maps to the
 * Groq client. Anthropic has no dedicated span client and falls through to the
 * generic one.
 */
export function spanClientProviderFor(
  provider: ProviderType,
): LlmClientProvider {
  switch (provider) {
    case "openai":
      return "openai";
    case "gemini":
      return "gemini";
    case "groq":
    case "qwen":
      return "groq";
    default:
      return "unknown";
  }
}

/**
 * Create the span-labeling client for the provider that will execute the call.
 *
 * @param provider - From `aiService.resolveExecution("span_labeling").provider`
 */
export function createLlmClient(provider: ProviderType): ILlmClient {
  switch (spanClientProviderFor(provider)) {
    case "openai":
      return new OpenAILlmClient();

    case "groq":
      return new GroqLlmClient();

    case "gemini":
      return new GeminiLlmClient();

    default:
      // Generic handling is safer than guessing wrong.
      logger.warn("No provider-specific span client; using generic client", {
        operation: "createLlmClient",
        provider,
      });
      return new RobustLlmClient();
  }
}
