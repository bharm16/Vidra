/**
 * OpenAI Compatible Adapter (GPT-4o Optimized)
 *
 * Implements GPT-4o API best practices from:
 * "Optimal Prompt Architecture and API Implementation Strategies for GPT-4o"
 *
 * Key GPT-4o Optimizations:
 * - Temperature 0.0 for structured output (deterministic)
 * - top_p 1.0 when temperature is 0 (per API docs)
 * - frequency_penalty 0 for JSON (structural tokens must repeat)
 * - Developer role for hard constraints (highest priority)
 * - Bookending strategy for long prompts (>30k tokens)
 * - Native Structured Outputs (json_schema strict mode)
 *
 * Additional Optimizations:
 * - Seed parameter for reproducibility and caching
 * - Logprobs for token-level confidence
 * - Predicted outputs for faster structured responses
 * - Response validation with automatic retry
 */

import { APIError, TimeoutError, ClientAbortError } from "../LLMClient.ts";
import { logger } from "@infrastructure/Logger";
import { createAbortController } from "@clients/utils/abortController";
import { sleep } from "@utils/sleep";
import type { ILogger } from "@interfaces/ILogger";
import { validateLLMResponse } from "./ResponseValidator.js";
import { OpenAiMessageBuilder } from "./openai/OpenAiMessageBuilder.ts";
import { OpenAiRequestBuilder } from "./openai/OpenAiRequestBuilder.ts";
import { OpenAiResponseParser } from "./openai/OpenAiResponseParser.ts";
import { OpenAiStreamParser } from "./openai/OpenAiStreamParser.ts";
import type {
  CompletionOptions,
  AdapterConfig,
  OpenAIResponseData,
  OpenAiPayload,
  AIResponse,
} from "./openai/types.ts";

/**
 * Adapter for OpenAI-compatible chat completion APIs
 * (OpenAI, Azure OpenAI, etc.)
 *
 * Note: For Groq/Llama 3, use GroqLlamaAdapter instead
 * (different temperature, penalties, and optimizations)
 */
export class OpenAICompatibleAdapter {
  private apiKey: string;
  private baseURL: string;
  private defaultModel: string;
  private defaultTimeout: number;
  private providerName: string;
  private readonly log: ILogger;
  private readonly messageBuilder: OpenAiMessageBuilder;
  private readonly requestBuilder: OpenAiRequestBuilder;
  private readonly responseParser: OpenAiResponseParser;
  private readonly streamParser: OpenAiStreamParser;
  public capabilities: {
    streaming: boolean;
    logprobs: boolean;
    seed: boolean;
    predictedOutputs: boolean;
    developerRole: boolean;
    structuredOutputs: boolean;
  };

  constructor({
    apiKey,
    baseURL,
    defaultModel,
    defaultTimeout = 60000,
    providerName = "openai",
  }: AdapterConfig) {
    this.log = logger.child({
      service: "OpenAICompatibleAdapter",
      provider: providerName,
    });
    if (!apiKey) {
      throw new Error(`API key required for ${providerName}`);
    }
    if (!baseURL) {
      throw new Error(`Base URL required for ${providerName}`);
    }
    if (!defaultModel) {
      throw new Error(`Default model required for ${providerName}`);
    }

    this.apiKey = apiKey;
    this.baseURL = baseURL.replace(/\/$/, "");
    this.defaultModel = defaultModel;
    this.defaultTimeout = defaultTimeout;
    this.providerName = providerName;
    this.capabilities = {
      streaming: true,
      logprobs: true,
      seed: true,
      predictedOutputs: providerName === "openai",
      developerRole: true,
      structuredOutputs: true,
    };

    this.messageBuilder = new OpenAiMessageBuilder();
    this.requestBuilder = new OpenAiRequestBuilder(this.messageBuilder, {
      defaultModel: this.defaultModel,
      supportsPredictedOutputs: this.capabilities.predictedOutputs,
    });
    this.responseParser = new OpenAiResponseParser(this.providerName);
    this.streamParser = new OpenAiStreamParser();
  }

