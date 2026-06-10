import CircuitBreaker from "opossum";
import { logger } from "@infrastructure/Logger";
import type {
  IAIClient,
  AIResponse,
  MessageContent,
} from "@interfaces/IAIClient";

/** Narrow metrics interface — avoids importing the concrete MetricsService class. */
interface LLMMetricsCollector {
  updateCircuitBreakerState?(
    circuit: string,
    state: "closed" | "open" | "half-open",
  ): void;
  recordClaudeAPICall(
    endpoint: string,
    duration: number,
    success: boolean,
  ): void;
}

const NULL_METRICS: LLMMetricsCollector = {
  updateCircuitBreakerState() {},
  recordClaudeAPICall() {},
};

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

export class ServiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceUnavailableError";
  }
}

/**
 * Client-initiated abort error
 *
 * This occurs when the client (browser) closes the connection before
 * the API call completes. This is NOT an API failure and should NOT
 * trip the circuit breaker.
 */
export class ClientAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientAbortError";
  }
}

interface Adapter {
  complete(
    systemPrompt: string,
    options?: CompletionOptions,
  ): Promise<AIResponse>;
  streamComplete?(
    systemPrompt: string,
    options: StreamCompletionOptions,
  ): Promise<string>;
  healthCheck?(): Promise<{ healthy: boolean; [key: string]: unknown }>;
  capabilities?: {
    streaming?: boolean;
  };
}

interface CompletionOptions {
  userMessage?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
  signal?: AbortSignal;
  priority?: boolean;
  jsonMode?: boolean;
  isArray?: boolean;
  responseFormat?: { type: string; [key: string]: unknown };
  messages?: Array<{ role: string; content: MessageContent }>;
  /** Gemini 2.5+: cap thinking tokens (0 disables thinking). Thinking tokens count against maxTokens. */
  thinkingBudget?: number;
}

interface StreamCompletionOptions extends CompletionOptions {
  onChunk: (chunk: string) => void;
}

// Ensure requestOptions has onChunk for streaming
type StreamRequestOptions = CompletionOptions & {
  onChunk: (chunk: string) => void;
};

interface CircuitBreakerConfig {
  timeout?: number;
  errorThresholdPercentage?: number;
  resetTimeout?: number;
  rollingCountTimeout?: number;
  rollingCountBuckets?: number;
  volumeThreshold?: number;
  name?: string;
  // Returns true for errors that must NOT count as circuit failures
  // (e.g. client aborts, 4xx). Overrides the default abort-only filter.
  errorFilter?: (err: Error) => boolean;
}

interface ConcurrencyLimiterOptions {
  signal?: AbortSignal;
  priority?: boolean;
}

interface ConcurrencyLimiter {
  execute<T>(
    fn: () => Promise<T>,
    options?: ConcurrencyLimiterOptions,
  ): Promise<T>;
  getStats?(): unknown;
  getQueueStatus?(): unknown;
}

interface LLMClientConfig {
  adapter: Adapter;
  providerName: string;
  defaultModel?: string;
  defaultTimeout?: number;
  circuitBreakerConfig?: CircuitBreakerConfig;
  concurrencyLimiter?: ConcurrencyLimiter | null;
  metricsService?: LLMMetricsCollector;
}

interface HealthCheckResult {
  healthy: boolean;
  provider: string;
  error?: string | undefined;
  responseTime?: number | undefined;
  circuitBreakerState?: string | undefined;
}

/**
 * Generic LLM Client powered by provider adapters
 *
 * The client owns cross-cutting concerns (circuit breaker, concurrency limiting,
 * metrics) and delegates protocol-specific work to an adapter.
 */
export class LLMClient implements IAIClient {
  private adapter: Adapter;
  private providerName: string;
  private defaultModel: string;
  private defaultTimeout: number;
  private concurrencyLimiter: ConcurrencyLimiter | null;
  private readonly metrics: LLMMetricsCollector;
  public readonly capabilities: NonNullable<IAIClient["capabilities"]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private breaker: CircuitBreaker<any, AIResponse>;

