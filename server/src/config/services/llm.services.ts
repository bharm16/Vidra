import type { DIContainer } from "@infrastructure/DIContainer";
import { logger } from "@infrastructure/Logger";
import { LLMClient } from "@clients/LLMClient";
import { GeminiAdapter } from "@clients/adapters/GeminiAdapter";
import { GroqLlamaAdapter } from "@clients/adapters/GroqLlamaAdapter";
import { GroqQwenAdapter } from "@clients/adapters/GroqQwenAdapter";
import { OpenAICompatibleAdapter } from "@clients/adapters/OpenAICompatibleAdapter";
import { AIModelService } from "@services/ai-model/index";
import type { LlmCallTelemetryService } from "@services/observability/LlmCallTelemetryService";
import { setProviderSettings } from "@services/ai-model/routing/ExecutionPlan";
import { LlmProviderCircuitManager } from "@llm/failover/LlmProviderCircuitManager";
import type { ServiceConfig } from "./service-config.types.ts";

export function registerLLMServices(container: DIContainer): void {
  container.register(
    "openAIClient",
    (config: ServiceConfig) => {
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
      });
    },
    ["config"],
  );

  container.register(
    "groqClient",
    (config: ServiceConfig) => {
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
      });
    },
    ["config"],
  );

  container.register(
    "qwenClient",
    (config: ServiceConfig) => {
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
      });
    },
    ["config"],
  );

  container.register(
    "geminiClient",
    (config: ServiceConfig) => {
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
      });
    },
    ["config"],
  );

  container.register(
    "llmProviderCircuitManager",
    () => new LlmProviderCircuitManager(),
    [],
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
      llmProviderCircuitManager: LlmProviderCircuitManager,
    ) => {
      setProviderSettings({
        openai: { model: config.openai.model, timeout: config.openai.timeout },
        groq: { model: config.groq.model, timeout: config.groq.timeout },
        qwen: { model: config.qwen.model, timeout: config.qwen.timeout },
        gemini: { model: config.gemini.model, timeout: config.gemini.timeout },
      });

      const clients = {
        openai: openAIClient,
        groq: groqClient,
        qwen: qwenClient,
        gemini: geminiClient,
      };

      return new AIModelService({
        clients,
        ...(llmCallTelemetry ? { llmCallTelemetry } : {}),
        providerCircuit: llmProviderCircuitManager,
      });
    },
    [
      "openAIClient",
      "groqClient",
      "qwenClient",
      "geminiClient",
      "config",
      "llmCallTelemetryService",
      "llmProviderCircuitManager",
    ],
  );
}