  /**
   * Complete a chat request with GPT-4o optimizations
   */
  async complete(
    systemPrompt: string,
    options: CompletionOptions = {},
  ): Promise<AIResponse> {
    const startTime = performance.now();
    const operation = "complete";
    const maxRetries = options.maxRetries ?? 2;
    const shouldRetry = options.retryOnValidationFailure ?? true;
    let lastError: Error | null = null;
    let attempt = 0;

    this.log.debug("Starting operation.", {
      operation,
      model: options.model || this.defaultModel,
      maxTokens: options.maxTokens,
      hasSchema: !!options.schema,
      jsonMode: options.jsonMode,
      attempt: attempt + 1,
    });

    while (attempt <= maxRetries) {
      try {
        const response = await this._executeRequest(systemPrompt, options);

        if (options.jsonMode || options.schema || options.responseFormat) {
          const validation = validateLLMResponse(response.text, {
            expectJson: true,
            ...(options.isArray !== undefined && {
              expectArray: options.isArray,
            }),
          });

          if (!validation.isValid) {
            if (shouldRetry && attempt < maxRetries) {
              this.log.warn("OpenAI response validation failed, retrying", {
                operation,
                attempt: attempt + 1,
                errors: validation.errors,
                responsePreview: response.text.substring(0, 200),
              });
              attempt++;
              continue;
            }

            response.metadata.validation = validation;
          } else {
            response.metadata.validation = validation;
          }
        }

        this.log.info("Operation completed.", {
          operation,
          duration: Math.round(performance.now() - startTime),
          attempt: attempt + 1,
          responseLength: response.text?.length || 0,
          model: options.model || this.defaultModel,
        });

        return response;
      } catch (error) {
        lastError = error as Error;

        if (
          error instanceof APIError &&
          error.isRetryable &&
          attempt < maxRetries
        ) {
          this.log.warn("OpenAI API error, retrying", {
            operation,
            attempt: attempt + 1,
            status: error.statusCode,
            error: error.message,
          });
          attempt++;
          await sleep(Math.pow(2, attempt) * 500);
          continue;
        }

        this.log.error("Operation failed.", error as Error, {
          operation,
          duration: Math.round(performance.now() - startTime),
          attempt: attempt + 1,
          maxRetries,
        });

        throw error;
      }
    }

    throw lastError || new Error("Max retries exceeded");
  }

