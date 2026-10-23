import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";
import { logger } from "@infrastructure/Logger";
import type { ILogger } from "@interfaces/ILogger";
import type { CacheService } from "@services/cache/CacheService";
import { TemperatureOptimizer } from "@utils/TemperatureOptimizer";
import { EnhancementMetricsService } from "./services/EnhancementMetricsService";
import { detectPlaceholder } from "./services/placeholderDetection";
import { privateCacheKey } from "./utils/privateCacheKey";
import { PROMPT_MODES } from "./constants";
import { SpanContextBuilder } from "./services/SpanContextBuilder";
import { EnhancementV2Engine } from "./v2/index.js";
import type {
  EnhancementV2Config,
  EnhancementV2Execution,
  EnhancementV2RequestContext,
} from "./v2/types.js";
import type {
  VideoService,
  BrainstormBuilder,
  DiversityEnforcer,
  EnhancementRequestParams,
  CustomSuggestionRequestParams,
  EnhancementResult,
  EnhancementMetrics,
  Suggestion,
} from "./services/types";

interface EnhancementServiceDependencies {
  aiService: AIExecutionPort;
  videoPromptService: VideoService;
  brainstormBuilder: BrainstormBuilder;
  diversityEnforcer: DiversityEnforcer;
  cacheService: CacheService;
  enhancementConfig?: EnhancementV2Config;
}

interface EnhancementCoreServices {
  ai: AIExecutionPort;
  videoPromptService: VideoService;
  brainstormBuilder: BrainstormBuilder;
}

interface EnhancementPipelineServices {
  metricsLogger: EnhancementMetricsService;
  enhancementV2: EnhancementV2Engine;
  spanContextBuilder: SpanContextBuilder;
}

/**
 * EnhancementService - Main Orchestrator
 *
 * Coordinates enhancement suggestion generation by delegating to specialized services.
 * This service focuses purely on orchestration.
 *
 * Single Responsibility: Orchestrate the enhancement suggestion workflow
 */
export class EnhancementService {
  private readonly core: EnhancementCoreServices;
  private readonly pipeline: EnhancementPipelineServices;
  private readonly cacheConfig: { ttl: number; namespace: string };
  private readonly log: ILogger;
  private readonly cacheService: CacheService;
  private readonly enhancementConfig: EnhancementV2Config;

  constructor(dependencies: EnhancementServiceDependencies) {
    const {
      aiService,
      videoPromptService,
      brainstormBuilder,
      diversityEnforcer,
      cacheService,
      enhancementConfig = {
        policyVersion: "2026-03-v2a",
      },
    } = dependencies;

    this.core = {
      ai: aiService,
      videoPromptService,
      brainstormBuilder,
    };

    this.log = logger.child({ service: "EnhancementService" });
    this.cacheService = cacheService;
    this.enhancementConfig = enhancementConfig;
    this.cacheConfig = this.cacheService.getConfig("enhancement") || {
      ttl: 3600,
      namespace: "enhancement",
    };

    this.pipeline = {
      metricsLogger: new EnhancementMetricsService(),
      enhancementV2: new EnhancementV2Engine({
        aiService,
        videoPromptService,
        diversityEnforcer,
        policyVersion: enhancementConfig.policyVersion,
      }),
      spanContextBuilder: new SpanContextBuilder(),
    };
  }

