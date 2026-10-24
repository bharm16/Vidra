import { logger } from "@infrastructure/Logger";
import { extractResponseText } from "../JsonExtractor";
import { RetryPolicy } from "../RetryPolicy";
import { capabilitiesFor, type ProviderType } from "../provider/ProviderDetector";
import type { AIResponse } from "@interfaces/IAIClient";
import type { OperationName } from "@config/modelConfig";
import type { ExecuteParams } from "@services/ai-model/AIModelService";
import { enhancePromptForJSON, enhancePromptWithErrorFeedback } from "./promptEnhancers";
import { parseStructuredOutput } from "./parse";
import type { StructuredOutputCodec } from "./codec";

interface EnforceJSONOptions<T> {
  codec: StructuredOutputCodec<T>;
  maxRetries?: number;
  operation: OperationName;
  provider?: ProviderType;
  model?: string;
  signal?: AbortSignal;
  [key: string]: unknown;
}
interface AIService { execute(operation: OperationName, options: ExecuteParams): Promise<AIResponse>; }

/** Owns the wire schema, parsing, runtime decoding and bounded repair retries. */
export class StructuredOutputEnforcer {
  static async enforceJSON<T>(aiService: AIService, systemPrompt: string, options: EnforceJSONOptions<T>): Promise<T> {
    const { codec, maxRetries = 2, operation, provider: explicitProvider, model, ...restOptions } = options;
    if (!operation) throw new Error('StructuredOutputEnforcer.enforceJSON requires an "operation" option.');
    const schema = codec.schema;
    const isArray = schema.type === "array";
    const { provider, capabilities } = capabilitiesFor({ operation, model, client: explicitProvider });
    const hasStrictSchema = capabilities.strictJsonSchema && schema.strict === true;
    let prompt = enhancePromptForJSON(systemPrompt, isArray, hasStrictSchema, capabilities.needsPromptFormatInstructions, schema);
    const retryable = RetryPolicy.createApiErrorFilter();
    return RetryPolicy.execute(async () => {
      options.signal?.throwIfAborted();
      const response = await aiService.execute(operation, {
        systemPrompt: prompt,
        userMessage: "Please provide the output as specified.",
        ...restOptions,
        ...(model ? { model } : {}),
        schema,
        isArray,
        jsonMode: false,
      });
      options.signal?.throwIfAborted();
      const wire = parseStructuredOutput<unknown>(extractResponseText(response), schema, isArray);
      return codec.parse(wire);
    }, {
      maxRetries,
      shouldRetry: (error, attempt) => !options.signal?.aborted && retryable(error, attempt),
      onRetry: (error, attempt) => {
        prompt = enhancePromptWithErrorFeedback(systemPrompt, error.message, isArray, capabilities.needsPromptFormatInstructions, schema);
        logger.warn("Structured output extraction failed, retrying", { attempt, error: error.message, provider });
      },
    });
  }
}