  /**
   * Execute a single request (internal, supports retry logic)
   */
  private async _executeRequest(
    systemPrompt: string,
    options: CompletionOptions,
  ): Promise<AIResponse> {
    const timeout = options.timeout || this.defaultTimeout;
    const { controller, timeoutId, abortedByTimeout } = createAbortController(
      timeout,
      options.signal,
    );

    try {
      const payload = this.requestBuilder.buildPayload(
        systemPrompt,
        options,
        false,
      );

      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();

        // gpt-5/o1/o3/o4 reject `max_tokens` and require `max_completion_tokens`.
        // OpenAI's error message explicitly names the replacement field, so we
        // retry once with the rename when we see it — same behavior-driven
        // pattern as the logprobs retry in AIModelService. No model-name
        // classification needed; the API itself tells us what to do.
        if (
          response.status === 400 &&
          errorBody.includes("max_completion_tokens") &&
          payload.max_tokens !== undefined
        ) {
          const retryPayload: OpenAiPayload = { ...payload };
          retryPayload.max_completion_tokens = payload.max_tokens;
          delete retryPayload.max_tokens;

          this.log.warn(
            "OpenAI rejected max_tokens; retrying with max_completion_tokens",
            {
              operation: "_executeRequest",
              model: payload.model,
            },
          );

          const retryResponse = await fetch(
            `${this.baseURL}/chat/completions`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${this.apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(retryPayload),
              signal: controller.signal,
            },
          );

          if (retryResponse.ok) {
            const data = (await retryResponse.json()) as OpenAIResponseData;
            return this.responseParser.parseResponse(data, options);
          }
          // Fall through to error reporting using the original errorBody so
          // callers see the API's actual rejection message, not a follow-up.
        }

        // Some models reject `logprobs` when they don't support it, naming
        // "logprobs" in the rejection. The status varies by model family
        // (gpt-4o → 400 "not supported"; gpt-5 → 403 "not allowed"), so we
        // match the API's own error body — NOT the status — and retry once
        // without logprobs. Behavior-driven, like the max_tokens retry above;
        // no model-name classification.
        const lowerErrorBody = errorBody.toLowerCase();
        if (
          payload.logprobs !== undefined &&
          lowerErrorBody.includes("logprobs") &&
          (lowerErrorBody.includes("not supported") ||
            lowerErrorBody.includes("not allowed") ||
            lowerErrorBody.includes("unsupported"))
        ) {
          const retryPayload: OpenAiPayload = { ...payload };
          delete retryPayload.logprobs;
          delete retryPayload.top_logprobs;

          this.log.warn("OpenAI rejected logprobs; retrying without logprobs", {
            operation: "_executeRequest",
            model: payload.model,
          });

          const retryResponse = await fetch(
            `${this.baseURL}/chat/completions`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${this.apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(retryPayload),
              signal: controller.signal,
            },
          );

          if (retryResponse.ok) {
            const data = (await retryResponse.json()) as OpenAIResponseData;
            return this.responseParser.parseResponse(data, options);
          }
          // Fall through to error reporting using the original errorBody so
          // callers see the API's actual rejection message, not a follow-up.
        }

        const isRetryable = response.status >= 500 || response.status === 429;
        const apiError = new APIError(
          `${this.providerName} API error: ${response.status} - ${errorBody}`,
          response.status,
          isRetryable,
        );

        this.log.warn("OpenAI API request failed", {
          operation: "_executeRequest",
          status: response.status,
          isRetryable,
          error: errorBody.substring(0, 200),
        });

        throw apiError;
      }

      const data = (await response.json()) as OpenAIResponseData;
      return this.responseParser.parseResponse(data, options);
    } catch (error) {
      clearTimeout(timeoutId);

      const errorObj = error as Error;
      if (errorObj.name === "AbortError") {
        if (abortedByTimeout.value) {
          const timeoutError = new TimeoutError(
            `${this.providerName} API request timeout after ${timeout}ms`,
          );
          this.log.warn("OpenAI API request timeout", {
            operation: "_executeRequest",
            timeout,
          });
          throw timeoutError;
        }

        const clientAbortError = new ClientAbortError(
          `${this.providerName} API request aborted by client`,
        );
        this.log.debug("OpenAI API request aborted by client", {
          operation: "_executeRequest",
        });
        throw clientAbortError;
      }

      this.log.error("OpenAI API request error", errorObj, {
        operation: "_executeRequest",
      });

      throw errorObj;
    }
  }

  async streamComplete(
    systemPrompt: string,
    options: CompletionOptions & { onChunk: (chunk: string) => void },
  ): Promise<string> {
    const timeout = options.timeout || this.defaultTimeout;
    const { controller, timeoutId, abortedByTimeout } = createAbortController(
      timeout,
      options.signal,
    );

    try {
      const payload = this.requestBuilder.buildPayload(
        systemPrompt,
        options,
        true,
      );

      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        const isRetryable = response.status >= 500 || response.status === 429;
        throw new APIError(
          `${this.providerName} API error: ${response.status} - ${errorBody}`,
          response.status,
          isRetryable,
        );
      }

      return await this.streamParser.readStream(response, options.onChunk);
    } catch (error) {
      clearTimeout(timeoutId);

      const errorObj = error as Error;
      if (errorObj.name === "AbortError") {
        if (abortedByTimeout.value) {
          const timeoutError = new TimeoutError(
            `${this.providerName} streaming request timeout after ${timeout}ms`,
          );
          this.log.warn("OpenAI streaming request timeout", {
            operation: "streamComplete",
            timeout,
          });
          throw timeoutError;
        }

        const clientAbortError = new ClientAbortError(
          `${this.providerName} streaming request aborted by client`,
        );
        this.log.debug("OpenAI streaming request aborted by client", {
          operation: "streamComplete",
        });
        throw clientAbortError;
      }

      throw errorObj;
    }
  }

  async healthCheck(): Promise<{
    healthy: boolean;
    provider: string;
    error?: string;
  }> {
    try {
      await this.complete(
        'Respond with valid JSON containing: {"status": "healthy"}',
        {
          maxTokens: 50,
          timeout: Math.min(30000, this.defaultTimeout),
          jsonMode: true,
          retryOnValidationFailure: false,
        },
      );

      return { healthy: true, provider: this.providerName };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        healthy: false,
        provider: this.providerName,
        error: errorMessage,
      };
    }
  }
}
