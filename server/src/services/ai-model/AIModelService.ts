import { logger } from "@infrastructure/Logger";
import { ModelConfig, shouldUseSeed } from "@config/modelConfig";
import { hashString } from "@utils/hash";
import { detectAndGetCapabilities } from "@utils/provider/ProviderDetector";
import {
  AIClientError,
  type IAIClient,
  type AIResponse,
  type CompletionOptions,
} from "@interfaces/IAIClient";
import type { LlmCallTelemetryService } from "@services/observability/LlmCallTelemetryService";
import type { LlmCallSummary } from "@services/observability/types";
import { LLMUnavailableError } from "./LLMUnavailableError";
import { buildRequestOptions } from "./request/RequestOptionsBuilder";
import { buildResponseFormat } from "./request/ResponseFormatBuilder";
import { ClientResolver } from "./routing/ClientResolver";
import { ExecutionPlanResolver } from "./routing/ExecutionPlan";
import type {
  ClientsMap,
  ExecuteParams,
  ModelConfigEntry,
  RequestOptions,
  StreamParams,
} from "./types";

export type { ExecuteParams, StreamParams } from "./types";

/**
 * Builds the per-LLM-call telemetry summary from a successful response or an
 * error. Reads token counts from `response.metadata.usage` (snake_case from
 * OpenAI/Groq) and emits camelCase fields, leaving null when the provider
 * didn't surface usage data.
 */
function buildLlmCallSummary({
  executionType,
  durationMs,
  response,
  error,
}: {
  executionType: string;
  durationMs: number;
  response: AIResponse | undefined;
  error: unknown;
}): LlmCallSummary {
  const usage = response?.metadata?.usage as
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      }
    | undefined;
  const provider = (response?.metadata?.provider as string | undefined) ?? null;
  const model = (response?.metadata?.model as string | undefined) ?? null;
  const finishReason =
    (response?.metadata?.finishReason as string | undefined) ?? null;
  const promptTokens =
    typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : null;
  const completionTokens =
    typeof usage?.completion_tokens === "number"
      ? usage.completion_tokens
      : null;
  const totalTokens =
    typeof usage?.total_tokens === "number" ? usage.total_tokens : null;

  const errorMessage =
    error instanceof Error ? error.message : error ? String(error) : undefined;

  return {
    executionType,
    durationMs,
    provider,
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    finishReason,
    outcome: error ? "error" : "success",
    ...(errorMessage ? { errorMessage } : {}),
  };
}

/**
 * AI Model Service - Unified Router for LLM Operations
 *
 * This service decouples business logic from specific LLM providers by routing
 * operations through a centralized configuration layer.
 *
 * Architecture: Dead Simple Router Pattern
 * - Services specify WHAT they want (operation name)
 * - Router decides HOW to execute it (which client/model)
 * - Configuration enables zero-code provider switching
 *
 * Provider-Aware Optimizations:
 * - OpenAI: developerMessage for hard constraints, seed for reproducibility
 * - Groq: Sandwich prompting, temperature 0.1 for JSON
 * - Automatic capability detection and optimization
 *
 * Key Features:
 * - Operation-based routing (not client-based)
 * - Automatic fallback support
 * - Streaming support for real-time UI
 * - Environment variable overrides
 * - Circuit breaker awareness
 */
export class AIModelService {
  private readonly clientResolver: ClientResolver;
  private readonly planResolver: ExecutionPlanResolver;
  private readonly hasAnyClient: boolean;
  private readonly llmCallTelemetry: LlmCallTelemetryService | undefined;

  constructor({
    clients,
    llmCallTelemetry,
  }: {
    clients: ClientsMap;
    llmCallTelemetry?: LlmCallTelemetryService;
  }) {
    this.llmCallTelemetry = llmCallTelemetry;
    if (!clients || typeof clients !== "object") {
      throw new Error("AIModelService requires clients object");
    }

    this.clientResolver = new ClientResolver(clients);
    this.planResolver = new ExecutionPlanResolver(this.clientResolver);
    this.hasAnyClient = this.clientResolver.hasAnyClient();

    const availableClients = this.clientResolver.getAvailableClients();

    if (!this.hasAnyClient) {
      logger.error(
        "No AI clients configured; AI operations will be unavailable until a provider is enabled",
      );
    }

    if (!this.clientResolver.hasClient("openai")) {
      logger.warn(
        "OpenAI client not configured; operations targeting OpenAI will require fallbacks",
      );
    }

    logger.info("AIModelService initialized", {
      availableClients,
    });
  }

