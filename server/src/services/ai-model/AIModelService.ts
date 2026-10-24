import type { AIExecutionPort } from "./ports/AIExecutionPort";
import { logger } from "@infrastructure/Logger";
import {
  ModelConfig,
  shouldUseSeed,
  isOperationName,
  type OperationName,
} from "@config/modelConfig";
import { hashString } from "@utils/hash";
import { capabilitiesFor } from "@utils/provider/ProviderDetector";
import type {
  IAIClient,
  AIResponse,
  CompletionOptions,
} from "@interfaces/IAIClient";
import type { LlmProviderCircuitManager } from "@llm/failover/LlmProviderCircuitManager";
import { LLMUnavailableError } from "./LLMUnavailableError";
import { buildRequestOptions } from "./request/RequestOptionsBuilder";
import { buildResponseFormat } from "./request/ResponseFormatBuilder";
import { ClientResolver } from "./routing/ClientResolver";
import { ExecutionPlanResolver } from "./routing/ExecutionPlan";
import type {
  ClientsMap,
  ExecuteParams,
  ExecutionPlan,
  ModelConfigEntry,
  RequestOptions,
  ResolvedExecution,
  RoutedAIResponse,
  StreamParams,
} from "./types";

export type { ExecuteParams, StreamParams } from "./types";

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
 * - Provider circuit awareness (LlmProviderCircuitManager)
 */
export class AIModelService {
  private readonly clientResolver: ClientResolver;
  private readonly planResolver: ExecutionPlanResolver;
  private readonly hasAnyClient: boolean;
  private readonly providerCircuit: LlmProviderCircuitManager | undefined;