  /**
   * Get enhancement suggestions for highlighted text
   */
  async getEnhancementSuggestions({
    ownerId,
    highlightedText,
    contextBefore = "",
    contextAfter = "",
    fullPrompt,
    originalUserPrompt,
    brainstormContext,
    highlightedCategory,
    highlightedCategoryConfidence,
    highlightedPhrase,
    allLabeledSpans = [],
    nearbySpans = [],
    editHistory = [],
    debug = false,
  }: EnhancementRequestParams): Promise<EnhancementResult> {

    const metrics: EnhancementMetrics = {
      total: 0,
      cache: false,
      cacheCheck: 0,
      modelDetection: 0,
      sectionDetection: 0,
      promptBuild: 0,
      groqCall: 0,
      postProcessing: 0,
      promptMode: PROMPT_MODES.ENHANCEMENT,
    };
    const startTotal = Date.now();

    let isVideoPrompt = false;
    let modelTarget: string | null = null;
    let promptSection: string | null = null;

    const operation = "getEnhancementSuggestions";

    try {
      this.log.debug("Starting operation.", {
        operation,
        highlightedLength: highlightedText?.length,
        highlightedCategory: highlightedCategory || null,
        categoryConfidence: highlightedCategoryConfidence ?? null,
        hasBrainstormContext: !!brainstormContext,
        editHistoryLength: editHistory?.length || 0,
      });

      const videoContext = this.core.videoPromptService.detectVideoContext({
        fullPrompt,
        highlightedText,
        contextBefore,
        contextAfter,
        highlightedCategory: highlightedCategory ?? null,
        highlightedCategoryConfidence: highlightedCategoryConfidence ?? null,
        metrics,
      });

      isVideoPrompt = videoContext.isVideoPrompt;
      modelTarget = videoContext.modelTarget;
      promptSection = videoContext.promptSection;
      const brainstormSignature =
        this.core.brainstormBuilder.buildBrainstormSignature(
          brainstormContext ?? null,
        );
      const highlightWordCount = videoContext.highlightWordCount;
      const phraseRole = videoContext.phraseRole;
      const videoConstraints = videoContext.videoConstraints;

      const spanContext = this.pipeline.spanContextBuilder.buildSpanContext({
        allLabeledSpans,
        nearbySpans,
        fullPrompt,
        highlightedText,
        highlightedCategory: highlightedCategory ?? null,
        phraseRole,
      });

      const focusGuidance =
        this.core.videoPromptService.getCategoryFocusGuidance(
          phraseRole,
          highlightedCategory ?? null,
          fullPrompt,
          spanContext.guidanceSpans,
          editHistory,
        ) || undefined;

      const isPlaceholder = detectPlaceholder(
        highlightedText,
        contextBefore,
        contextAfter,
        fullPrompt,
      );
      const temperature = this._getEnhancementTemperature();
      const v2Context: EnhancementV2RequestContext = {
        highlightedText,
        contextBefore,
        contextAfter,
        fullPrompt,
        originalUserPrompt: originalUserPrompt ?? fullPrompt,
        brainstormContext: brainstormContext ?? null,
        highlightedCategory: highlightedCategory ?? null,
        highlightedCategoryConfidence: highlightedCategoryConfidence ?? null,
        isPlaceholder,
        isVideoPrompt,
        phraseRole,
        highlightWordCount,
        videoConstraints,
        modelTarget,
        promptSection,
        spanAnchors: spanContext.spanAnchors,
        nearbySpanHints: spanContext.nearbySpanHints,
        lockedSpanCategories: spanContext.lockedSpanCategories,
        ...(focusGuidance !== undefined ? { focusGuidance } : {}),
        debug,
      };

      const cacheStart = Date.now();
      const cacheKey = privateCacheKey(this.cacheConfig.namespace, ownerId, {
        engineVersion: "v2",
        mode: "ordinary",
        policyVersion: this.enhancementConfig.policyVersion,
        context: v2Context,
        editHistory,
        brainstormSignature,
        spanFingerprint: spanContext.spanFingerprint,
      });
      const cached = cacheKey
        ? await this.cacheService.get<EnhancementResult>(cacheKey, "enhancement")
        : null;
      metrics.cacheCheck = Date.now() - cacheStart;

      if (cached && !debug) {
        metrics.cache = true;
        metrics.total = Date.now() - startTotal;
        metrics.promptMode = PROMPT_MODES.ENHANCEMENT;
        this.pipeline.metricsLogger.logMetrics(metrics, {
          highlightedCategory: highlightedCategory ?? null,
          isVideoPrompt,
          modelTarget,
          promptSection,
        });
        this.log.debug("Cache hit for enhancement suggestions", {
          operation,
          cacheCheckTime: metrics.cacheCheck,
          totalTime: metrics.total,
          promptMode: metrics.promptMode,
          suggestionCount: this._countSuggestions(cached.suggestions),
        });
        return { ...cached, fromCache: true };
      }

      if (cached && debug) {
        this.log.debug("Bypassing cache for debug request.", {
          operation,
          cacheCheckTime: metrics.cacheCheck,
        });
      }

      let result: EnhancementResult;
      let rawSuggestionsSnapshot: Suggestion[] = [];
      let finalSuggestionsSnapshot: Suggestion[] = [];
      let systemPromptSent = "";
      let stageCounts: Record<string, number> | undefined;
      let rejectionSummary: Record<string, number> | undefined;
      let modelCallCount: number | undefined;
      let processingNotes = {
        contrastiveDecoding: false,
        diversityEnforced: false,
        alignmentFallback: false,
        usedFallback: false,
        fallbackSourceCount: 0,
      };

      const postStart = Date.now();

      const execution = await this._executeEnhancementV2(v2Context);

      result = execution.result;
      // Snapshot clones feed the `_debug` payload below — only needed when
      // a debug request is in flight (and only outside production). Skipping
      // them on the hot path saves an O(n) shallow-copy per suggestion.
      const wantDebugSnapshots = debug && process.env.NODE_ENV !== "production";
      if (wantDebugSnapshots) {
        rawSuggestionsSnapshot = execution.rawSuggestions.map((suggestion) => ({
          ...suggestion,
        }));
        finalSuggestionsSnapshot = execution.finalSuggestions.map(
          (suggestion) => ({ ...suggestion }),
        );
      }
      systemPromptSent = execution.debug.systemPromptSent || "";
      stageCounts = execution.debug.stageCounts;
      rejectionSummary = execution.debug.rejectionSummary;
      modelCallCount = execution.debug.modelCallCount;
      processingNotes.diversityEnforced =
        execution.finalSuggestions.length !== execution.rawSuggestions.length;
      processingNotes.usedFallback = execution.debug.modelCallCount > 1;

      metrics.postProcessing = Date.now() - postStart;

      // Attach the server-computed span fingerprint to the response.
      // Clients should use this for cache invalidation instead of computing their own.
      result.spanFingerprint = spanContext.spanFingerprint;

      if (cacheKey) {
        await this.cacheService.set(cacheKey, result, {
          ttl: this.cacheConfig.ttl,
        });
      }

      metrics.total = Date.now() - startTotal;
      metrics.promptMode = PROMPT_MODES.ENHANCEMENT;
      this.pipeline.metricsLogger.logMetrics(metrics, {
        highlightedCategory: highlightedCategory ?? null,
        isVideoPrompt,
        modelTarget,
        promptSection,
      });
      this.pipeline.metricsLogger.checkLatency(metrics);

      this.log.info("Operation completed.", {
        operation,
        duration: metrics.total,
        suggestionCount: this._countSuggestions(result.suggestions),
        fromCache: metrics.cache,
        isVideoPrompt,
        isPlaceholder,
        modelTarget,
        promptSection,
      });

      if (debug && process.env.NODE_ENV !== "production") {
        result._debug = {
          engineVersion: "v2",
          policyVersion: this.enhancementConfig.policyVersion,
          fullPrompt,
          selectedSpan: highlightedText,
          category: highlightedCategory ?? null,
          categoryConfidence: highlightedCategoryConfidence ?? null,
          systemPromptSent,
          // Design/slot are currently resolved inside private prompt builder internals.
          design: "",
          slot: "",
          isVideoPrompt,
          isPlaceholder,
          modelTarget,
          promptSection,
          phraseRole,
          rawAiSuggestions: rawSuggestionsSnapshot,
          finalSuggestions: finalSuggestionsSnapshot,
          processingNotes,
          spanContext: {
            spanAnchors: spanContext.spanAnchors ?? "",
            nearbySpanHints: spanContext.nearbySpanHints ?? "",
          },
          videoConstraints: videoConstraints ?? null,
          temperature,
          ...(stageCounts ? { stageCounts } : {}),
          ...(rejectionSummary ? { rejectionSummary } : {}),
          ...(modelCallCount !== undefined ? { modelCallCount } : {}),
          metrics: { ...metrics },
        };
      }

      return result;
    } catch (error) {
      metrics.total = Date.now() - startTotal;
      metrics.promptMode = PROMPT_MODES.ENHANCEMENT;
      this.pipeline.metricsLogger.logMetrics(
        metrics,
        {
          highlightedCategory: highlightedCategory ?? null,
          isVideoPrompt,
          modelTarget,
          promptSection,
        },
        error as Error,
      );

      this.log.error("Operation failed.", error as Error, {
        operation,
        duration: metrics.total,
        highlightedCategory: highlightedCategory ?? null,
        isVideoPrompt,
      });
      throw error;
    }
  }