  /**
   * Execute an AI operation with automatic routing and fallback.
   *
   * Wraps `_executeImpl` with fire-and-forget per-call telemetry. The telemetry
   * captures the OUTER call duration (primary + any fallback work), which is
   * what cost / latency dashboards want — one logical "LLM call" per
   * `execute()`, even when a fallback ran underneath.
   *
   * @param operation - Operation name from ModelConfig
   * @param params - Request parameters
   */
  async execute(operation: string, params: ExecuteParams): Promise<AIResponse> {
    const telemetry = this.llmCallTelemetry;
    if (!telemetry) {
      return this._executeImpl(operation, params);
    }
    const startedAt = performance.now();
    let response: AIResponse | undefined;
    let executionError: unknown;
    try {
      response = await this._executeImpl(operation, params);
      return response;
    } catch (err) {
      executionError = err;
      throw err;
    } finally {
      try {
        telemetry.record(
          buildLlmCallSummary({
            executionType: operation,
            durationMs: performance.now() - startedAt,
            response,
            error: executionError,
          }),
        );
      } catch {
        // Telemetry must never throw upstream.
      }
    }
  }

  private async _executeImpl(
    operation: string,
    params: ExecuteParams,
  ): Promise<AIResponse> {
    if (!params.systemPrompt) {
      throw new Error("systemPrompt is required");
    }

    if (!this.hasAnyClient) {
      throw new LLMUnavailableError(
        "No AI providers configured; enable at least one LLM provider",
      );
    }

    const plan = this.planResolver.resolve(operation);
    const config = plan.primaryConfig;

    // Try to get the primary client, falling back if unavailable
    let client: IAIClient;
    try {
      client = this.clientResolver.getClient(config);
    } catch (clientError) {
      // Primary client unavailable - try fallback immediately
      if (
        plan.fallback &&
        this.clientResolver.hasClient(plan.fallback.client)
      ) {
        logger.warn("Primary client unavailable, using fallback", {
          operation,
          primary: config.client,
          fallback: plan.fallback.client,
        });

        return await this._executeFallback(
          plan.fallback.client,
          operation,
          params.systemPrompt,
          params,
          config,
          { model: plan.fallback.model, timeout: plan.fallback.timeout },
        );
      }

      // No fallback available, re-throw
      throw clientError;
    }

    // Detect provider capabilities
    const { provider, capabilities } = detectAndGetCapabilities({
      operation,
      model: config.model,
      client: config.client,
    });

    const { responseFormat, jsonMode } = buildResponseFormat(
      params,
      config,
      capabilities,
    );

    // Build request options with provider-specific optimizations
    const requestOptions = buildRequestOptions({
      operation,
      params,
      config,
      capabilities,
      jsonMode,
      ...(responseFormat ? { responseFormat } : {}),
    });

    const start = Date.now();
    try {
      logger.debug("Executing AI operation", {
        operation,
        client: config.client,
        model: requestOptions.model,
        provider,
        jsonMode: requestOptions.jsonMode,
        hasDeveloperMessage: !!requestOptions.developerMessage,
        hasSeed: requestOptions.seed !== undefined,
      });

      const response = await client.complete(
        params.systemPrompt,
        requestOptions,
      );
      const durationMs = Date.now() - start;

      logger.debug("AI operation completed", {
        operation,
        client: config.client,
        success: true,
        durationMs,
      });

      return response;
    } catch (error: unknown) {
      const durationMs = Date.now() - start;
      const err = error as {
        message: string;
        statusCode?: number;
        isRetryable?: boolean;
      };
      const isClientAbort = this._isClientAbortError(error);

      // Provider-quirk recovery (e.g. retrying once without logprobs when a
      // model rejects it) lives behind the adapter seam — see
      // OpenAICompatibleAdapter._executeRequest. This layer owns only routing
      // and intelligent fallback, not per-provider parameter quirks.

      logger.warn("AI operation failed on primary client", {
        operation,
        client: config.client,
        error: err.message,
        statusCode: err.statusCode,
      });

      if (isClientAbort) {
        logger.info("Primary AI request aborted by client; skipping fallback", {
          operation,
          client: config.client,
        });
        throw error;
      }

      // Intelligent fallback
      const shouldFallback =
        plan.fallback &&
        this.clientResolver.hasClient(plan.fallback.client) &&
        err.isRetryable !== false;

      if (shouldFallback && plan.fallback) {
        logger.info("Error is retryable, attempting fallback", {
          operation,
          fallbackTo: plan.fallback.client,
        });
        return await this._executeFallback(
          plan.fallback.client,
          operation,
          params.systemPrompt,
          params,
          config,
          { model: plan.fallback.model, timeout: plan.fallback.timeout },
        );
      }

      logger.error(
        "AI operation failed with no fallback",
        error instanceof Error ? error : undefined,
        {
          operation,
          client: config.client,
          error: err.message,
          isRetryable: err.isRetryable,
        },
      );
      throw error;
    }
  }

