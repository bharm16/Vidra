import { logger } from "@infrastructure/Logger";
import OptimizationConfig from "@config/OptimizationConfig";
// Import the examples along with the generator
import {
  generateUniversalVideoPrompt,
  generateUniversalVideoPromptWithLockedSpans,
  VIDEO_FEW_SHOT_EXAMPLES,
} from "./videoPromptOptimizationTemplate";
import { StructuredOutputEnforcer } from "@utils/StructuredOutputEnforcer";
import { hashString } from "@utils/hash";
import { getVideoTemplateBuilder } from "./video-templates/index";
import { getVideoOptimizationSchema } from "@utils/provider/SchemaFactory";
import type { CapabilityValues } from "@shared/capabilities";
import type {
  AIService,
  TemplateService,
  LockedSpan,
  OptimizationRequest,
  ShotPlan,
  OptimizationStrategy,
  StructuredOptimizationArtifact,
} from "../types";
import {
  parseVideoPromptStructuredResponse,
  type VideoPromptSlots,
  type VideoPromptStructuredResponse,
} from "./videoPromptTypes";
import { lintVideoPromptSlots, mergeLintResults } from "./videoPromptLinter";
import {
  renderMainVideoPrompt,
  renderPreviewPrompt,
} from "./videoPromptRenderer";
import { normalizeSlots } from "./video/slots/normalizeSlots";
import { rerollSlots } from "./video/slots/rerollSlots";
import { decideSlotRepair } from "./video/slots/decideSlotRepair";

function slotCompletenessScore(slots: VideoPromptSlots): number {
  const signals = [
    slots.subject ? 1 : 0,
    slots.action ? 1 : 0,
    slots.setting ? 1 : 0,
    slots.lighting ? 1 : 0,
    slots.style ? 1 : 0,
    slots.camera_move ? 1 : 0,
  ];
  return signals.reduce((sum, value) => sum + value, 0) / signals.length;
}

/**
 * Strategy for optimizing video generation prompts
 * Uses specialized video prompt template with Chain-of-Thought reasoning
 * Returns structured JSON internally but assembles to text for backward compatibility
 */
export class VideoStrategy implements OptimizationStrategy {
  readonly name = "video";
  private readonly ai: AIService;
  private readonly templateService: TemplateService;

  constructor(aiService: AIService, templateService: TemplateService) {
    this.ai = aiService;
    this.templateService = templateService;
  }