  constructor({
    clients,
    providerCircuit,
  }: {
    clients: ClientsMap;
    providerCircuit?: LlmProviderCircuitManager;
  }) {
    this.providerCircuit = providerCircuit;
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
   * The one place that decides which client runs an operation.
   *
   * `execute` and `resolveExecution` both route through here, so a
   * caller's pre-flight answer and the actual dispatch cannot disagree. Note
   * that `canDispatch` transitions an expired-cooldown circuit to half-open,
   * so this is not a pure read — it is the same transition dispatch would
   * have made a moment later.
   */
  private _planRoute(operation: OperationName): {
    plan: ExecutionPlan;
    config: ModelConfigEntry;
    circuitFallback: { client: string; model: string; timeout: number } | null;
  } {
    const plan = this.planResolver.resolve(operation);
    const config = plan.primaryConfig;

    // Health-based failover: when the primary provider's circuit is open and
    // a healthy fallback exists, route there without paying the primary's
    // failure/timeout. When every candidate is unhealthy, fail open — attempt
    // the primary anyway rather than hard-failing the request.
    const circuitFallback =
      this.providerCircuit &&
      plan.fallback &&
      !this.providerCircuit.canDispatch(config.client) &&
      this.clientResolver.hasClient(plan.fallback.client) &&
      this.providerCircuit.canDispatch(plan.fallback.client)
        ? plan.fallback
        : null;

    return { plan, config, circuitFallback };
  }

  /**
   * The provider/model that will run `operation` if dispatched now.
   *
   * Reflects client availability and circuit state; `getOperationConfig` does
   * not. Callers shaping a provider-specific request (JSON schema, prompt
   * template, cache key) must use this.
   *
   * Total by design — it never throws. Planning can fail when no provider is
   * configured at all (replay mode runs that way deliberately), but a query
   * that throws forces every caller into a try/catch, and those catch blocks
   * are precisely where the ModelConfig re-derivations this method replaces
   * used to live. When nothing can be dispatched, it reports the configured
   * primary; `execute` is what surfaces the failure.
   */
  resolveExecution(operation: OperationName): ResolvedExecution {
    let config: ModelConfigEntry;
    let circuitFallback: { client: string; model: string } | null = null;

    try {
      const route = this._planRoute(operation);
      config = route.config;
      circuitFallback = route.circuitFallback;
    } catch {
      config = this.planResolver.getConfig(operation);
    }

    return circuitFallback
      ? this._describeExecution(
          operation,
          circuitFallback.client,
          circuitFallback.model,
          true,
        )
      : this._describeExecution(operation, config.client, config.model, false);
  }

  private _describeExecution(
    operation: OperationName,
    client: string,
    model: string,
    viaFallback: boolean,
  ): ResolvedExecution {
    const { provider } = capabilitiesFor({ operation, model, client });
    return { client, provider, model, viaFallback };
  }

  bindExecution(operation: OperationName): AIExecutionPort {
    const { config, circuitFallback } = this._planRoute(operation);
    return this.executionPort(operation, circuitFallback ? { ...config, ...circuitFallback } : config, circuitFallback !== null);
  }

  private executionPort(operation: OperationName, chosen: ModelConfigEntry, viaFallback: boolean, onFailure: () => void = () => undefined): AIExecutionPort {
    const execution = this._describeExecution(operation, chosen.client, chosen.model, viaFallback);
    return {
        resolveExecution: () => execution,
        getOperationConfig: () => chosen,
        execute: async (_operation, params) => {
          if (_operation !== operation) throw new Error("A prepared execution cannot run a different operation");
          try { const response = await this._executeSelected(chosen.client, operation, params.systemPrompt, params, chosen, { model: chosen.model, timeout: params.timeout ?? chosen.timeout }); return { ...response, executedBy: execution }; }
          catch (error) { onFailure(); throw error; }
        },
        stream: async (_operation, params) => {
          if (_operation !== operation) throw new Error("A prepared execution cannot run a different operation");
          return this.streamOnRoute(operation, params, chosen);
        },
    };
  }

  async withExecution<T>(operation: OperationName, run: (selected: AIExecutionPort) => Promise<T>): Promise<T> {
    if (!this.hasAnyClient) throw new LLMUnavailableError("No AI providers configured");
    const { plan, config, circuitFallback } = this._planRoute(operation);
    const first = circuitFallback ? { ...config, ...circuitFallback } : config;
    let providerFailed = false;
    const attempt = async (chosen: ModelConfigEntry, viaFallback: boolean): Promise<T> => {
      return run(this.executionPort(operation, chosen, viaFallback, () => { providerFailed = true; }));
    };
    try { return await attempt(first, circuitFallback !== null); }
    catch (error) {
      const refused = typeof error === "object" && error !== null && "isRetryable" in error && error.isRetryable === false;
      if (!providerFailed || circuitFallback || !plan.fallback || refused || this._isClientAbortError(error)) throw error;
      providerFailed = false;
      return attempt({ ...config, ...plan.fallback }, true);
    }
  }

  /**
   * Execute an AI operation with automatic routing and fallback.
   *
   * @param operation - Operation name from ModelConfig
   * @param params - Request parameters
   */
  async execute(
    operation: OperationName,
    params: ExecuteParams,
  ): Promise<RoutedAIResponse> {
    if (!params.systemPrompt) {
      throw new Error("systemPrompt is required");
    }

    if (!this.hasAnyClient) {
      throw new LLMUnavailableError(
        "No AI providers configured; enable at least one LLM provider",
      );
    }

    const { plan, config, circuitFallback } = this._planRoute(operation);

    if (circuitFallback) {
      logger.warn("Primary provider circuit open, routing to fallback", {
        operation,
        primary: config.client,
        fallback: circuitFallback.client,
      });

      return await this._executeSelected(
        circuitFallback.client,
        operation,
        params.systemPrompt,
        params,
        config,
        { model: circuitFallback.model, timeout: circuitFallback.timeout },
      );
    }

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

        return await this._executeSelected(
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
    const { provider, capabilities } = capabilitiesFor({
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

      this.providerCircuit?.markDispatched(config.client);
      const response = await client.complete(
        params.systemPrompt,
        requestOptions,
      );
      this.providerCircuit?.recordSuccess(config.client);
      const durationMs = Date.now() - start;

      logger.debug("AI operation completed", {
        operation,
        client: config.client,
        success: true,
        durationMs,
      });

      return {
        ...response,
        executedBy: {
          client: config.client,
          provider,
          model: requestOptions.model,
          viaFallback: false,
        },
      };
    } catch (error: unknown) {
      const durationMs = Date.now() - start;
      const err = error as {
        message: string;
        statusCode?: number;
        isRetryable?: boolean;
      };
      const isClientAbort = this._isClientAbortError(error);
      this._settleCircuitOutcome(config.client, error, isClientAbort);

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
        return await this._executeSelected(
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
  async stream(
    operation: OperationName,
    params: StreamParams,
  ): Promise<string> {
    if (!this.hasAnyClient) {
      throw new LLMUnavailableError(
        "No AI providers configured; enable at least one LLM provider",
      );
    }

    const { config, circuitFallback } = this._planRoute(operation);
    return this.streamOnRoute(operation, params, circuitFallback ? { ...config, ...circuitFallback } : config);
  }

  private async streamOnRoute(operation: OperationName, params: StreamParams, config: ModelConfigEntry): Promise<string> {
    const client = this.clientResolver.getClient(config);
    if (typeof client.streamComplete !== "function") {
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

      // streamComplete presence is verified above. Streaming deliberately does
      // NOT run execute()'s request-shaping pipeline (ProviderDetector,
      // buildRequestOptions, response-format, developerMessage) — those are
      // non-streaming concerns. The streaming wire is eval-gated (span labeling),
      // so options pass through unchanged; unifying the pipelines would force a
      // baseline re-bless and is intentionally deferred.
      this.providerCircuit?.markDispatched(config.client);
      const text = await client.streamComplete(
        params.systemPrompt as string,
        streamOptions,
      );

      this.providerCircuit?.recordSuccess(config.client);
      logger.debug("AI streaming completed", {
        operation,
        client: config.client,
        textLength: text.length,
      });

      return text;
    } catch (error: unknown) {
      this._settleCircuitOutcome(config.client, error, this._isClientAbortError(error));
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
  private async _executeSelected(
    fallbackClient: string,
    operation: OperationName,
    systemPrompt: string,
    params: ExecuteParams,
    primaryConfig: ModelConfigEntry,
    fallbackConfig?: { model: string; timeout: number },
  ): Promise<RoutedAIResponse> {
    logger.info("Dispatching selected text provider", {
      operation,
      fallbackClient,
      fallbackModel: fallbackConfig?.model,
    });

    let dispatched = false;
    try {
      const client = this.clientResolver.getClientByName(fallbackClient);

      if (!client) {
        throw new Error(`Fallback client '${fallbackClient}' not available`);
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
      this.providerCircuit?.markDispatched(fallbackClient);
      dispatched = true;
      const response = await client.complete(systemPrompt, fallbackOptions);
      this.providerCircuit?.recordSuccess(fallbackClient);
      const fallbackDurationMs = Date.now() - fallbackStart;

      // Normalize response — some providers populate content[] instead of text
      if (!response.text && response.content?.length) {
        response.text = response.content[0]?.text || "";
      }

      logger.info("Selected text provider completed", {
        operation,
        fallbackClient,
        model: fallbackConfig?.model || "client-default",
        durationMs: fallbackDurationMs,
      });

      return {
        ...response,
        executedBy: this._describeExecution(
          operation,
          fallbackClient,
          fallbackModel,
          true,
        ),
      };
    } catch (fallbackError: unknown) {
      const err = fallbackError as { message: string };
      if (dispatched) {
        this._settleCircuitOutcome(
          fallbackClient,
          fallbackError,
          this._isClientAbortError(fallbackError),
        );
      }

      logger.error(
        "Selected text provider failed",
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
    operation: OperationName;
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

    const { capabilities } = capabilitiesFor({
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

  /**
   * Report a failed call to the provider circuit. Client aborts and 4xx
   * input errors (except 408/429) say nothing about provider health — they
   * settle a half-open probe without counting as a failure.
   */
  private _settleCircuitOutcome(
    provider: string,
    error: unknown,
    isClientAbort: boolean,
  ): void {
    if (!this.providerCircuit) {
      return;
    }

    const statusCode =
      error && typeof error === "object"
        ? (error as { statusCode?: unknown }).statusCode
        : undefined;
    const isInputError =
      typeof statusCode === "number" &&
      statusCode >= 400 &&
      statusCode < 500 &&
      statusCode !== 408 &&
      statusCode !== 429;

    if (isClientAbort || isInputError) {
      this.providerCircuit.releaseHalfOpenProbe(provider);
      return;
    }

    this.providerCircuit.recordFailure(provider);
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

  getOperationConfig(operation: OperationName): ModelConfigEntry {
    return this.planResolver.getConfig(operation);
  }

  /** Narrows a runtime string to a configured operation for `execute`. */
  hasOperation(operation: string): operation is OperationName {
    return isOperationName(operation);
  }

  getAvailableClients(): string[] {
    return this.clientResolver.getAvailableClients();
  }

  supportsStreaming(operation: OperationName): boolean {
    if (!this.hasAnyClient) {
      return false;
    }
    const { config, circuitFallback } = this._planRoute(operation);
    const client = this.clientResolver.getClient(circuitFallback ? { ...config, ...circuitFallback } : config);
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