  /**
   * Execute an AI operation with streaming
   */
  async stream(operation: string, params: StreamParams): Promise<string> {
    if (!this.hasAnyClient) {
      throw new LLMUnavailableError(
        "No AI providers configured; enable at least one LLM provider",
      );
    }

    const plan = this.planResolver.resolve(operation);
    const config = plan.primaryConfig;
    const client = this.clientResolver.getClient(config);

    if (
      typeof (
        client as {
          streamComplete?: (
            systemPrompt: string,
            options: unknown,
          ) => Promise<string>;
        }
      ).streamComplete !== "function"
    ) {
      throw new Error(
        `Client '${config.client}' does not support streaming. ` +
          `Use execute() instead or configure a streaming-capable client.`,
      );
    }

    if (!params.onChunk || typeof params.onChunk !== "function") {
      throw new Error("Streaming requires onChunk callback function");
    }

    const streamOptions: StreamParams = {
      ...params,
      model: params.model || config.model,
      temperature:
        params.temperature !== undefined
          ? params.temperature
          : config.temperature,
      maxTokens: params.maxTokens || config.maxTokens,
      timeout: params.timeout || config.timeout,
      jsonMode:
        config.responseFormat === "json_object" || params.jsonMode || false,
      onChunk: params.onChunk,
    };

    // Add seed for reproducibility if configured
    if (shouldUseSeed(operation)) {
      streamOptions.seed = hashString(String(params.systemPrompt)) % 2147483647;
    }

    try {
      logger.debug("Streaming AI operation", {
        operation,
        client: config.client,
        model: streamOptions.model,
        jsonMode: streamOptions.jsonMode,
      });

      const streamClient = client as unknown as {
        streamComplete: (
          systemPrompt: string,
          options: StreamParams,
        ) => Promise<string>;
      };
      const text = await streamClient.streamComplete(
        params.systemPrompt as string,
        streamOptions,
      );

      logger.debug("AI streaming completed", {
        operation,
        client: config.client,
        textLength: text.length,
      });

      return text;
    } catch (error: unknown) {
      const err = error as { message: string };

      logger.error(
        "AI streaming failed",
        error instanceof Error ? error : undefined,
        {
          operation,
          client: config.client,
          error: err.message,
        },
      );

      throw error;
    }
  }