  /**
   * Optimize a prompt into video prompt slots.
   *
   * Provider-aware: the execution router decides which provider will run the
   * call, which selects the template builder (OpenAI gets a developerMessage +
   * strict schema; Groq gets embedded instructions + sandwich prompting) and the
   * strict schema. Native Structured Outputs first, StructuredOutputEnforcer as
   * the fallback, few-shot examples throughout to keep structural arrows out of
   * the slot values.
   */
  async optimizeStructured({
    prompt,
    shotPlan = null,
    generationParams = null,
    lockedSpans = [],
    brainstormContext = null,
    signal,
  }: OptimizationRequest): Promise<StructuredOptimizationArtifact> {
    logger.info(
      "Optimizing prompt with video strategy (Provider-Aware + Strict Schema + Few-Shot)",
    );
    const config = this.getConfig();

    // The provider that will actually run this call. Read from the router
    // rather than derived from ModelConfig: the table records what was
    // requested, and it drives both the template builder and the strict
    // schema below — so a stale answer shapes the request for a provider that
    // never sees it.
    const { provider, model } = this.ai.resolveExecution("optimize_standard");

    logger.debug("Provider resolved for video optimization", { provider });

    const originalUserPrompt =
      typeof brainstormContext?.originalUserPrompt === "string" &&
      brainstormContext.originalUserPrompt.trim()
        ? brainstormContext.originalUserPrompt.trim()
        : null;
    const sourcePrompt = originalUserPrompt ?? prompt;

    // Strategy 1: Attempt Native Strict Structured Outputs (Best Quality)
    try {
      // Get provider-specific template builder
      const templateBuilder = getVideoTemplateBuilder({
        provider,
        ...(lockedSpans && lockedSpans.length > 0 ? { lockedSpans } : {}),
      });

      // Build provider-optimized template
      const template = templateBuilder.buildTemplate({
        userConcept: prompt,
        ...(shotPlan
          ? { interpretedPlan: shotPlan as unknown as Record<string, unknown> }
          : {}),
        ...(lockedSpans && lockedSpans.length > 0 ? { lockedSpans } : {}),
        includeInstructions: true,
        ...(originalUserPrompt ? { originalUserPrompt } : {}),
        ...(generationParams ? { generationParams } : {}),
      });

      // Get provider-specific schema
      const schema = getVideoOptimizationSchema({
        operation: "optimize_standard",
        provider,
        model,
      });

      logger.debug("Using provider-specific template", {
        provider: template.provider,
        hasDeveloperMessage: !!template.developerMessage,
        systemPromptLength: template.systemPrompt.length,
      });

      const messages = [
        { role: "system", content: template.systemPrompt },
        ...VIDEO_FEW_SHOT_EXAMPLES,
        { role: "user", content: template.userMessage },
      ] as Array<{ role: string; content: string }>;

      logger.debug(
        "Attempting Native Strict Schema generation with Few-Shot examples",
      );

      const response = await this.ai.execute("optimize_standard", {
        systemPrompt: template.systemPrompt,
        messages,
        schema,
        ...(template.developerMessage
          ? { developerMessage: template.developerMessage }
          : {}),
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        timeout: config.timeout,
        ...(signal ? { signal } : {}),
      });

      const parsedResponse = parseVideoPromptStructuredResponse(response.text);
      const resolvedStructuredPrompt = await this.resolveStructuredPrompt({
        prompt,
        parsedResponse,
        schema,
        templateSystemPrompt: template.systemPrompt,
        userMessage: template.userMessage,
        provider,
        messages,
        config,
        ...(template.developerMessage
          ? { developerMessage: template.developerMessage }
          : {}),
        ...(signal ? { signal } : {}),
      });
      const normalizedSlots = normalizeSlots(resolvedStructuredPrompt);

      logger.info(
        "Video optimization complete with native structured outputs",
        {
          originalLength: prompt.length,
          shotFraming: normalizedSlots.shot_framing,
          strategy: resolvedStructuredPrompt._creative_strategy,
          provider,
          usedDeveloperMessage: !!template.developerMessage,
        },
      );

      return this.buildStructuredArtifact(
        resolvedStructuredPrompt,
        generationParams,
        sourcePrompt,
        {
          fallbackUsed: false,
          lintPassed: this.isStructuredPromptLintClean(
            resolvedStructuredPrompt,
          ),
        },
      );
    } catch (error) {
      logger.warn("Native Strict Mode failed, falling back to Enforcer", {
        error: (error as Error).message,
      });

      return this._fallbackOptimization(
        prompt,
        shotPlan as ShotPlan | null,
        lockedSpans,
        config,
        generationParams,
        sourcePrompt,
        signal,
      );
    }
  }

  renderStructuredPrompt(
    structuredPrompt: VideoPromptStructuredResponse,
  ): string {
    return renderMainVideoPrompt(normalizeSlots(structuredPrompt));
  }

