import { getFewShotExamples } from "../../utils/promptBuilder";
import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";
import type { ExecuteParams } from "@services/ai-model/AIModelService";

/**
 * Response from callModel with full metadata
 */
export interface ModelResponse {
  text: string;
  metadata?: {
    averageConfidence?: number;
    logprobs?: unknown[];
    provider?: string;
    optimizations?: string[];
    [key: string]: unknown;
  };
}

/**
 * Provider-specific request options
 * Subclasses configure these via hooks
 */
export interface ProviderRequestOptions {
  signal?: AbortSignal;
  enableBookending: boolean;
  useFewShot: boolean;
  useSeedFromConfig: boolean;
  enableLogprobs: boolean;
  developerMessage?: string | undefined;
  providerName?: string | undefined;
}

/**
 * Call LLM with system prompt and user payload using AIModelService
 *
 * This is a shared utility - provider-specific options are passed in.
 */
export async function callModel({
  systemPrompt,
  userPayload,
  aiService,
  maxTokens,
  providerOptions,
  schema,
}: {
  systemPrompt: string;
  userPayload: string;
  aiService: AIExecutionPort;
  maxTokens: number;
  providerOptions: ProviderRequestOptions;
  schema?: Record<string, unknown>;
}): Promise<ModelResponse> {
  const requestOptions: ExecuteParams = {
    systemPrompt,
    ...(providerOptions.signal ? { signal: providerOptions.signal } : {}),
    userMessage: userPayload,
    maxTokens,
    jsonMode: !schema,
    enableBookending: providerOptions.enableBookending,
    useSeedFromConfig: providerOptions.useSeedFromConfig,
    logprobs: providerOptions.enableLogprobs,
  };

  if (providerOptions.developerMessage) {
    requestOptions.developerMessage = providerOptions.developerMessage;
  }

  if (schema) {
    requestOptions.schema = schema;
  }

  if (providerOptions.useFewShot) {
    const fewShotExamples = getFewShotExamples(
      providerOptions.providerName || "groq",
    );
    const payloadObj = JSON.parse(userPayload);

    requestOptions.messages = [
      { role: "system", content: systemPrompt },
      ...fewShotExamples,
      { role: "user", content: payloadObj.text },
    ];
    requestOptions.enableSandwich = true;
  }

  const response = await aiService.execute("span_labeling", requestOptions);

  let text = "";
  if (response.text) {
    text = response.text;
  } else if (
    response.content &&
    Array.isArray(response.content) &&
    response.content.length > 0
  ) {
    text = response.content[0]?.text || "";
  }

  return {
    text,
    metadata: response.metadata || {},
  };
}
