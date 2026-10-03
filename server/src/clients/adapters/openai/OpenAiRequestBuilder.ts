/**
 * OpenAiRequestBuilder - Builds request payloads for OpenAI-compatible APIs
 */

import type { CompletionOptions, OpenAiPayload } from "./types.ts";
import { OpenAiMessageBuilder } from "./OpenAiMessageBuilder.ts";
import { hashString } from "@utils/hash";
import { normalizeOpenAiSchema } from "./normalizeSchema.ts";

interface RequestBuilderConfig {
  defaultModel: string;
  supportsPredictedOutputs: boolean;
}

export class OpenAiRequestBuilder {
  constructor(
    private readonly messageBuilder: OpenAiMessageBuilder,
    private readonly config: RequestBuilderConfig,
  ) {}

  buildPayload(
    systemPrompt: string,
    options: CompletionOptions,
    stream: boolean = false,
  ): OpenAiPayload {
    const messages = this.messageBuilder.buildMessages(systemPrompt, options);

    const isStructuredOutput = !!(
      options.schema ||
      options.responseFormat ||
      options.jsonMode
    );
    const defaultTemp = isStructuredOutput ? 0.0 : 0.7;
    const temperature =
      options.temperature !== undefined ? options.temperature : defaultTemp;

    const model = options.model || this.config.defaultModel;
    // The configured studio reasoning model requires this native field on
    // the FIRST request. Keep the adapter's error-driven compatibility retry
    // for other models; do not spend a rejected POST discovering a known rule.
    // https://developers.openai.com/api/reference/typescript/resources/chat/subresources/completions/methods/create
    const usesCompletionTokenLimit = model === "gpt-5.6-luna";
    const payload: OpenAiPayload = {
      model,
      messages,
      ...(usesCompletionTokenLimit
        ? { max_completion_tokens: options.maxTokens || 2048 }
        : { max_tokens: options.maxTokens || 2048 }),
      temperature,
      ...(stream ? { stream: true } : {}),
    };

    if (options.seed !== undefined) {
      payload.seed = options.seed;
    } else if (isStructuredOutput) {
      payload.seed = hashString(systemPrompt) % 2147483647;
    }

    if (!stream && options.logprobs) {
      payload.logprobs = true;
      payload.top_logprobs = Math.min(options.topLogprobs ?? 3, 20);
    }

    if (!stream && options.prediction && this.config.supportsPredictedOutputs) {
      payload.prediction = options.prediction;
    }

    if (options.schema) {
      const { name, schema } = normalizeOpenAiSchema(options.schema);
      payload.response_format = {
        type: "json_schema",
        json_schema: {
          name,
          strict: true,
          schema,
        },
      };
    } else if (options.responseFormat) {
      payload.response_format = options.responseFormat;
    } else if (options.jsonMode && !options.isArray) {
      payload.response_format = { type: "json_object" };
    }

    if (isStructuredOutput) {
      payload.frequency_penalty = 0;
    }

    if (temperature === 0) {
      payload.top_p = 1.0;
    }

    if (!stream && options.store !== undefined) {
      payload.store = options.store;
    }

    if (stream && options.streamOptions) {
      payload.stream_options = options.streamOptions;
    }

    return payload;
  }
}
