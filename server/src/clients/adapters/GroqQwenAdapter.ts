/**
 * Groq/Qwen3 Optimized Adapter
 *
 * Optimized for Qwen3 models (32B, etc.) running on Groq infrastructure.
 *
 * Key Qwen3 Optimizations:
 * - reasoning_effort parameter to control thinking mode ('none' for structured output)
 * - Higher temperature tolerance for diversity (0.5 works well)
 * - No prefill tricks needed (Qwen follows JSON instructions reliably)
 * - No sandwich prompting needed
 * - Supports 128k context window
 *
 * When to use this vs GroqLlamaAdapter:
 * - Use GroqQwenAdapter for: qwen/qwen3.6-27b, qwen/qwen3* models
 * - Use GroqLlamaAdapter for: llama-3.1-8b-instant, llama-* models
 */

import { APIError, TimeoutError, ClientAbortError } from "../LLMClient.ts";
import { logger } from "@infrastructure/Logger";
import { createAbortController } from "@clients/utils/abortController";
import { sleep } from "@utils/sleep";
import type { ILogger } from "@interfaces/ILogger";
import type { AIResponse } from "@interfaces/IAIClient";
import { validateLLMResponse } from "./ResponseValidator.js";
import type { LLMAdapter } from "@interfaces/ILLMAdapter";

interface QwenCompletionOptions {
  userMessage?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
  signal?: AbortSignal;
  jsonMode?: boolean;
  isArray?: boolean;
  responseFormat?: { type: string; [key: string]: unknown };
  schema?: Record<string, unknown>;
  messages?: Array<{ role: string; content: string }>;
  onChunk?: (chunk: string) => void;
  retryOnValidationFailure?: boolean;
  maxRetries?: number;
  expectedOutputSize?: "small" | "medium" | "large";
  /** Qwen3-32B reasoning_effort: 'none' disables reasoning, 'default' enables reasoning */
  reasoningEffort?: "none" | "default";
}

interface QwenAdapterConfig {
  apiKey: string;
  baseURL?: string;
  defaultModel?: string;
  defaultTimeout?: number;
}

interface GroqResponseData {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  usage?: unknown;
  system_fingerprint?: string;
}

/**
 * Groq API Adapter optimized for Qwen3 models
 *
 * Separate from GroqLlamaAdapter because:
 * 1. Qwen3 has different optimal parameters (temperature, reasoning_effort)
 * 2. No need for Llama-specific tricks (prefill, sandwich prompting)
 * 3. Qwen3 follows JSON instructions more reliably out of the box
 */
export class GroqQwenAdapter implements LLMAdapter<QwenCompletionOptions> {
  private apiKey: string;
  private baseURL: string;
  private defaultModel: string;
  private defaultTimeout: number;
  private readonly log: ILogger;
  public capabilities: {
    streaming: boolean;
    jsonMode: boolean;
    structuredOutputs: boolean;
    reasoningEffort: boolean;
  };

  constructor({
    apiKey,
    baseURL = "https://api.groq.com/openai/v1",
    defaultModel = "qwen/qwen3.6-27b",
    defaultTimeout = 30000,
  }: QwenAdapterConfig) {
    if (!apiKey) {
      throw new Error("Groq API key required");
    }

    this.apiKey = apiKey;
    this.baseURL = baseURL.replace(/\/$/, "");
    this.defaultModel = defaultModel;
    this.defaultTimeout = defaultTimeout;
    this.log = logger.child({ service: "GroqQwenAdapter" });
    this.capabilities = {
      streaming: true,
      jsonMode: true,
      structuredOutputs: false,
      reasoningEffort: true, // Qwen3-specific
    };
  }

