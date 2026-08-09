import SpanLabelingConfig from "../config/SpanLabelingConfig";
import { buildTaskDescription } from "../utils/policyUtils";
import { parseJson, buildUserPayload } from "../utils/jsonUtils";
import type { UserPayloadParams } from "../utils/jsonUtils";
import { validateSchemaOrThrow } from "../validation/SchemaValidator";
import { validateSpans } from "../validation/SpanValidator";
import { buildSystemPrompt } from "../utils/promptBuilder";
import { logger } from "@infrastructure/Logger";
import type {
  LabelSpansResult,
  ValidationPolicy,
  ProcessingOptions,
  LLMSpan,
  LLMMeta,
} from "../types";
import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";
import type { LlmSpanParams, ILlmClient } from "./ILlmClient";
import { attemptRepair } from "./robust-llm-client/repair";
import { injectDefensiveMeta } from "./robust-llm-client/defensiveMeta";
import {
  callModel,
  type ModelResponse,
  type ProviderRequestOptions,
} from "./robust-llm-client/modelInvocation";
import { twoPassExtraction } from "./robust-llm-client/twoPassExtraction";
import type { SpanProviderProfile } from "../providers/types";

export type {
  ModelResponse,
  ProviderRequestOptions,
} from "./robust-llm-client/modelInvocation";

/**
 * Parsed LLM response structure for span labeling
 */
interface ParsedLLMResponse {
  spans?: LLMSpan[];
  meta?: LLMMeta;
  isAdversarial?: boolean;
  is_adversarial?: boolean;
  analysis_trace?: string | null;
  [key: string]: unknown;
}

/**
 * The span-labeling extraction strategy: the "try, validate, repair" cycle,
 * shared by every provider.
 *
 * Provider-specific behavior arrives as a {@link SpanProviderProfile} rather
 * than through subclass hooks (ADR-0020). One class, one algorithm; what
 * varies is data plus a few named functions the profile supplies.
 */
export class SpanLabelingClient implements ILlmClient {
  private _lastResponseMetadata: ModelResponse["metadata"] = {};

  /**
   * Per-span streaming, present only when the profile can do it.
   *
   * Assigned conditionally, not declared as a method: `SpanLabelingService`
   * branches on `if (!llmClient.streamSpans)` to fall back to a buffered
   * call, so a method that always exists would silently disable that
   * fallback for every provider that cannot actually stream.
   */
  streamSpans?: (
    params: LlmSpanParams,
  ) => AsyncGenerator<Record<string, unknown>, void, unknown>;

  constructor(private readonly profile: SpanProviderProfile) {
    if (profile.streamSpans) {
      this.streamSpans = profile.streamSpans;
    }
  }

  /** Which provider profile this client was built for. */
  get providerId(): SpanProviderProfile["id"] {
    return this.profile.id;
  }

