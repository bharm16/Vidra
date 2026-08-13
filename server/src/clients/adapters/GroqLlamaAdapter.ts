/**
 * Groq/Llama 3 Optimized Adapter
 *
 * Implements Llama 3 API best practices from:
 * "Optimizing Instruction Adherence and API Integration Strategies for the Llama Model Family"
 *
 * Key Llama 3 Optimizations:
 * - Section 4.1: Temperature 0.1 (not 0.0 - avoids repetition loops)
 * - Section 4.1: top_p 0.95 for strict instruction following
 * - Section 4.2: repetition_penalty disabled for JSON (structural tokens must repeat)
 * - Section 3.1: System prompt priming (GAtt mechanism leverages system block)
 * - Section 3.2: Sandwich prompting for format adherence
 * - Section 3.3: Pre-fill assistant response for guaranteed JSON start
 * - Section 5.1: XML tagging reduces context blending by 23%
 * - Section 3.3: TypeScript interfaces for token efficiency (60% reduction)
 *
 * Additional Optimizations:
 * - Seed parameter for reproducibility and caching
 * - Logprobs for token-level confidence (more reliable than self-reported)
 * - Response validation with automatic retry
 * - Context size monitoring (8B model optimal: 8k-32k tokens)
 * - Aggressive max_tokens for structured output (prevents runaway generation)
 */

import { APIError, TimeoutError, ClientAbortError } from "../LLMClient.ts";
import { logger } from "@infrastructure/Logger";
import { createAbortController } from "@clients/utils/abortController";
import { sleep } from "@utils/sleep";
import type { ILogger } from "@interfaces/ILogger";
import type {
  GroqAdapterConfig,
  GroqResponseData,
  LlamaCompletionOptions,
  LogprobInfo,
} from "./groq/types";
import type { AIResponse } from "@interfaces/IAIClient";
import {
  buildGroqPayload,
  takeUndeclaredGroqModels,
} from "./groq/requestBuilder";
import { validateLLMResponse, ValidationResult } from "./ResponseValidator.js";
import type { LLMAdapter } from "@interfaces/ILLMAdapter";
import { buildLlamaMessages, wrapInXmlTags } from "./groq/messageBuilder";
import { normalizeResponse } from "./groq/responseNormalizer";
import { checkContextSize, estimateContextTokens } from "./groq/contextBudget";

/**
 * Groq API Adapter optimized for Llama 3.x models
 *
 * This adapter is SEPARATE from OpenAICompatibleAdapter to:
 * 1. Preserve GPT-4o specific optimizations in the OpenAI adapter
 * 2. Implement Llama 3 specific best practices (different temperature, penalties, etc.)
 * 3. Support Llama-specific features like Min-P sampling when available
 */
export class GroqLlamaAdapter implements LLMAdapter<LlamaCompletionOptions> {
  private apiKey: string;
  private baseURL: string;
  private defaultModel: string;
  private defaultTimeout: number;
  private readonly log: ILogger;
  public capabilities: {
    streaming: boolean;
    jsonMode: boolean;
    structuredOutputs: boolean;
    logprobs: boolean;
    seed: boolean;
  };

  constructor({
    apiKey,
    baseURL = "https://api.groq.com/openai/v1",
    defaultModel = "llama-3.1-8b-instant",
    defaultTimeout = 30000,
  }: GroqAdapterConfig) {
    if (!apiKey) {
      throw new Error("Groq API key required");
    }

    this.apiKey = apiKey;
    this.baseURL = baseURL.replace(/\/$/, "");
    this.defaultModel = defaultModel;
    this.defaultTimeout = defaultTimeout;
    this.log = logger.child({ service: "GroqLlamaAdapter" });
    this.capabilities = {
      streaming: true,
      jsonMode: true,
      structuredOutputs: true, // Groq supports json_schema mode (validation-based)
      logprobs: true, // Groq supports logprobs
      seed: true, // Groq supports seed parameter
    };
  }

