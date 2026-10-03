import { AIModelService } from "../../server/src/services/ai-model/AIModelService.js";
import { ModelConfig } from "../../server/src/config/modelConfig.js";
import { GroqLlamaAdapter } from "../../server/src/clients/adapters/GroqLlamaAdapter.js";
import { OpenAICompatibleAdapter } from "../../server/src/clients/adapters/OpenAICompatibleAdapter.js";

export type GoldenSetProvider = "groq" | "openai";

/** Pin the evaluated operation before resolving it; never measure a fallback. */
export function createGoldenSetAIService(
  requested: GoldenSetProvider | "auto",
  env: Readonly<Record<string, string | undefined>>,
): { service: AIModelService; provider: GoldenSetProvider; model: string } {
  const provider =
    requested === "auto" ? (env.GROQ_API_KEY ? "groq" : "openai") : requested;
  const apiKey = provider === "groq" ? env.GROQ_API_KEY : env.OPENAI_API_KEY;
  if (!apiKey)
    throw new Error(
      `Missing ${provider === "groq" ? "GROQ_API_KEY" : "OPENAI_API_KEY"} for golden-set evaluation`,
    );

  const adapter =
    provider === "groq"
      ? new GroqLlamaAdapter({
          apiKey,
          ...(env.GROQ_MODEL ? { defaultModel: env.GROQ_MODEL } : {}),
          baseURL: env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
          defaultTimeout: Number(env.GROQ_TIMEOUT_MS || 30000),
        })
      : new OpenAICompatibleAdapter({
          apiKey,
          defaultModel: env.OPENAI_MODEL || "gpt-4o-mini",
          baseURL: env.OPENAI_BASE_URL || "https://api.openai.com/v1",
          defaultTimeout: Number(env.OPENAI_TIMEOUT_MS || 60000),
          providerName: "openai",
        });
  // The router's configuration was loaded before CLI flags and dotenv. An env
  // write here cannot change that snapshot. Pin this CLI-owned operation itself.
  const model =
    provider === "groq"
      ? env.GROQ_MODEL || "llama-3.1-8b-instant"
      : env.OPENAI_MODEL || "gpt-4o-mini";
  ModelConfig.span_labeling = {
    ...ModelConfig.span_labeling,
    client: provider,
    model,
    strictClient: true,
  };
  const service = new AIModelService({
    clients:
      provider === "groq"
        ? { openai: null, groq: adapter }
        : { openai: adapter },
  });
  return { service, provider, model };
}