  /**
   * Get spans using LLM with validation and optional repair
   */
  async getSpans(params: LlmSpanParams): Promise<LabelSpansResult> {
    const {
      text,
      policy,
      options,
      enableRepair,
      aiService,
      cache,
      nlpSpansAttempted,
    } = params;

    const providerName = this.profile.promptProviderName;

    const estimatedMaxTokens =
      this.profile.maxTokens ??
      SpanLabelingConfig.estimateMaxTokens(
        options.maxSpans || SpanLabelingConfig.DEFAULT_OPTIONS.maxSpans,
      );

    const task = buildTaskDescription(
      options.maxSpans || SpanLabelingConfig.DEFAULT_OPTIONS.maxSpans,
      policy,
    );

    const basePayload: UserPayloadParams = {
      task,
      policy,
      text,
      templateVersion:
        options.templateVersion ||
        SpanLabelingConfig.DEFAULT_OPTIONS.templateVersion,
    };
    const validationPolicy: ValidationPolicy = this.profile.relaxValidation
      ? { ...(policy || {}), nonTechnicalWordLimit: 0 }
      : policy;
    const validationOptions: ProcessingOptions = this.profile.relaxValidation
      ? {
          ...options,
          minConfidence: Math.min(options.minConfidence ?? 0.5, 0.2),
        }
      : options;
    const modelConfig = this._getModelConfig(aiService, "span_labeling");
    const configuredModelName = modelConfig?.model;
    const modelName = configuredModelName || process.env.SPAN_MODEL || "";
    // The profile states the schema outright. This used to be a capability
    // lookup (`strictJsonSchema || provider === "groq" || provider === "qwen"`)
    // feeding a schema-factory if-chain, re-deriving the provider from env and
    // ModelConfig — which could disagree with the provider the router chose.
    const spanSchema = this.profile.jsonSchema;
    const baseProviderOptions = this.profile.requestOptions;
    const providerOptions: ProviderRequestOptions = {
      developerMessage: baseProviderOptions.developerMessage,
      enableBookending: baseProviderOptions.enableBookending,
      useFewShot: baseProviderOptions.useFewShot,
      useSeedFromConfig: baseProviderOptions.useSeedFromConfig,
      enableLogprobs: baseProviderOptions.enableLogprobs,
      providerName,
    };

    const userPayload = this.profile.rawTextPayload
      ? text
      : buildUserPayload(basePayload);

    // Build system prompt
    const contextAwareSystemPrompt = buildSystemPrompt(
      text,
      true,
      providerName,
      Boolean(spanSchema),
      options.templateVersion,
    );

    // Check for two-pass architecture (GPT-4o-mini with complex schemas)
    // Note: Must check for 'gpt-4o-mini' specifically, NOT just 'mini' substring
    // because 'gemini' contains 'mini' but doesn't need two-pass architecture
    const isMini =
      modelName.includes("gpt-4o-mini") ||
      (modelName.includes("mini") && !modelName.includes("gemini"));
    const hasComplexSchema = this._isComplexSchemaForSpans();

    let primaryResponse: ModelResponse;

    if (isMini && hasComplexSchema) {
      // Two-Pass Architecture for mini models
      primaryResponse = await twoPassExtraction({
        systemPrompt: contextAwareSystemPrompt,
        userPayload,
        aiService,
        maxTokens: estimatedMaxTokens,
        providerOptions,
        providerName,
        ...(configuredModelName ? { modelName: configuredModelName } : {}),
        ...(process.env.SPAN_PROVIDER
          ? { clientName: process.env.SPAN_PROVIDER }
          : {}),
        ...(spanSchema && { schema: spanSchema }),
      });
    } else {
      // Standard single-pass extraction
      primaryResponse = await callModel({
        systemPrompt: contextAwareSystemPrompt,
        userPayload,
        aiService,
        maxTokens: estimatedMaxTokens,
        providerOptions,
        ...(spanSchema && { schema: spanSchema }),
      });
    }

    // Store metadata for subclass access
    this._lastResponseMetadata = primaryResponse.metadata;

    const parsedPrimary = this._parse(primaryResponse.text);
    if (!parsedPrimary.ok) {
      throw new Error(parsedPrimary.error);
    }

    // Warn if JSON repair detected likely truncation
    if (parsedPrimary.repairMeta?.isLikelyTruncated) {
      logger.warn("LLM response appears truncated after JSON repair", {
        operation: "span_labeling",
        provider: providerName,
        reason: parsedPrimary.repairMeta.reason,
        model: modelName || "unknown",
      });
    }

    // Cast to expected response type
    let parsedValue = parsedPrimary.value as ParsedLLMResponse;

    // Allow provider-specific normalization before validation
    parsedValue = this._normalize(parsedValue) as ParsedLLMResponse;

    // Inject default meta if LLM omitted it
    injectDefensiveMeta(parsedValue, validationOptions, nlpSpansAttempted);

    // Validate schema
    validateSchemaOrThrow(parsedValue as Record<string, unknown>, spanSchema);

    const rawSpans = Array.isArray(parsedValue.spans)
      ? (parsedValue.spans as Array<Partial<LLMSpan>>)
      : [];

    if (providerName === "gemini") {
      const spanSamples = rawSpans.slice(0, 3).map((span) => {
        const textValue = typeof span.text === "string" ? span.text : "";
        const roleValue = typeof span.role === "string" ? span.role : "";
        return {
          text: textValue ? textValue.slice(0, 80) : null,
          role: roleValue ? roleValue : null,
          confidence:
            typeof span.confidence === "number" ? span.confidence : null,
        };
      });
      const missingTextCount = rawSpans.filter((span) => {
        const textValue = typeof span.text === "string" ? span.text.trim() : "";
        return !textValue;
      }).length;
      const missingRoleCount = rawSpans.filter((span) => {
        const roleValue = typeof span.role === "string" ? span.role.trim() : "";
        return !roleValue;
      }).length;

      logger.debug("Gemini span response parsed", {
        operation: "span_labeling",
        provider: providerName,
        rawSpanCount: rawSpans.length,
        missingTextCount,
        missingRoleCount,
        spanSamples,
      });
    }

    const logGeminiSummary = (
      stage: string,
      result: LabelSpansResult,
    ): void => {
      if (providerName !== "gemini") return;
      const notesPreview =
        typeof result.meta?.notes === "string"
          ? result.meta.notes.slice(0, 240)
          : null;

      logger.debug("Gemini span validation summary", {
        operation: "span_labeling",
        provider: providerName,
        stage,
        rawSpanCount: rawSpans.length,
        finalSpanCount: result.spans?.length ?? 0,
        notesPreview,
      });
    };

    const isAdversarial =
      parsedValue?.isAdversarial === true ||
      parsedValue?.is_adversarial === true;

    // Ensure meta has required properties
    const meta = parsedValue.meta ?? { version: "v1", notes: "" };

    if (isAdversarial) {
      const validation = validateSpans({
        spans: [],
        meta,
        text,
        policy: validationPolicy,
        options: validationOptions,
        attempt: 1,
        cache,
        isAdversarial: true,
        analysisTrace: parsedValue.analysis_trace || null,
      });

      logGeminiSummary("adversarial", validation.result);
      return this._finish(validation.result);
    }

    // Validate spans (strict mode)
    let validation = validateSpans({
      spans: parsedValue.spans || [],
      meta,
      text,
      policy: validationPolicy,
      options: validationOptions,
      attempt: 1,
      cache,
      isAdversarial,
      analysisTrace: parsedValue.analysis_trace || null,
    });

    if (validation.ok) {
      logGeminiSummary("strict", validation.result);
      return this._finish(validation.result);
    }

    // Handle validation failure. A `terminal` verdict means every error can
    // only be resolved by dropping the offending span (the repair prompt
    // forbids changing span text) — a repair round-trip would burn a model
    // call to reach the same lenient outcome, so skip straight to it.
    if (!enableRepair || validation.verdict === "terminal") {
      if (enableRepair) {
        logger.info("Skipping repair: all validation errors are terminal", {
          operation: "span_labeling",
          provider: providerName,
          errorCount: validation.errors.length,
        });
      }

      validation = validateSpans({
        spans: parsedValue.spans || [],
        meta,
        text,
        policy: validationPolicy,
        options: validationOptions,
        attempt: 2,
        cache,
        isAdversarial,
        analysisTrace: parsedValue.analysis_trace || null,
      });

      logGeminiSummary("lenient", validation.result);
      return this._finish(validation.result);
    }

    // Repair attempt
    const repairOutcome = await attemptRepair({
      basePayload,
      validationErrors: validation.errors,
      originalResponse: parsedValue as Record<string, unknown>,
      text,
      policy: validationPolicy,
      options: validationOptions,
      aiService,
      cache,
      estimatedMaxTokens,
      providerOptions,
      providerName,
      parseResponseText: (value) => this._parse(value),
      normalizeParsedResponse: (value) => this._normalize(value),
      injectDefensiveMeta,
      ...(spanSchema && { schema: spanSchema }),
    });
    this._lastResponseMetadata = repairOutcome.metadata;

    logGeminiSummary("repair", repairOutcome.result);
    return this._finish(repairOutcome.result);
  }

