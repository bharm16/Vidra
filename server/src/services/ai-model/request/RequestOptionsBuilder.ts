import { shouldUseSeed } from "@config/modelConfig";
import { hashString } from "@utils/hash";
import type { ProviderCapabilities } from "@utils/provider/ProviderDetector";
import { resolveDeveloperMessage } from "../policy/DeveloperMessagePolicy";
import type { ExecuteParams, ModelConfigEntry, RequestOptions } from "../types";

interface BuildRequestOptionsInput {
  operation: string;
  params: ExecuteParams;
  config: ModelConfigEntry;
  capabilities: ProviderCapabilities;
  responseFormat?: { type: string; [key: string]: unknown };
  jsonMode: boolean;
}

export function buildRequestOptions(
  input: BuildRequestOptionsInput,
): RequestOptions {
  const { operation, params, config, capabilities, responseFormat, jsonMode } =
    input;
  const {
    schema: schemaOverride,
    responseFormat: responseFormatOverride,
    ...restParams
  } = params;
  void responseFormatOverride;

  const requestOptions: RequestOptions = {
    ...restParams,
    model: (params.model as string | undefined) || config.model,
    temperature:
      params.temperature !== undefined
        ? params.temperature
        : config.temperature,
    maxTokens: params.maxTokens || config.maxTokens,
    timeout: params.timeout || config.timeout,
    jsonMode,
    ...(responseFormat ? { responseFormat } : {}),
    ...(schemaOverride ? { schema: schemaOverride } : {}),
    enableBookending:
      params.enableBookending !== undefined
        ? params.enableBookending
        : capabilities.bookending,
  };

  if (capabilities.developerRole) {
    const developerMessage = resolveDeveloperMessage({
      operation,
      params,
      hasStructuredOutput: jsonMode || !!responseFormat,
      hasStrictSchema: !!params.schema && capabilities.strictJsonSchema,
    });

    if (developerMessage) {
      requestOptions.developerMessage = developerMessage;
    }
  }

  if (params.seed !== undefined) {
    requestOptions.seed = params.seed;
  } else if (shouldUseSeed(operation) || params.useSeedFromConfig) {
    requestOptions.seed = hashString(params.systemPrompt) % 2147483647;
  }

  if (params.logprobs !== undefined) {
    requestOptions.logprobs = params.logprobs;
    if (params.topLogprobs !== undefined) {
      requestOptions.topLogprobs = params.topLogprobs;
    }
  }

  const thinkingBudget = params.thinkingBudget ?? config.thinkingBudget;
  if (thinkingBudget !== undefined) {
    requestOptions.thinkingBudget = thinkingBudget;
  }

  return requestOptions;
}
