import { logger } from "@infrastructure/Logger";
import { extractResponseText } from "../JsonExtractor";
import { RetryPolicy } from "../RetryPolicy";
import {
  detectAndGetCapabilities,
  type ProviderType,
} from "../provider/ProviderDetector";
import type { AIResponse } from "@interfaces/IAIClient";
import type { OperationName } from "@config/modelConfig";
import type { ExecuteParams } from "@services/ai-model/AIModelService";
import {
  enhancePromptForJSON,
  enhancePromptWithErrorFeedback,
} from "./promptEnhancers";
import { parseStructuredOutput } from "./parse";
import { validateStructuredOutput } from "./validate";
import {
  unwrapSuggestionsArray,
  unwrapSuggestionsArrayWithSiblings,
} from "./unwrapper";
import type { StructuredOutputSchema } from "./types";

interface EnforceJSONOptions {
  schema?: StructuredOutputSchema | null;
  isArray?: boolean;
  maxRetries?: number;
  operation: OperationName;
  /** Explicit provider override (auto-detected if not provided) */
  provider?: ProviderType;
  /** Model being used (helps with provider detection) */
  model?: string;
  /**
   * When true, enforceJSON returns `{ value, siblings }` where siblings
   * are the parent object's non-`suggestions` fields. Used to capture
   * LLM-emitted metadata alongside the unwrapped array. Default: false
   * (existing callers receive T unchanged).
   */
  captureSiblings?: boolean;
  [key: string]: unknown;
}

interface AIService {
  execute(
    operation: OperationName,
    options: ExecuteParams,
  ): Promise<AIResponse>;
}

/**
 * Structured Output Enforcer
 *
 * Ensures LLM responses return valid JSON in the expected format.
 *
 * Provider-Aware Optimizations:
 * - OpenAI with strict schema: Skip prompt format instructions (grammar-constrained)
 * - OpenAI with developerMessage: Use developer role for hard constraints
 * - Groq/Llama: Use sandwich prompting and format instructions
 * - Auto-unwrap: Handles {"suggestions": [...]} wrapper for json_object mode
 *
 * Performance Improvements:
 * - ~10-15% faster for OpenAI with strict schema (fewer constraint tokens)
 * - More reliable JSON output across providers
 */
export class StructuredOutputEnforcer {
  /**
   * Enforce structured JSON output from an AI service
   */
  static async enforceJSON<T = unknown>(
    aiService: AIService,
    systemPrompt: string,
    options: EnforceJSONOptions,
  ): Promise<T> {
    const {
      schema = null,
      isArray = false,
      maxRetries = 2,
      operation,
      provider: explicitProvider,
      model,
      ...restOptions
    } = options;

    if (!operation) {
      throw new Error(
        'StructuredOutputEnforcer.enforceJSON requires an "operation" option.',
      );
    }

    // Detect provider and capabilities
    const { provider, capabilities } = detectAndGetCapabilities({
      operation,
      model,
      client: explicitProvider,
    });

    // Determine if we should add format instructions to the prompt
    const hasStrictSchema = !!schema && capabilities.strictJsonSchema;

    logger.debug("StructuredOutputEnforcer: Provider detection", {
      operation,
      provider,
      hasStrictSchema,
      needsPromptFormatInstructions: capabilities.needsPromptFormatInstructions,
    });

    // Conditionally enhance prompt based on provider capabilities
    let currentSystemPrompt = enhancePromptForJSON(
      systemPrompt,
      isArray,
      hasStrictSchema,
      capabilities.needsPromptFormatInstructions,
      schema,
    );

    // Use RetryPolicy to wrap JSON extraction
    return RetryPolicy.execute(
      async () => {
        logger.debug("Attempting structured output extraction", {
          maxRetries: maxRetries + 1,
          provider,
          hasStrictSchema,
        });

        // Make API call through AIModelService
        const response = await this._callAIService(
          aiService,
          operation,
          currentSystemPrompt,
          {
            ...restOptions,
            isArray,
            // Pass provider info for downstream optimizations
            _providerHint: provider,
            _hasStrictSchema: hasStrictSchema,
          },
        );

        // Extract text from response
        const responseText = extractResponseText(response);

        let parsedJSON: T;
        try {
          parsedJSON = parseStructuredOutput<T>(responseText, schema, isArray);
        } catch (parseError) {
          const errorMessage =
            parseError instanceof Error
              ? parseError.message
              : String(parseError);
          const errorObj =
            parseError instanceof Error ? parseError : new Error(errorMessage);
          logger.error("Failed to parse JSON response", errorObj, {
            cleanedResponse: responseText.substring(0, 200),
            fullLength: responseText.length,
            provider,
            hasStrictSchema,
          });
          throw parseError;
        }

        // Validate against schema if provided
        // NOTE: This validates the raw parsed response BEFORE auto-unwrapping,
        // since the schema describes the wire format (e.g., {"suggestions": [...]} for Groq)
        if (schema) {
          validateStructuredOutput(parsedJSON, schema);
        }

        if (options.captureSiblings) {
          const captured = unwrapSuggestionsArrayWithSiblings<T>(
            parsedJSON,
            isArray,
          );
          if (captured.unwrapped) {
            logger.debug(
              "Auto-unwrapping suggestions array from object wrapper",
            );
          }
          logger.debug("Successfully extracted structured output", {
            type: isArray ? "array" : "object",
            provider,
            siblingsCount: Object.keys(captured.siblings).length,
          });
          return {
            value: captured.value,
            siblings: captured.siblings,
          } as unknown as T;
        }

        const unwrapped = unwrapSuggestionsArray(parsedJSON, isArray);
        if (unwrapped.unwrapped) {
          logger.debug("Auto-unwrapping suggestions array from object wrapper");
        }

        parsedJSON = unwrapped.value;

        logger.debug("Successfully extracted structured output", {
          type: isArray ? "array" : "object",
          provider,
        });

        return parsedJSON;
      },
      {
        maxRetries,
        shouldRetry: RetryPolicy.createApiErrorFilter(),
        onRetry: (error, attempt) => {
          // Enhance prompt with error feedback for next attempt
          // Always add error context on retry, regardless of provider
          currentSystemPrompt = enhancePromptWithErrorFeedback(
            systemPrompt,
            error.message,
            isArray,
            capabilities.needsPromptFormatInstructions,
            schema,
          );
          logger.warn("Structured output extraction failed, retrying", {
            attempt,
            error: error.message,
            provider,
          });
        },
      },
    );
  }

  /**
   * Call AI Service to get a completion
   *
   * Passes through provider hints for downstream optimization
   * @private
   */
  private static async _callAIService(
    aiService: AIService,
    operation: OperationName,
    systemPrompt: string,
    options: Record<string, unknown> & { schema?: Record<string, unknown> },
  ): Promise<AIResponse> {
    const executeOptions: ExecuteParams = {
      systemPrompt,
      userMessage: "Please provide the output as specified.",
      ...options,
    };

    // If schema is provided, pass it through for strict mode
    // The adapter will convert this to response_format: { type: "json_schema", ... }
    if (options.schema && typeof options.schema === "object") {
      executeOptions.schema = options.schema;
      // Remove jsonMode since strict schema mode supersedes it
      delete executeOptions.jsonMode;
    }

    return await aiService.execute(operation, executeOptions);
  }
}