  // ============================================================
  // HOOKS - Override in subclasses for provider-specific behavior
  // ============================================================

  /**
   * Parse the response body, deferring to the profile when it supplies its
   * own parser (Gemini recovers spans from NDJSON the generic parser can't
   * read).
   */
  private _parse(text: string): ReturnType<typeof parseJson> {
    return this.profile.parseResponseText
      ? this.profile.parseResponseText(text)
      : parseJson(text);
  }

  /** Reshape the parsed object before validation, if the profile needs to. */
  private _normalize<T extends Record<string, unknown>>(value: T): T {
    return this.profile.normalizeParsedResponse
      ? this.profile.normalizeParsedResponse(value)
      : value;
  }

  /** Apply the profile's finishing pass (Groq caps confidence by logprobs). */
  private _finish(result: LabelSpansResult): LabelSpansResult {
    return this.profile.postProcess
      ? this.profile.postProcess(result, this._lastResponseMetadata ?? {})
      : result;
  }

  // ============================================================
  // SHARED IMPLEMENTATION (Not meant to be overridden)
  // ============================================================

  /**
   * Check if schema is complex enough for two-pass
   */
  private _isComplexSchemaForSpans(): boolean {
    return true; // Span labeling schema is always complex
  }

  /**
   * Get model config for an operation
   */
  protected _getModelConfig(
    aiService: AIExecutionPort,
    operation: string,
  ): { model?: string } | null {
    const envModel = process.env.SPAN_MODEL;
    if (envModel) {
      return { model: envModel };
    }

    if (operation.includes("mini") || operation.includes("draft")) {
      return { model: "gpt-4o-mini-2024-07-18" };
    }

    return null;
  }
}