  /**
   * Fallback method using StructuredOutputEnforcer for unsupported providers
   */
  private async _fallbackOptimization(
    prompt: string,
    shotPlan: ShotPlan | null,
    lockedSpans: LockedSpan[],
    config: { maxTokens: number; temperature: number; timeout: number },
    generationParams?: CapabilityValues | null,
    sourcePrompt?: string | null,
    signal?: AbortSignal,
  ): Promise<StructuredOptimizationArtifact> {
    // Generate full system prompt (legacy format)
    const normalizedShotPlan = shotPlan
      ? (shotPlan as unknown as Record<string, unknown>)
      : null;
    const systemPrompt =
      lockedSpans && lockedSpans.length > 0
        ? generateUniversalVideoPromptWithLockedSpans(
            prompt,
            normalizedShotPlan,
            lockedSpans,
            false,
            sourcePrompt ?? null,
          )
        : generateUniversalVideoPrompt(
            prompt,
            normalizedShotPlan,
            false,
            sourcePrompt ?? null,
          );

    // Simpler schema for non-strict fallback
    const looseSchema = {
      type: "object" as const,
      required: [
        "_creative_strategy",
        "shot_framing",
        "camera_angle",
        "camera_move",
        "subject",
        "subject_details",
        "action",
        "setting",
        "time",
        "lighting",
        "style",
        "technical_specs",
      ],
      // camera_lens is intentionally NOT in required — slot is optional
      // (Sub-project C, 2026-05-22-optimize-camera-lens-slot-design.md).
      // StructuredOutputEnforcer accepts extra fields the LLM emits, so the
      // field is preserved on roundtrip without needing an explicit
      // properties declaration here.
    };

    const parsedResponse = (await StructuredOutputEnforcer.enforceJSON(
      this.ai,
      systemPrompt,
      {
        operation: "optimize_standard",
        schema: looseSchema,
        isArray: false,
        maxRetries: 2,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        timeout: config.timeout,
        ...(signal ? { signal } : {}),
      },
    )) as VideoPromptStructuredResponse;

    const normalizedSlots = normalizeSlots(parsedResponse);
    const lint = mergeLintResults(
      lintVideoPromptSlots(parsedResponse),
      lintVideoPromptSlots(normalizedSlots),
    );

    logger.info("Video optimization complete with fallback enforcer", {
      originalLength: prompt.length,
      shotFraming: normalizedSlots.shot_framing,
      strategy: parsedResponse._creative_strategy,
      lintOk: lint.ok,
    });

    return this.buildStructuredArtifact(
      { ...parsedResponse, ...normalizedSlots },
      generationParams,
      sourcePrompt ?? prompt,
      {
        fallbackUsed: true,
        lintPassed: false,
      },
    );
  }

  private applyGenerationParams(
    parsed: VideoPromptStructuredResponse,
    generationParams?: CapabilityValues | null,
  ): VideoPromptStructuredResponse {
    if (!generationParams) {
      return parsed;
    }

    const technicalSpecs = { ...(parsed.technical_specs || {}) };

    const aspectRatio = generationParams.aspect_ratio;
    if (typeof aspectRatio === "string" && aspectRatio.trim()) {
      technicalSpecs.aspect_ratio = aspectRatio.trim();
    }

    const durationSeconds = generationParams.duration_s;
    if (
      typeof durationSeconds === "number" &&
      Number.isFinite(durationSeconds)
    ) {
      technicalSpecs.duration = `${durationSeconds}s`;
    }

    const fps = generationParams.fps;
    if (typeof fps === "number" && Number.isFinite(fps)) {
      technicalSpecs.frame_rate = `${fps}fps`;
    }

    const resolution = generationParams.resolution;
    if (typeof resolution === "string" && resolution.trim()) {
      technicalSpecs.resolution = resolution.trim();
    }

    const audio = generationParams.audio;
    if (typeof audio === "boolean") {
      technicalSpecs.audio = audio ? "enabled" : "mute";
    }

    return {
      ...parsed,
      technical_specs: technicalSpecs,
    };
  }

  private async _repairSlots(options: {
    templateSystemPrompt: string;
    developerMessage?: string;
    schema: Record<string, unknown>;
    userMessage: string;
    originalJson: VideoPromptStructuredResponse;
    lintErrors: string[];
    config: { maxTokens: number; temperature: number; timeout: number };
    signal?: AbortSignal;
  }): Promise<VideoPromptStructuredResponse> {
    const repairSystemPrompt =
      "You are a strict JSON repair assistant for video prompt slot output. Fix the JSON fields to satisfy the lint errors. Return ONLY valid JSON that matches the provided schema. Do not add any prose.";

    const repairUserMessage = `${options.userMessage}

<lint_errors>
${options.lintErrors.map((e) => `- ${e}`).join("\n")}
</lint_errors>

<original_json>
${JSON.stringify(options.originalJson, null, 2)}
</original_json>`;

    const response = await this.ai.execute("optimize_standard", {
      systemPrompt: repairSystemPrompt,
      userMessage: repairUserMessage,
      schema: options.schema,
      ...(options.developerMessage
        ? { developerMessage: options.developerMessage }
        : {}),
      maxTokens: options.config.maxTokens,
      temperature: 0.2,
      timeout: options.config.timeout,
      ...(options.signal ? { signal: options.signal } : {}),
    });

    const repaired = parseVideoPromptStructuredResponse(response.text);
    const normalizedSlots = normalizeSlots(repaired);
    return { ...repaired, ...normalizedSlots };
  }