  /**
   * Get custom suggestions based on user request.
   *
   * Routes through the V2 slot-policy engine using the dedicated
   * CustomPolicy. The user's free-form request is the steering signal
   * (carried via `context.customRequest`), and V2's diversity / scoring
   * post-processing applies the same way it does for category-driven
   * enhancement, with one rescue call available when too few candidates
   * survive scoring.
   */
  async getCustomSuggestions({
    ownerId,
    highlightedText,
    customRequest,
    fullPrompt,
    contextBefore,
    contextAfter,
    metadata,
  }: CustomSuggestionRequestParams): Promise<{ suggestions: Suggestion[] }> {
    const startTime = performance.now();
    const operation = "getCustomSuggestions";

    this.log.debug("Starting operation.", {
      operation,
      customRequestLength: customRequest?.length || 0,
      highlightedLength: highlightedText?.length,
      hasContextBefore: Boolean(contextBefore?.trim()),
      hasContextAfter: Boolean(contextAfter?.trim()),
      hasMetadata: Boolean(metadata && Object.keys(metadata).length > 0),
    });

    const isVideoPrompt =
      this.core.videoPromptService.isVideoPrompt(fullPrompt);

    const v2Context: EnhancementV2RequestContext = {
      highlightedText,
      contextBefore: contextBefore ?? "",
      contextAfter: contextAfter ?? "",
      fullPrompt,
      originalUserPrompt: fullPrompt,
      brainstormContext: null,
      highlightedCategory: null,
      highlightedCategoryConfidence: null,
      isPlaceholder: false,
      isVideoPrompt,
      phraseRole: null,
      highlightWordCount: highlightedText
        ? highlightedText.split(/\s+/).filter(Boolean).length
        : 0,
      videoConstraints: null,
      modelTarget: null,
      promptSection: null,
      spanAnchors: "",
      nearbySpanHints: "",
      lockedSpanCategories: [],
      debug: false,
      customRequest,
      customMetadata: metadata ?? null,
    };

    const cacheKey = privateCacheKey(this.cacheConfig.namespace, ownerId, {
      engineVersion: "v2",
      mode: "custom",
      policyVersion: this.enhancementConfig.policyVersion,
      context: v2Context,
    });
    const cached = cacheKey
      ? await this.cacheService.get<{ suggestions: Suggestion[] }>(
          cacheKey,
          "enhancement",
        )
      : null;
    if (cached) {
      this.log.debug("Cache hit for custom suggestions", {
        operation,
        duration: Math.round(performance.now() - startTime),
        suggestionCount: cached.suggestions?.length || 0,
      });
      return cached;
    }

    const execution = await this.pipeline.enhancementV2.execute(v2Context);
    const suggestions = execution.finalSuggestions;
    const result = { suggestions };

    if (cacheKey) {
      await this.cacheService.set(cacheKey, result, {
        ttl: this.cacheConfig.ttl,
      });
    }

    this.log.info("Operation completed.", {
      operation,
      duration: Math.round(performance.now() - startTime),
      count: suggestions.length,
      rawCount: execution.rawSuggestions.length,
      modelCallCount: execution.debug.modelCallCount,
      categoryId: execution.debug.categoryId,
    });

    return result;
  }

  private async _executeEnhancementV2(
    context: EnhancementV2RequestContext,
  ): Promise<EnhancementV2Execution> {
    return this.pipeline.enhancementV2.execute(context);
  }

  private _countSuggestions(
    suggestions: EnhancementResult["suggestions"] | undefined,
  ): number {
    if (!Array.isArray(suggestions)) return 0;
    const first = suggestions[0] as { suggestions?: unknown } | undefined;
    if (first && Array.isArray(first.suggestions)) {
      return suggestions.reduce((sum, group) => {
        const groupSuggestions = (group as { suggestions?: unknown })
          .suggestions;
        return (
          sum + (Array.isArray(groupSuggestions) ? groupSuggestions.length : 0)
        );
      }, 0);
    }
    return suggestions.length;
  }

  private _getEnhancementTemperature(): number {
    const config = this.core.ai.getOperationConfig?.("enhance_suggestions");
    if (typeof config?.temperature === "number") {
      return config.temperature;
    }
    return TemperatureOptimizer.getOptimalTemperature("enhancement", {
      diversity: "high",
      precision: "medium",
    });
  }
}
