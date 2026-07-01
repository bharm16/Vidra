import SpanLabelingConfig from "../config/SpanLabelingConfig";
import { buildTaskDescription } from "../utils/policyUtils";
import { parseJson, buildUserPayload } from "../utils/jsonUtils";
import type { UserPayloadParams } from "../utils/jsonUtils";
import { validateSchemaOrThrow } from "../validation/SchemaValidator";
import { validateSpans } from "../validation/SpanValidator";
import { buildSystemPrompt } from "../utils/promptBuilder";
import { detectAndGetCapabilities } from "@utils/provider/ProviderDetector";
import { getSpanLabelingSchema } from "@utils/provider/SchemaFactory";
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
 * Base LLM Client - Provider Agnostic
 *
 * Encapsulates the "try, validate, repair" cycle for LLM-based span labeling.
 *
 * DESIGN: This base class contains NO provider-specific logic.
 * Subclasses (GroqLlmClient, OpenAILlmClient) override hooks to customize behavior.
 *
 * Hook methods that subclasses should override:
 * - _getProviderRequestOptions(): Configure provider-specific request options
 * - _postProcessResult(): Apply provider-specific post-processing
 * - _getProviderName(): Return provider identifier for logging
 */
export class RobustLlmClient implements ILlmClient {
  /**
   * Last response metadata - available for subclass post-processing
   */
  protected _lastResponseMetadata: ModelResponse["metadata"] = {};

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

    // Get provider-specific options from subclass (merge providerName for few-shot lookup)
    const providerName = this._getProviderName();
    const isGemini = providerName === "gemini";

    // Use higher maxTokens for Gemini Flash to handle multi-paragraph responses
    const estimatedMaxTokens = isGemini
      ? 16384 // Match test script - allows full multi-paragraph extraction
      : SpanLabelingConfig.estimateMaxTokens(
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
    const validationPolicy: ValidationPolicy = isGemini
      ? { ...(policy || {}), nonTechnicalWordLimit: 0 }
      : policy;
    const validationOptions: ProcessingOptions = isGemini
      ? {
          ...options,
          minConfidence: Math.min(options.minConfidence ?? 0.5, 0.2),
        }
      : options;
    const modelConfig = this._getModelConfig(aiService, "span_labeling");
    const configuredModelName = modelConfig?.model;
    const modelName = configuredModelName || process.env.SPAN_MODEL || "";
    const clientName = process.env.SPAN_PROVIDER || providerName;
    const { provider, capabilities } = detectAndGetCapabilities({
      operation: "span_labeling",
      ...(modelName && { model: modelName }),
      ...(clientName && { client: clientName }),
    });
    const supportsSchema =
      capabilities.strictJsonSchema ||
      provider === "groq" ||
      provider === "qwen";
    const spanSchema = supportsSchema
      ? getSpanLabelingSchema({
          operation: "span_labeling",
          ...(modelName && { model: modelName }),
          provider,
        })
      : undefined;
    const baseProviderOptions = this._getProviderRequestOptions();
    const providerOptions: ProviderRequestOptions = {
      developerMessage: baseProviderOptions.developerMessage,
      enableBookending: baseProviderOptions.enableBookending,
      useFewShot: baseProviderOptions.useFewShot,
      useSeedFromConfig: baseProviderOptions.useSeedFromConfig,
      enableLogprobs: baseProviderOptions.enableLogprobs,
      providerName,
    };

    const userPayload = isGemini ? text : buildUserPayload(basePayload);

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

    const parsedPrimary = this._parseResponseText(primaryResponse.text);
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
    parsedValue = this._normalizeParsedResponse(
      parsedValue,
    ) as ParsedLLMResponse;

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
      return this._postProcessResult(validation.result);
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
      return this._postProcessResult(validation.result);
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
      return this._postProcessResult(validation.result);
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
      parseResponseText: (value) => this._parseResponseText(value),
      normalizeParsedResponse: (value) => this._normalizeParsedResponse(value),
      injectDefensiveMeta,
      ...(spanSchema && { schema: spanSchema }),
    });
    this._lastResponseMetadata = repairOutcome.metadata;

    logGeminiSummary("repair", repairOutcome.result);
    return this._postProcessResult(repairOutcome.result);
  }

  // ============================================================
  // HOOKS - Override in subclasses for provider-specific behavior
  // ============================================================

  /**
   * HOOK: Get provider-specific request options
   *
   * Override in subclasses to configure:
   * - enableBookending: Repeat instructions at end (OpenAI)
   * - useFewShot: Include few-shot examples (Groq)
   * - useSeedFromConfig: Enable deterministic output
   * - enableLogprobs: Request token probabilities (Groq)
   * - developerMessage: Hard constraints (OpenAI)
   */
  protected _getProviderRequestOptions(): ProviderRequestOptions {
    // Default: Conservative options that work for any provider
    return {
      enableBookending: false,
      useFewShot: false,
      useSeedFromConfig: true,
      enableLogprobs: false,
    };
  }

  /**
   * HOOK: Get provider name for logging and prompt building
   */
  protected _getProviderName(): string {
    return "unknown";
  }

  /**
   * HOOK: Post-process result with provider-specific adjustments
   *
   * Override in subclasses for:
   * - Groq: Logprobs-based confidence adjustment
   * - OpenAI: No adjustments needed (strict schema handles it)
   */
  protected _postProcessResult(result: LabelSpansResult): LabelSpansResult {
    // Default: No post-processing
    return result;
  }

  /**
   * HOOK: Parse response text into JSON
   *
   * Override in subclasses to provide provider-specific parsing or repair.
   */
  protected _parseResponseText(text: string): ReturnType<typeof parseJson> {
    return parseJson(text);
  }

  /**
   * HOOK: Normalize parsed response before validation
   *
   * Override in subclasses to map provider-specific fields.
   */
  protected _normalizeParsedResponse<T extends Record<string, unknown>>(
    value: T,
  ): T {
    return value;
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