  /**
   * Complete a chat request with Llama 3 optimizations
   *
   * Llama 3 PDF Best Practices Applied:
   * - Temperature 0.1 for structured output (Section 4.1)
   * - Sandwich prompting for format adherence (Section 3.2)
   * - Pre-fill assistant response for JSON (Section 3.3)
   * - XML wrapping for user input (Section 5.1)
   * - System prompt priming via GAtt mechanism (Section 1.2)
   * - Seed for reproducibility
   * - Logprobs for confidence scoring
   */
  async complete(
    systemPrompt: string,
    options: LlamaCompletionOptions = {},
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
        const response = await this._executeRequest(
          systemPrompt,
          options,
          attempt,
        );

        // Validate response if JSON mode is enabled
        if (options.jsonMode || options.schema || options.responseFormat) {
          const validation = validateLLMResponse(response.text, {
            expectJson: true,
            ...(options.isArray !== undefined && {
              expectArray: options.isArray,
            }),
          });

          if (!validation.isValid) {
            if (shouldRetry && attempt < maxRetries) {
              this.log.warn("Groq response validation failed, retrying", {
                operation,
                attempt: attempt + 1,
                errors: validation.errors,
                responsePreview: response.text.substring(0, 200),
              });
              attempt++;
              continue;
            }

            // Return with validation info even if invalid (let caller decide)
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

        // Only retry on specific errors
        if (
          error instanceof APIError &&
          error.isRetryable &&
          attempt < maxRetries
        ) {
          this.log.warn("Groq API error, retrying", {
            operation,
            attempt: attempt + 1,
            status: error.statusCode,
            error: error.message,
          });
          attempt++;
          // Exponential backoff
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
    options: LlamaCompletionOptions,
    attempt: number = 0,
  ): Promise<AIResponse> {
    const timeout = options.timeout || this.defaultTimeout;
    const { controller, timeoutId, abortedByTimeout } = createAbortController(
      timeout,
      options.signal,
    );

    try {
      const messages = buildLlamaMessages(systemPrompt, options);

      /**
       * Llama 3 PDF Section 8.3: Context Size Monitoring
       *
       * 8B model performs best at 8k-32k tokens. Log warnings when
       * context exceeds optimal range to help identify potential issues.
       */
      const estimatedTokens = estimateContextTokens(systemPrompt, messages);
      checkContextSize(estimatedTokens, this.log);

      const { payload, injectedJsonInstruction } = buildGroqPayload({
        systemPrompt,
        messages,
        options,
        defaultModel: this.defaultModel,
        stream: false,
      });
      if (injectedJsonInstruction) {
        this.log.debug("Injecting JSON instruction for Groq json_object mode", {
          model: options.model || this.defaultModel,
        });
      }
      // Logprobs were requested for a model with no capability entry. Dropping
      // them is the safe answer; saying so is what the old substring test did
      // not do.
      for (const undeclared of takeUndeclaredGroqModels()) {
        this.log.warn("Groq model has no declared capabilities", {
          model: undeclared,
          capability: "logprobs",
        });
      }

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
          `Groq API error: ${response.status} - ${errorBody}`,
          response.status,
          isRetryable,
        );
      }

      const data = (await response.json()) as GroqResponseData;
      return normalizeResponse(data, options);
    } catch (error) {
      clearTimeout(timeoutId);

      const errorObj = error as Error;
      if (errorObj.name === "AbortError") {
        if (abortedByTimeout.value) {
          throw new TimeoutError(`Groq API request timeout after ${timeout}ms`);
        }
        throw new ClientAbortError("Groq API request aborted by client");
      }

      throw errorObj;
    }
  }

  /**
   * Stream completion with Llama 3 optimizations
   */
  async streamComplete(
    systemPrompt: string,
    options: LlamaCompletionOptions & { onChunk: (chunk: string) => void },
  ): Promise<string> {
    const timeout = options.timeout || this.defaultTimeout;
    const { controller, timeoutId, abortedByTimeout } = createAbortController(
      timeout,
      options.signal,
    );
    let fullText = "";

    try {
      const messages = buildLlamaMessages(systemPrompt, options);

      // Context size monitoring (same as _executeRequest)
      const estimatedTokens = estimateContextTokens(systemPrompt, messages);
      checkContextSize(estimatedTokens, this.log);

      const { payload, injectedJsonInstruction } = buildGroqPayload({
        systemPrompt,
        messages,
        options,
        defaultModel: this.defaultModel,
        stream: true,
      });
      if (injectedJsonInstruction) {
        this.log.debug(
          "Injecting JSON instruction for Groq json_object mode (streaming)",
          { model: options.model || this.defaultModel },
        );
      }

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
          `Groq API error: ${response.status} - ${errorBody}`,
          response.status,
          isRetryable,
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Response body is not readable");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":")) continue;

          if (trimmed.startsWith("data: ")) {
            const data = trimmed.slice(6);

            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data) as {
                choices?: Array<{ delta?: { content?: string } }>;
              };
              const content = parsed.choices?.[0]?.delta?.content;

              if (content) {
                fullText += content;
                options.onChunk(content);
              }
            } catch (e) {
              this.log.debug("Skipping malformed SSE chunk", {
                operation: "streamComplete",
                chunk: data.substring(0, 100),
              });
            }
          }
        }
      }

      return fullText;
    } catch (error) {
      clearTimeout(timeoutId);

      const errorObj = error as Error;
      if (errorObj.name === "AbortError") {
        if (abortedByTimeout.value) {
          throw new TimeoutError(
            `Groq streaming request timeout after ${timeout}ms`,
          );
        }
        throw new ClientAbortError("Groq streaming request aborted by client");
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
          timeout: Math.min(15000, this.defaultTimeout),
          jsonMode: true,
          retryOnValidationFailure: false,
        },
      );

      return { healthy: true, provider: "groq" };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return { healthy: false, provider: "groq", error: errorMessage };
    }
  }
}