  /**
   * Complete a chat request with Qwen3 optimizations
   */
  async complete(
    systemPrompt: string,
    options: QwenCompletionOptions = {},
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
      reasoningEffort: options.reasoningEffort,
    });

    while (attempt <= maxRetries) {
      try {
        const response = await this._executeRequest(systemPrompt, options);

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
              this.log.warn("Qwen response validation failed, retrying", {
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
          this.log.warn("Groq API error, retrying", {
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
        });

        throw error;
      }
    }

    throw lastError || new Error("Max retries exceeded");
  }

  /**
   * Execute a single request
   */
  private async _executeRequest(
    systemPrompt: string,
    options: QwenCompletionOptions,
  ): Promise<AIResponse> {
    const timeout = options.timeout || this.defaultTimeout;
    const { controller, timeoutId, abortedByTimeout } = createAbortController(
      timeout,
      options.signal,
    );

    try {
      const messages = this._buildMessages(systemPrompt, options);
      const isStructuredOutput = !!(
        options.schema ||
        options.responseFormat ||
        options.jsonMode
      );

      /**
       * Qwen3 Temperature Configuration
       *
       * Qwen3 handles higher temperatures better than Llama 8B:
       * - Structured output: 0.3-0.5 works well (vs 0.1 for Llama)
       * - Creative tasks: 0.7-0.9
       */
      const defaultTemp = isStructuredOutput ? 0.5 : 0.7;
      const temperature =
        options.temperature !== undefined ? options.temperature : defaultTemp;

      const maxTokens = this._calculateMaxTokens(
        isStructuredOutput,
        options.maxTokens,
        options.expectedOutputSize,
      );

      const payload: Record<string, unknown> = {
        model: options.model || this.defaultModel,
        messages,
        max_tokens: maxTokens,
        temperature,
        top_p: 0.9,
      };

      /**
       * Qwen3 reasoning_effort Parameter
       *
       * Controls the model's "thinking mode":
       * - 'none': Disable reasoning, get direct output (best for structured JSON)
       * - 'default': Enable reasoning (model default)
       *
       * For structured output, default to 'none' to prevent reasoning traces in JSON.
       */
      if (options.reasoningEffort !== undefined) {
        payload.reasoning_effort = options.reasoningEffort;
      } else if (isStructuredOutput) {
        payload.reasoning_effort = "none";
      }

      // Response format configuration (Qwen supports json_object, not json_schema)
      // IMPORTANT: Groq requires 'json' to appear in messages when using json_object mode
      const wantsJsonSchema =
        !!options.schema || options.responseFormat?.type === "json_schema";
      const usingJsonObjectMode =
        wantsJsonSchema ||
        options.jsonMode ||
        options.responseFormat?.type === "json_object";

      if (usingJsonObjectMode) {
        // Groq API requires the word 'json' to appear in messages when using json_object mode
        // Inject into first message if not already present
        const messagesContainJson = messages.some((m) =>
          m.content.toLowerCase().includes("json"),
        );

        if (!messagesContainJson) {
          this.log.debug(
            "Injecting JSON instruction for Groq json_object mode",
            {
              model: options.model || this.defaultModel,
            },
          );
          // Prepend to system message to satisfy Groq's requirement
          const systemIdx = messages.findIndex((m) => m.role === "system");
          const systemMessage =
            systemIdx >= 0 ? messages[systemIdx] : undefined;
          if (systemMessage) {
            systemMessage.content = `Respond with valid JSON.\n\n${systemMessage.content}`;
          } else if (messages[0]) {
            // No system message, add instruction to first message
            messages[0].content = `Respond with valid JSON.\n\n${messages[0].content}`;
          } else {
            messages.push({
              role: "system",
              content: "Respond with valid JSON.",
            });
          }
        }

        if (wantsJsonSchema) {
          this.log.debug(
            "Qwen response_format json_schema unsupported; using json_object",
            {
              model: options.model || this.defaultModel,
              hasSchema: !!options.schema,
            },
          );
        }
        payload.response_format = { type: "json_object" };
      } else if (options.responseFormat) {
        payload.response_format = options.responseFormat;
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
      return this._normalizeResponse(data, options);
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
   * Build messages array - simpler than Llama adapter
   *
   * Qwen3 doesn't need:
   * - Sandwich prompting
   * - Prefill assistant response
   * - XML wrapping (though it doesn't hurt)
   */
  private _buildMessages(
    systemPrompt: string,
    options: QwenCompletionOptions,
  ): Array<{ role: string; content: string }> {
    if (options.messages && Array.isArray(options.messages)) {
      return [...options.messages];
    }

    const messages: Array<{ role: string; content: string }> = [];

    messages.push({ role: "system", content: systemPrompt });

    const userMessage = options.userMessage || "Please proceed.";
    messages.push({ role: "user", content: userMessage });

    return messages;
  }

  /**
   * Normalize response to standard format
   */
  private _normalizeResponse(
    data: GroqResponseData,
    options: QwenCompletionOptions,
  ): AIResponse {
    const text = data.choices?.[0]?.message?.content || "";

    const metadata = {
      usage: data.usage,
      raw: data,
      _original: data,
      provider: "groq-qwen",
      optimizations: ["qwen3-reasoning-effort", "higher-temp-tolerance"],
      ...(data.choices?.[0]?.finish_reason
        ? { finishReason: data.choices[0].finish_reason }
        : {}),
      ...(data.system_fingerprint
        ? { systemFingerprint: data.system_fingerprint }
        : {}),
    };

    return {
      text,
      metadata,
    };
  }

  /**
   * Calculate appropriate max_tokens based on task type
   */
  private _calculateMaxTokens(
    isStructuredOutput: boolean,
    requestedTokens?: number,
    expectedSize?: "small" | "medium" | "large",
  ): number {
    if (requestedTokens !== undefined) {
      return requestedTokens;
    }

    if (isStructuredOutput) {
      switch (expectedSize) {
        case "small":
          return 256;
        case "medium":
          return 512;
        case "large":
          return 1024;
        default:
          return 1024; // Qwen3 handles larger outputs well
      }
    }

    switch (expectedSize) {
      case "small":
        return 512;
      case "medium":
        return 1024;
      case "large":
        return 2048;
      default:
        return 1024;
    }
  }

  async healthCheck(): Promise<{
    healthy: boolean;
    provider: string;
    error?: string;
  }> {
    try {
      await this.complete('Respond with valid JSON: {"status": "healthy"}', {
        maxTokens: 50,
        timeout: Math.min(15000, this.defaultTimeout),
        jsonMode: true,
        retryOnValidationFailure: false,
        reasoningEffort: "none",
      });

      return { healthy: true, provider: "groq-qwen" };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return { healthy: false, provider: "groq-qwen", error: errorMessage };
    }
  }
}
