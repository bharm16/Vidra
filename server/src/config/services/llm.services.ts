import type { DIContainer } from "@infrastructure/DIContainer";
import { logger } from "@infrastructure/Logger";
import { LLMClient, APIError, ClientAbortError } from "@clients/LLMClient";
import { GeminiAdapter } from "@clients/adapters/GeminiAdapter";
import { GroqLlamaAdapter } from "@clients/adapters/GroqLlamaAdapter";
import { GroqQwenAdapter } from "@clients/adapters/GroqQwenAdapter";
import { OpenAICompatibleAdapter } from "@clients/adapters/OpenAICompatibleAdapter";
import { AIModelService } from "@services/ai-model/index";
import type { LlmCallTelemetryService } from "@services/observability/LlmCallTelemetryService";
import { setProviderSettings } from "@services/ai-model/routing/ExecutionPlan";
import {
  ConcurrencyLimiter,
  parseEnvInt,
} from "@infrastructure/ConcurrencyLimiter";
import type { ServiceConfig } from "./service-config.types.ts";

export function registerLLMServices(container: DIContainer): void {
  const defaultMaxConcurrent = process.env.NODE_ENV === "production" ? 10 : 5;

  const registerLimiter = (token: string, envPrefix: string): void => {
    container.register(
      token,
      () =>
        new ConcurrencyLimiter({
          maxConcurrent: parseEnvInt(
            process.env[`${envPrefix}_MAX_CONCURRENT`],
            defaultMaxConcurrent,
          ),
          queueTimeout: parseEnvInt(
            process.env[`${envPrefix}_QUEUE_TIMEOUT_MS`],
            30000,
          ),
          enableCancellation: true,
        }),
      [],
    );
  };

  registerLimiter("openAILimiter", "OPENAI");
  registerLimiter("groqLimiter", "GROQ");
  registerLimiter("geminiLimiter", "GEMINI");

  // Qwen shares the Groq API key; reuse the same limiter to respect shared limits.
  container.register(
    "qwenLimiter",
    (groqLimiter: ConcurrencyLimiter) => groqLimiter,
    ["groqLimiter"],
  );

  container.register(
    "openAIClient",
    (config: ServiceConfig, openAILimiter: ConcurrencyLimiter) => {
      if (!config.openai.apiKey) {
        logger.warn("OPENAI_API_KEY not provided, OpenAI adapter disabled");
        return null;
      }

      return new LLMClient({
        adapter: new OpenAICompatibleAdapter({
          apiKey: config.openai.apiKey,
          baseURL: "https://api.openai.com/v1",
          defaultModel: config.openai.model,
          defaultTimeout: config.openai.timeout,
          providerName: "openai",
        }),
        providerName: "openai",
        defaultTimeout: config.openai.timeout,
        circuitBreakerConfig: {
          errorThresholdPercentage: 50,
          resetTimeout: 30000,
        },
        concurrencyLimiter: openAILimiter,
      });
    },
    ["config", "openAILimiter"],
  );

  container.register(
    "groqClient",
    (config: ServiceConfig, groqLimiter: ConcurrencyLimiter) => {
      if (!config.groq.apiKey) {
        logger.warn("GROQ_API_KEY not provided, Groq adapter disabled");
        return null;
      }
      return new LLMClient({
        adapter: new GroqLlamaAdapter({
          apiKey: config.groq.apiKey,
          defaultModel: config.groq.model,
          defaultTimeout: config.groq.timeout,
        }),
        providerName: "groq",
        defaultTimeout: config.groq.timeout,
        circuitBreakerConfig: {
          errorThresholdPercentage: 60,
          resetTimeout: 15000,
        },
        concurrencyLimiter: groqLimiter,
      });
    },
    ["config", "groqLimiter"],
  );

  container.register(
    "qwenClient",
    (config: ServiceConfig, qwenLimiter: ConcurrencyLimiter) => {
      if (!config.qwen.apiKey) {
        logger.warn("GROQ_API_KEY not provided, Qwen client disabled");
        return null;
      }
      return new LLMClient({
        adapter: new GroqQwenAdapter({
          apiKey: config.qwen.apiKey,
          defaultModel: config.qwen.model,
          defaultTimeout: config.qwen.timeout,
        }),
        providerName: "qwen",
        defaultTimeout: config.qwen.timeout,
        circuitBreakerConfig: {
          errorThresholdPercentage: 60,
          resetTimeout: 15000,
        },
        concurrencyLimiter: qwenLimiter,
      });
    },
    ["config", "qwenLimiter"],
  );

  container.register(
    "geminiClient",
    (config: ServiceConfig, geminiLimiter: ConcurrencyLimiter) => {
      if (!config.gemini.apiKey) {
        logger.warn("GEMINI_API_KEY not provided, Gemini adapter disabled");
        return null;
      }

      return new LLMClient({
        adapter: new GeminiAdapter({
          apiKey: config.gemini.apiKey,
          baseURL: config.gemini.baseURL,
          defaultModel: config.gemini.model,
          defaultTimeout: config.gemini.timeout,
          providerName: "gemini",
        }),
        providerName: "gemini",
        defaultTimeout: config.gemini.timeout,
        circuitBreakerConfig: {
          errorThresholdPercentage: 55,
          resetTimeout: 20000,
          // Migrated from GeminiAdapter's former inner breaker: client/input
          // errors (aborts, 4xx except 429) must not trip circuit health.
          errorFilter: (err: Error) => {
            if (
              err instanceof ClientAbortError ||
              err.name === "ClientAbortError"
            ) {
              return true;
            }
            if (err instanceof APIError) {
              return (
                err.statusCode >= 400 &&
                err.statusCode < 500 &&
                err.statusCode !== 429
              );
            }
            return false;
          },
        },
        concurrencyLimiter: geminiLimiter,
      });
    },
    ["config", "geminiLimiter"],
  );

  container.register(
    "aiService",
    (
      openAIClient: LLMClient | null,
      groqClient: LLMClient | null,
      qwenClient: LLMClient | null,
      geminiClient: LLMClient | null,
      config: ServiceConfig,
      llmCallTelemetry: LlmCallTelemetryService | undefined,
    ) => {
      setProviderSettings({
        openai: { model: config.openai.model, timeout: config.openai.timeout },
        groq: { model: config.groq.model, timeout: config.groq.timeout },
        qwen: { model: config.qwen.model, timeout: config.qwen.timeout },
        gemini: { model: config.gemini.model, timeout: config.gemini.timeout },
      });

      return new AIModelService({
        clients: {
          openai: openAIClient,
          groq: groqClient,
          qwen: qwenClient,
          gemini: geminiClient,
        },
        ...(llmCallTelemetry ? { llmCallTelemetry } : {}),
      });
    },
    [
      "openAIClient",
      "groqClient",
      "qwenClient",
      "geminiClient",
      "config",
      "llmCallTelemetryService",
    ],
  );
}