  constructor({
    adapter,
    providerName,
    defaultModel = "",
    defaultTimeout = 60000,
    circuitBreakerConfig = {},
    concurrencyLimiter = null,
    metricsService,
  }: LLMClientConfig) {
    if (!adapter || typeof adapter.complete !== "function") {
      throw new Error("LLMClient requires an adapter with a complete() method");
    }

    this.adapter = adapter;
    this.providerName = providerName;
    this.defaultModel = defaultModel;
    this.defaultTimeout = defaultTimeout;
    this.concurrencyLimiter = concurrencyLimiter;
    this.metrics = metricsService ?? NULL_METRICS;
    const streaming =
      adapter.capabilities?.streaming ??
      typeof adapter.streamComplete === "function";
    this.capabilities = { streaming };

    // Merge default circuit breaker options with provider-specific config
    const breakerOptions = {
      timeout: this.defaultTimeout,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      rollingCountTimeout: 10000,
      rollingCountBuckets: 10,
      volumeThreshold: 5,
      name: `${this.providerName}-api`,
      // Exclude ClientAbortError from circuit breaker failure counting.
      // Client-initiated aborts (user closed browser/navigated away) are NOT
      // API failures and should NOT trip the circuit breaker.
      errorFilter: (err: Error) => {
        if (
          err instanceof ClientAbortError ||
          err.name === "ClientAbortError"
        ) {
          logger.debug(
            "Circuit breaker ignoring ClientAbortError (not an API failure).",
            {
              provider: this.providerName,
            },
          );
          return true; // true = don't count this as a failure
        }
        return false; // false = count this as a failure
      },
      ...circuitBreakerConfig,
    };

    this.breaker = new CircuitBreaker(
      this._makeRequest.bind(this),
      breakerOptions,
    );

    // Circuit breaker event handlers
    this.breaker.on("open", () => {
      logger.error("Circuit breaker opened; API failing.", undefined, {
        provider: this.providerName,
      });
      this.metrics.updateCircuitBreakerState?.(
        `${this.providerName}-api`,
        "open",
      );
    });

    this.breaker.on("halfOpen", () => {
      logger.warn("Circuit breaker half-open; testing API.", {
        provider: this.providerName,
      });
      this.metrics.updateCircuitBreakerState?.(
        `${this.providerName}-api`,
        "half-open",
      );
    });

    this.breaker.on("close", () => {
      logger.info("Circuit breaker closed; API healthy.", {
        provider: this.providerName,
      });
      this.metrics.updateCircuitBreakerState?.(
        `${this.providerName}-api`,
        "closed",
      );
    });

    // Initially set circuit breaker state to closed
    this.metrics.updateCircuitBreakerState?.(
      `${this.providerName}-api`,
      "closed",
    );
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
      // Execute with optional concurrency limiting
      const executeRequest = async (): Promise<AIResponse> => {
        return await this.breaker.fire(systemPrompt, requestOptions);
      };

      const result = this.concurrencyLimiter
        ? await this.concurrencyLimiter.execute(
            executeRequest,
            options.signal !== undefined || options.priority !== undefined
              ? {
                  ...(options.signal !== undefined && {
                    signal: options.signal,
                  }),
                  ...(options.priority !== undefined && {
                    priority: options.priority,
                  }),
                }
              : undefined,
          )
        : await executeRequest();

      const duration = Date.now() - startTime;

      // Record successful API call
      this.metrics.recordClaudeAPICall(
        `${this.providerName}-${endpoint}`,
        duration,
        true,
      );
      logger.debug("API call succeeded.", {
        endpoint,
        duration,
        model: requestOptions.model,
        provider: this.providerName,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Record failed API call
      this.metrics.recordClaudeAPICall(
        `${this.providerName}-${endpoint}`,
        duration,
        false,
      );

      const errorObj = error as Error & { code?: string };

      // Handle concurrency limiter errors
      if (errorObj.code === "QUEUE_TIMEOUT") {
        logger.error("API request timed out in queue.", undefined, {
          endpoint,
          duration,
          provider: this.providerName,
        });
        throw Object.assign(
          new TimeoutError(
            `${this.providerName} API request timed out in queue - system overloaded`,
          ),
          { code: "QUEUE_TIMEOUT" as const, retryAfter: 5 },
        );
      }

      if (errorObj.code === "CANCELLED") {
        logger.debug("API request cancelled.", {
          endpoint,
          duration,
          provider: this.providerName,
        });
        throw errorObj;
      }

      if (this.breaker.opened) {
        logger.error("API circuit breaker is open.", errorObj, {
          provider: this.providerName,
        });
        throw new ServiceUnavailableError(
          `${this.providerName} API is currently unavailable`,
        );
      }

      logger.error("API call failed.", errorObj, {
        endpoint,
        duration,
        provider: this.providerName,
      });
      throw errorObj;
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

    // Execute with optional concurrency limiting (critical fix!)
    const executeStream = async (): Promise<string> => {
      return await this._executeStream(systemPrompt, options, startTime);
    };

    try {
      return this.concurrencyLimiter
        ? await this.concurrencyLimiter.execute(
            executeStream,
            options.signal !== undefined || options.priority !== undefined
              ? {
                  ...(options.signal !== undefined && {
                    signal: options.signal,
                  }),
                  ...(options.priority !== undefined && {
                    priority: options.priority,
                  }),
                }
              : undefined,
          )
        : await executeStream();
    } catch (error) {
      const duration = Date.now() - startTime;
      this.metrics.recordClaudeAPICall(
        `${this.providerName}-stream`,
        duration,
        false,
      );

      const errorObj = error as Error & { code?: string };

      // Handle concurrency limiter errors
      if (errorObj.code === "QUEUE_TIMEOUT") {
        throw Object.assign(
          new TimeoutError(
            `${this.providerName} streaming request timed out in queue - system overloaded`,
          ),
          { code: "QUEUE_TIMEOUT" as const, retryAfter: 5 },
        );
      }

      if (errorObj.code === "CANCELLED") {
        logger.debug("Streaming request cancelled.", {
          provider: this.providerName,
        });
        throw errorObj;
      }

      throw errorObj;
    }
  }

  /**
   * Internal streaming execution with robust SSE parsing
   * @private
   */
  private async _executeStream(
    systemPrompt: string,
    options: StreamCompletionOptions,
    startTime: number,
  ): Promise<string> {
    if (
      !this.capabilities.streaming ||
      typeof this.adapter.streamComplete !== "function"
    ) {
      throw new Error(
        `${this.providerName} adapter does not support streaming`,
      );
    }

    let fullText = "";

    try {
      const requestOptions = this._applyDefaults(options);
      const streamOptions: StreamRequestOptions = {
        ...requestOptions,
        onChunk: options.onChunk,
      };
      fullText = await this.adapter.streamComplete(systemPrompt, streamOptions);

      const duration = Date.now() - startTime;
      this.metrics.recordClaudeAPICall(
        `${this.providerName}-stream`,
        duration,
        true,
      );

      logger.debug("Streaming completed.", {
        duration,
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
   * Internal method to make the actual API request (non-streaming)
   * @private
   */
  private async _makeRequest(
    systemPrompt: string,
    options: CompletionOptions = {},
  ): Promise<AIResponse> {
    const requestOptions = this._applyDefaults(options);
    return await this.adapter.complete(systemPrompt, requestOptions);
  }

  /**
   * Health check for the API
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      let result: { healthy: boolean; [key: string]: unknown };

      if (typeof this.adapter.healthCheck === "function") {
        result = await this.adapter.healthCheck();
      } else {
        await this.complete(
          'Respond with valid JSON containing: {"status": "healthy"}',
          {
            maxTokens: 50,
            timeout: 30000,
            jsonMode: true,
          },
        );
        result = { healthy: true };
      }

      const duration = Date.now() - startTime;

      return {
        ...result,
        healthy: result.healthy !== false,
        provider: this.providerName,
        responseTime: (result.responseTime as number | undefined) || duration,
        circuitBreakerState: this.getCircuitBreakerState(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        healthy: false,
        provider: this.providerName,
        error: errorMessage,
        circuitBreakerState: this.getCircuitBreakerState(),
      };
    }
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(): { state: string; stats: unknown } {
    return {
      state: this.getCircuitBreakerState(),
      stats: this.breaker.stats,
    };
  }

  /**
   * Get circuit breaker state
   */
  getCircuitBreakerState(): "OPEN" | "HALF-OPEN" | "CLOSED" {
    if (this.breaker.opened) return "OPEN";
    if (this.breaker.halfOpen) return "HALF-OPEN";
    return "CLOSED";
  }

  /**
   * Get concurrency limiter statistics (if available)
   */
  getConcurrencyStats(): unknown {
    return this.concurrencyLimiter?.getStats?.() || null;
  }

  /**
   * Get current queue status (if concurrency limiter available)
   */
  getQueueStatus(): unknown {
    return this.concurrencyLimiter?.getQueueStatus?.() || null;
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
