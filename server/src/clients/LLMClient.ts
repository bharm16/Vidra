import type { LLMAdapter } from "@interfaces/ILLMAdapter";
import { logger } from "@infrastructure/Logger";
import type {
  IAIClient,
  AIResponse,
  CompletionOptions,
  MessageContent,
} from "@interfaces/IAIClient";

/**
 * Custom error classes for better error handling
 */
export class APIError extends Error {
  statusCode: number;
  isRetryable: boolean;

  constructor(
    message: string,
    statusCode: number,
    isRetryable: boolean = true,
  ) {
    super(message);
    this.name = "APIError";
    this.statusCode = statusCode;
    // 400/401/403 are NOT retryable (bad request, auth errors)
    // 429/5xx ARE retryable (rate limits, server errors)
    this.isRetryable = isRetryable;
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

/**
 * Client-initiated abort error
 *
 * This occurs when the client (browser) closes the connection before
 * the API call completes. This is NOT an API failure.
 */
export class ClientAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientAbortError";
  }
}

/**
 * The adapter contract now lives at `@interfaces/ILLMAdapter` so adapters can
 * declare `implements` against it. While it was file-private here, nothing
 * outside could name it, so conformance was checked by feature-detecting at
 * runtime instead of by the compiler.
 */
type Adapter = LLMAdapter;

/**
 * The caller-facing options type is `CompletionOptions` from IAIClient, which
 * now extends the adapter port's `LLMAdapterOptions`. This file used to
 * declare a second, narrower copy — so the type describing what LLMClient
 * forwards listed 12 members while `_applyDefaults` demonstrably spread
 * through whatever it was given.
 */
interface StreamCompletionOptions extends CompletionOptions {
  onChunk: (chunk: string) => void;
}

// Ensure requestOptions has onChunk for streaming
type StreamRequestOptions = CompletionOptions & {
  onChunk: (chunk: string) => void;
};

interface LLMClientConfig {
  adapter: Adapter;
  providerName: string;
  defaultModel?: string;
  defaultTimeout?: number;
}

/**
 * Generic LLM Client powered by provider adapters
 *
 * The client applies model/timeout defaults and logging, and delegates
 * protocol-specific work to an adapter.
 */
export class LLMClient implements IAIClient {
  private adapter: Adapter;
  private providerName: string;
  private defaultModel: string;
  private defaultTimeout: number;
  public readonly capabilities: NonNullable<IAIClient["capabilities"]>;

  constructor({
    adapter,
    providerName,
    defaultModel = "",
    defaultTimeout = 60000,
  }: LLMClientConfig) {
    // No `typeof adapter.complete === "function"` check: `complete` is
    // required by LLMAdapter, so the compiler enforces it. The
    // `streamComplete` probe below stays — that member is genuinely optional
    // on the port, so presence is real information.
    this.adapter = adapter;
    this.providerName = providerName;
    this.defaultModel = defaultModel;
    this.defaultTimeout = defaultTimeout;
    const streaming =
      adapter.capabilities?.streaming ??
      typeof adapter.streamComplete === "function";
    this.capabilities = { streaming };
  }

  /**
   * Complete a prompt with the LLM (non-streaming)
   */
  async complete(
    systemPrompt: string,
    options: CompletionOptions = {},
  ): Promise<AIResponse> {
    const startTime = Date.now();
    const endpoint = "chat/completions";
    const requestOptions = this._applyDefaults(options);

    try {
      const result = await this.adapter.complete(systemPrompt, requestOptions);

      logger.debug("API call succeeded.", {
        endpoint,
        duration: Date.now() - startTime,
        model: requestOptions.model,
        provider: this.providerName,
      });

      return result;
    } catch (error) {
      logger.error("API call failed.", error as Error, {
        endpoint,
        duration: Date.now() - startTime,
        provider: this.providerName,
      });
      throw error;
    }
  }

  /**
   * Stream completion with real-time chunks
   */
  async streamComplete(
    systemPrompt: string,
    options: StreamCompletionOptions,
  ): Promise<string> {
    const startTime = Date.now();

    if (!options.onChunk || typeof options.onChunk !== "function") {
      throw new Error("onChunk callback is required for streaming");
    }

    if (
      !this.capabilities.streaming ||
      typeof this.adapter.streamComplete !== "function"
    ) {
      throw new Error(
        `${this.providerName} adapter does not support streaming`,
      );
    }

    try {
      const requestOptions = this._applyDefaults(options);
      const streamOptions: StreamRequestOptions = {
        ...requestOptions,
        onChunk: options.onChunk,
      };
      const fullText = await this.adapter.streamComplete(
        systemPrompt,
        streamOptions,
      );

      logger.debug("Streaming completed.", {
        duration: Date.now() - startTime,
        textLength: fullText.length,
        provider: this.providerName,
      });

      return fullText;
    } catch (error) {
      const errorObj = error as Error;
      if (errorObj.name === "AbortError") {
        const timeout = options.timeout || this.defaultTimeout;
        throw new TimeoutError(
          `${this.providerName} streaming request timeout after ${timeout}ms`,
        );
      }

      logger.error("Streaming request failed.", errorObj, {
        provider: this.providerName,
      });
      throw errorObj;
    }
  }

  /**
   * Get the provider name
   */
  getProvider(): string {
    return this.providerName;
  }

  /**
   * Get the model name being used
   */
  getModel(): string {
    return this.defaultModel;
  }

  /**
   * Apply defaults to request options without mutating the original
   * @private
   */
  private _applyDefaults(options: CompletionOptions = {}): CompletionOptions {
    return {
      ...options,
      model: options.model || this.defaultModel,
      timeout: options.timeout || this.defaultTimeout,
    };
  }
}
