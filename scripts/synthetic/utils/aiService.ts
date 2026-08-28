/**
 * Synthetic-harness aiService factory.
 *
 * Mirrors the production DI registration in server/src/config/services/llm.services.ts
 * but constructs the AIModelService directly from env vars, without needing a
 * full DIContainer + ServiceConfig wiring. Optional llmCallTelemetry hook lets
 * the harness emit real `llm.call.completed` events under the synthetic source
 * frame — replacing the fake `deps.llm.record(...)` calls in the drivers.
 */

import { LLMClient } from "../../../server/src/clients/LLMClient.js";
import { DEFAULT_QWEN_MODEL } from "../../../server/src/config/modelConfig.js";
import { GeminiAdapter } from "../../../server/src/clients/adapters/GeminiAdapter.js";
import { GroqLlamaAdapter } from "../../../server/src/clients/adapters/GroqLlamaAdapter.js";
import { GroqQwenAdapter } from "../../../server/src/clients/adapters/GroqQwenAdapter.js";
import { OpenAICompatibleAdapter } from "../../../server/src/clients/adapters/OpenAICompatibleAdapter.js";
import { ConcurrencyLimiter } from "../../../server/src/infrastructure/ConcurrencyLimiter.js";
import { AIModelService } from "../../../server/src/services/ai-model/index.js";
import { setProviderSettings } from "../../../server/src/services/ai-model/routing/ExecutionPlan.js";
import type { LlmCallTelemetryService } from "../../../server/src/services/observability/LlmCallTelemetryService.js";

export interface SyntheticAIServiceDeps {
  llmCallTelemetry?: LlmCallTelemetryService;
}

/**
 * Defaults intentionally match server/src/config/env.ts so harness traffic
 * exercises the same provider timing as production. Drift here masks slow-
 * provider regressions that would surface in real requests.
 */
const DEFAULTS = {
  openAITimeout: 60000,
  groqTimeout: 5000,
  qwenTimeout: 10000,
  geminiTimeout: 30000,
  openAIModel: "gpt-4o-mini",
  groqModel: "llama-3.1-8b-instant",
  qwenModel: DEFAULT_QWEN_MODEL,
  geminiModel: "gemini-2.5-flash",
  geminiBaseURL: "https://generativelanguage.googleapis.com/v1beta",
} as const;

function makeLimiter(): ConcurrencyLimiter {
  return new ConcurrencyLimiter({
    maxConcurrent: 5,
    queueTimeout: 30000,
    enableCancellation: true,
  });
}

export function createSyntheticAIService(
  deps: SyntheticAIServiceDeps = {},
): AIModelService {
  const openAITimeout = Number(
    process.env.OPENAI_TIMEOUT_MS ?? DEFAULTS.openAITimeout,
  );
  const groqTimeout = Number(
    process.env.GROQ_TIMEOUT_MS ?? DEFAULTS.groqTimeout,
  );
  const qwenTimeout = Number(
    process.env.QWEN_TIMEOUT_MS ?? DEFAULTS.qwenTimeout,
  );
  const geminiTimeout = Number(
    process.env.GEMINI_TIMEOUT_MS ?? DEFAULTS.geminiTimeout,
  );

  const openAIModel = process.env.OPENAI_MODEL ?? DEFAULTS.openAIModel;
  const groqModel = process.env.GROQ_MODEL ?? DEFAULTS.groqModel;
  const qwenModel = process.env.QWEN_MODEL ?? DEFAULTS.qwenModel;
  const geminiModel = process.env.GEMINI_MODEL ?? DEFAULTS.geminiModel;
  const geminiBaseURL = process.env.GEMINI_BASE_URL ?? DEFAULTS.geminiBaseURL;

  const openAIClient = process.env.OPENAI_API_KEY
    ? new LLMClient({
        adapter: new OpenAICompatibleAdapter({
          apiKey: process.env.OPENAI_API_KEY,
          baseURL: "https://api.openai.com/v1",
          defaultModel: openAIModel,
          defaultTimeout: openAITimeout,
          providerName: "openai",
        }),
        providerName: "openai",
        defaultTimeout: openAITimeout,
        circuitBreakerConfig: {
          errorThresholdPercentage: 50,
          resetTimeout: 30000,
        },
        concurrencyLimiter: makeLimiter(),
      })
    : null;

  // Groq and Qwen share the same API key + endpoint, so prod shares one
  // ConcurrencyLimiter instance between them (server/src/config/services/llm.services.ts).
  // Two separate limiters here would let synthetic traffic hit 429s the prod
  // path actively avoids.
  const groqQwenLimiter = makeLimiter();

  const groqClient = process.env.GROQ_API_KEY
    ? new LLMClient({
        adapter: new GroqLlamaAdapter({
          apiKey: process.env.GROQ_API_KEY,
          defaultModel: groqModel,
          defaultTimeout: groqTimeout,
        }),
        providerName: "groq",
        defaultTimeout: groqTimeout,
        circuitBreakerConfig: {
          errorThresholdPercentage: 60,
          resetTimeout: 15000,
        },
        concurrencyLimiter: groqQwenLimiter,
      })
    : null;

  const qwenClient = process.env.GROQ_API_KEY
    ? new LLMClient({
        adapter: new GroqQwenAdapter({
          apiKey: process.env.GROQ_API_KEY,
          defaultModel: qwenModel,
          defaultTimeout: qwenTimeout,
        }),
        providerName: "qwen",
        defaultTimeout: qwenTimeout,
        circuitBreakerConfig: {
          errorThresholdPercentage: 60,
          resetTimeout: 15000,
        },
        concurrencyLimiter: groqQwenLimiter,
      })
    : null;

  const geminiClient = process.env.GEMINI_API_KEY
    ? new LLMClient({
        adapter: new GeminiAdapter({
          apiKey: process.env.GEMINI_API_KEY,
          baseURL: geminiBaseURL,
          defaultModel: geminiModel,
          defaultTimeout: geminiTimeout,
          providerName: "gemini",
        }),
        providerName: "gemini",
        defaultTimeout: geminiTimeout,
        circuitBreakerConfig: {
          errorThresholdPercentage: 55,
          resetTimeout: 20000,
        },
        concurrencyLimiter: makeLimiter(),
      })
    : null;

  setProviderSettings({
    openai: { model: openAIModel, timeout: openAITimeout },
    groq: { model: groqModel, timeout: groqTimeout },
    qwen: { model: qwenModel, timeout: groqTimeout },
    gemini: { model: geminiModel, timeout: geminiTimeout },
  });

  return new AIModelService({
    clients: {
      openai: openAIClient,
      groq: groqClient,
      qwen: qwenClient,
      gemini: geminiClient,
    },
    ...(deps.llmCallTelemetry
      ? { llmCallTelemetry: deps.llmCallTelemetry }
      : {}),
  });
}