  private async resolveStructuredPrompt(options: {
    prompt: string;
    parsedResponse: VideoPromptStructuredResponse;
    schema: Record<string, unknown>;
    templateSystemPrompt: string;
    userMessage: string;
    provider: string;
    messages: Array<{ role: string; content: string }>;
    config: { maxTokens: number; temperature: number; timeout: number };
    developerMessage?: string;
    signal?: AbortSignal;
  }): Promise<VideoPromptStructuredResponse> {
    const normalizedSlots = normalizeSlots(options.parsedResponse);
    const lint = mergeLintResults(
      lintVideoPromptSlots(options.parsedResponse),
      lintVideoPromptSlots(normalizedSlots),
    );

    if (lint.ok) {
      return { ...options.parsedResponse, ...normalizedSlots };
    }

    const completenessScore = slotCompletenessScore(normalizedSlots);
    const decision = decideSlotRepair({
      findings: lint.findings,
      completenessScore,
      minAcceptableScore: OptimizationConfig.quality.minAcceptableScore,
    });

    if (!decision.shouldRepair) {
      logger.warn(
        "Video prompt slot lint has non-critical issues (skipping repair)",
        {
          errors: lint.errors,
          provider: options.provider,
          completenessScore,
        },
      );
      return { ...options.parsedResponse, ...normalizedSlots };
    }

    logger.warn("Video prompt slot lint failed (repairing critical issues)", {
      errors: lint.errors,
      criticalErrors: decision.critical.map((finding) => finding.code),
      qualityErrors: decision.quality.map((finding) => finding.code),
      provider: options.provider,
    });

    const rerollAttempts = decision.rerollAttempts;
    const rerolled = await rerollSlots({
      ai: this.ai,
      templateSystemPrompt: options.templateSystemPrompt,
      schema: options.schema,
      messages: options.messages,
      config: options.config,
      baseSeed: hashString(options.prompt),
      attempts: rerollAttempts,
      ...(options.developerMessage
        ? { developerMessage: options.developerMessage }
        : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });

    if (rerolled) {
      logger.info("Video prompt lint fixed via reroll", {
        provider: options.provider,
      });
      return rerolled;
    }

    return this._repairSlots({
      templateSystemPrompt: options.templateSystemPrompt,
      schema: options.schema,
      userMessage: options.userMessage,
      originalJson: options.parsedResponse,
      lintErrors: lint.errors,
      config: options.config,
      ...(options.developerMessage
        ? { developerMessage: options.developerMessage }
        : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  }

  private buildStructuredArtifact(
    parsed: VideoPromptStructuredResponse,
    generationParams: CapabilityValues | null | undefined,
    sourcePrompt: string,
    flags: { fallbackUsed?: boolean; lintPassed?: boolean } = {},
  ): StructuredOptimizationArtifact {
    const resolved = this.applyGenerationParams(parsed, generationParams);
    const normalizedSlots = normalizeSlots(resolved);
    const structuredPrompt = { ...resolved, ...normalizedSlots };
    const aspectRatio =
      typeof structuredPrompt.technical_specs?.aspect_ratio === "string"
        ? structuredPrompt.technical_specs.aspect_ratio.trim()
        : "";

    return {
      sourcePrompt,
      structuredPrompt,
      previewPrompt: renderPreviewPrompt(normalizedSlots),
      ...(aspectRatio ? { aspectRatio } : {}),
      fallbackUsed: flags.fallbackUsed ?? false,
      lintPassed:
        flags.lintPassed ?? this.isStructuredPromptLintClean(structuredPrompt),
    };
  }

  private isStructuredPromptLintClean(
    parsed: VideoPromptStructuredResponse,
  ): boolean {
    const normalizedSlots = normalizeSlots(parsed);
    return mergeLintResults(
      lintVideoPromptSlots(parsed),
      lintVideoPromptSlots(normalizedSlots),
    ).ok;
  }

  /**
   * Get configuration for video strategy
   */
  getConfig(): { maxTokens: number; temperature: number; timeout: number } {
    return {
      maxTokens: OptimizationConfig.tokens.optimization.video,
      temperature: OptimizationConfig.temperatures.optimization.video,
      timeout: OptimizationConfig.timeouts.optimization.video,
    };
  }
}

export default VideoStrategy;