  /**
   * Execute fallback request on alternative client
   *
   * Uses fallbackConfig from ModelConfig when available to set the correct
   * model and timeout for the fallback provider.
   *
   * @private
   */
  private async _executeFallback(
    fallbackClient: string,
    operation: string,
    systemPrompt: string,
    params: ExecuteParams,
    primaryConfig: ModelConfigEntry,
    fallbackConfig?: { model: string; timeout: number },
  ): Promise<AIResponse> {
    logger.info("Attempting fallback to alternative client", {
      operation,
      fallbackClient,
      fallbackModel: fallbackConfig?.model,
    });

    try {
      const client = this.clientResolver.getClientByName(fallbackClient);

      if (!client) {
        throw new Error(`Fallback client '${fallbackClient}' not available`);
      }

      if (fallbackClient === "qwen") {
        const circuitState = (
          client as {
            getCircuitBreakerState?: () => "OPEN" | "HALF-OPEN" | "CLOSED";
          }
        ).getCircuitBreakerState?.();
        if (circuitState === "OPEN") {
          logger.warn("Skipping fallback due to open circuit breaker", {
            operation,
            fallbackClient,
            fallbackModel: fallbackConfig?.model,
          });
          throw new AIClientError(
            `${fallbackClient} API circuit breaker is open`,
            503,
          );
        }
      }

      const fallbackOptions = this._buildFallbackOptions({
        operation,
        params,
        primaryConfig,
        fallbackClient,
        ...(fallbackConfig ? { fallbackConfig } : {}),
      });

      const fallbackModel =
        fallbackConfig?.model || fallbackOptions.model || primaryConfig.model;
      const fallbackStart = Date.now();
      const response = await client.complete(systemPrompt, fallbackOptions);
      const fallbackDurationMs = Date.now() - fallbackStart;

      // Normalize response — some providers populate content[] instead of text
      if (!response.text && response.content?.length) {
        response.text = response.content[0]?.text || "";
      }

      logger.info("Fallback succeeded", {
        operation,
        fallbackClient,
        model: fallbackConfig?.model || "client-default",
        durationMs: fallbackDurationMs,
      });

      return response;
    } catch (fallbackError: unknown) {
      const err = fallbackError as { message: string };

      logger.error(
        "Fallback also failed",
        fallbackError instanceof Error ? fallbackError : undefined,
        {
          operation,
          fallbackClient,
          fallbackModel: fallbackConfig?.model,
          error: err.message,
        },
      );
      throw fallbackError;
    }
  }

  private _buildFallbackOptions({
    operation,
    params,
    primaryConfig,
    fallbackClient,
    fallbackConfig,
  }: {
    operation: string;
    params: ExecuteParams;
    primaryConfig: ModelConfigEntry;
    fallbackClient: string;
    fallbackConfig?: { model: string; timeout: number };
  }): RequestOptions {
    const fallbackEntry: ModelConfigEntry = {
      ...primaryConfig,
      client: fallbackClient,
      model: fallbackConfig?.model || primaryConfig.model,
      timeout: fallbackConfig?.timeout || primaryConfig.timeout,
    };

    const fallbackParams: ExecuteParams = {
      ...params,
      model: fallbackEntry.model,
      timeout: fallbackEntry.timeout,
    };

    const { capabilities } = detectAndGetCapabilities({
      operation,
      model: fallbackEntry.model,
      client: fallbackEntry.client,
    });

    const { responseFormat, jsonMode } = buildResponseFormat(
      fallbackParams,
      fallbackEntry,
      capabilities,
    );

    return buildRequestOptions({
      operation,
      params: fallbackParams,
      config: fallbackEntry,
      capabilities,
      jsonMode,
      ...(responseFormat ? { responseFormat } : {}),
    });
  }

  private _isClientAbortError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }

    const err = error as { name?: unknown; message?: unknown; cause?: unknown };
    const name = typeof err.name === "string" ? err.name : "";
    const message =
      typeof err.message === "string" ? err.message.toLowerCase() : "";

    if (name === "ClientAbortError") {
      return true;
    }

    if (message.includes("aborted by client")) {
      return true;
    }

    if (err.cause === error) {
      return false;
    }

    return this._isClientAbortError(err.cause);
  }

  listOperations(): string[] {
    return Object.keys(ModelConfig);
  }

  getOperationConfig(operation: string): ModelConfigEntry {
    return this.planResolver.getConfig(operation);
  }

  hasOperation(operation: string): boolean {
    return operation in ModelConfig;
  }

  getAvailableClients(): string[] {
    return this.clientResolver.getAvailableClients();
  }

  supportsStreaming(operation: string): boolean {
    if (!this.hasAnyClient) {
      return false;
    }
    const plan = this.planResolver.resolve(operation);
    const client = this.clientResolver.getClient(plan.primaryConfig);
    return (
      typeof (
        client as {
          streamComplete?: (
            systemPrompt: string,
            options: unknown,
          ) => Promise<string>;
        }
      ).streamComplete === "function"
    );
  }
}
