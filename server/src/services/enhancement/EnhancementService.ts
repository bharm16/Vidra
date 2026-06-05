import { logger } from "@infrastructure/Logger";
import type { ILogger } from "@interfaces/ILogger";
import type { CacheService } from "@services/cache/CacheService";
import { sha256Hex } from "@utils/hash";
import { TemperatureOptimizer } from "@utils/TemperatureOptimizer";
import { EnhancementMetricsService } from "./services/EnhancementMetricsService";
import { VideoContextDetectionService } from "./services/VideoContextDetectionService";
import { detectPlaceholder } from "./services/placeholderDetection";
import { CacheKeyFactory } from "./utils/CacheKeyFactory";
import { PROMPT_MODES } from "./constants";
import { SpanContextBuilder } from "./services/SpanContextBuilder";
import { EnhancementV2Engine } from "./v2/index.js";
import type { SuggestionsTrace } from "@services/observability/SuggestionsTelemetryService";
import type {
  EnhancementV2Config,
  EnhancementV2Execution,
  EnhancementV2RequestContext,
} from "./v2/types.js";
import type {
  AIService,
  VideoService,
  BrainstormBuilder,
  DiversityEnforcer,
  EnhancementRequestParams,
  CustomSuggestionRequestParams,
  EnhancementResult,
  EnhancementMetrics,
  Suggestion,
  VideoConstraints,
  GroupedSuggestions,
  LabeledSpan,
  NearbySpan,
} from "./services/types";

const makeNoopSuggestionsTrace = (): SuggestionsTrace =>
  ({
    recordStage: () => {},
    recordCacheHit: () => {},
    recordError: () => {},
    complete: () => {},
  }) as unknown as SuggestionsTrace;

interface EnhancementServiceDependencies {
  aiService: AIService;
  videoPromptService: VideoService;
  brainstormBuilder: BrainstormBuilder;
  diversityEnforcer: DiversityEnforcer;
  cacheService: CacheService;
  enhancementConfig?: EnhancementV2Config;
}

interface EnhancementCoreServices {
  ai: AIService;
  videoPromptService: VideoService;
  brainstormBuilder: BrainstormBuilder;
}

interface EnhancementPipelineServices {
  metricsLogger: EnhancementMetricsService;
  videoContextDetection: VideoContextDetectionService;
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
      videoContextDetection: new VideoContextDetectionService(
        videoPromptService,
      ),
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
    highlightedText,
    contextBefore,
    contextAfter,
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
    trace,
  }: EnhancementRequestParams): Promise<EnhancementResult> {
    const t = trace ?? makeNoopSuggestionsTrace();
    let currentStage:
      | "video_context"
      | "span_context"
      | "cache"
      | "v2_engine"
      | "post_processing" = "video_context";
    let v2Execution: EnhancementV2Execution | null = null;

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
    let phraseRoleForTelemetry: string | null = null;

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

      currentStage = "video_context";
      const videoContextStart = performance.now();
      const videoContext =
        this.pipeline.videoContextDetection.detectVideoContext({
          fullPrompt,
          highlightedText,
          contextBefore,
          contextAfter,
          highlightedCategory: highlightedCategory ?? null,
          highlightedCategoryConfidence: highlightedCategoryConfidence ?? null,
          metrics,
        });
      t.recordStage("video_context", performance.now() - videoContextStart);

      isVideoPrompt = videoContext.isVideoPrompt;
      modelTarget = videoContext.modelTarget;
      promptSection = videoContext.promptSection;
      const brainstormSignature =
        this.core.brainstormBuilder.buildBrainstormSignature(
          brainstormContext ?? null,
        );
      const highlightWordCount = videoContext.highlightWordCount;
      const phraseRole = videoContext.phraseRole;
      phraseRoleForTelemetry = phraseRole;
      const videoConstraints = videoContext.videoConstraints;

      currentStage = "span_context";
      const spanContextStart = performance.now();
      const spanContext = this.pipeline.spanContextBuilder.buildSpanContext({
        allLabeledSpans,
        nearbySpans,
        fullPrompt,
        highlightedText,
        highlightedCategory: highlightedCategory ?? null,
        phraseRole,
      });
      t.recordStage("span_context", performance.now() - spanContextStart);

      const focusGuidance =
        this.core.videoPromptService.getCategoryFocusGuidance(
          phraseRole,
          highlightedCategory ?? null,
          fullPrompt,
          spanContext.guidanceSpans,
          editHistory,
        ) || undefined;

      currentStage = "cache";
      const cacheStart = Date.now();
      const cacheKey = CacheKeyFactory.generateKey(
        `${this.cacheConfig.namespace}:v2`,
        {
          engineVersion: "v2",
          highlightedText,
          contextBefore,
          contextAfter,
          fullPrompt,
          originalUserPrompt,
          isVideoPrompt,
          brainstormSignature,
          highlightedCategory: highlightedCategory ?? null,
          highlightWordCount,
          phraseRole,
          videoConstraints,
          editHistory,
          modelTarget,
          promptSection,
          policyVersion: this.enhancementConfig.policyVersion,
          spanFingerprint: spanContext.spanFingerprint,
        },
        this.cacheService,
      );

      const cached = await this.cacheService.get<EnhancementResult>(
        cacheKey,
        "enhancement",
      );
      metrics.cacheCheck = Date.now() - cacheStart;
      t.recordStage("cache", metrics.cacheCheck);

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
        t.recordCacheHit();
        t.complete({
          outcome: "success",
          promptLength: fullPrompt?.length ?? 0,
          suggestionCount: this._countSuggestions(cached.suggestions),
          highlightedCategory: highlightedCategory ?? null,
          isVideoPrompt,
          isPlaceholder: cached.isPlaceholder,
          modelTarget,
          promptSection,
          phraseRole,
          policyVersion: this.enhancementConfig.policyVersion,
          categoryId: null,
          engineMode: null,
          modelCallCount: 0,
          fallbackApplied: false,
          debug,
          highlightedText: highlightedText ?? "",
          fullPrompt: fullPrompt ?? "",
          suggestions: this._flattenSuggestionTexts(cached.suggestions),
        });
        return cached;
      }

      if (cached && debug) {
        this.log.debug("Bypassing cache for debug request.", {
          operation,
          cacheCheckTime: metrics.cacheCheck,
        });
      }

      const isPlaceholder = detectPlaceholder(
        highlightedText,
        contextBefore,
        contextAfter,
        fullPrompt,
      );
      const temperature = this._getEnhancementTemperature();
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

      currentStage = "v2_engine";
      const v2EngineStart = performance.now();
      const execution = await this._executeEnhancementV2({
        highlightedText,
        contextBefore,
        contextAfter,
        fullPrompt,
        originalUserPrompt,
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
      });
      t.recordStage("v2_engine", performance.now() - v2EngineStart);
      v2Execution = execution;

      currentStage = "post_processing";
      const postProcessingStart = performance.now();

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

      await this.cacheService.set(cacheKey, result, {
        ttl: this.cacheConfig.ttl,
      });

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

      t.recordStage("post_processing", performance.now() - postProcessingStart);
      t.complete({
        outcome: "success",
        promptLength: fullPrompt?.length ?? 0,
        suggestionCount: this._countSuggestions(result.suggestions),
        highlightedCategory: highlightedCategory ?? null,
        isVideoPrompt,
        isPlaceholder,
        modelTarget,
        promptSection,
        phraseRole,
        policyVersion: execution.debug.policyVersion,
        categoryId: execution.debug.categoryId,
        engineMode: execution.debug.mode,
        modelCallCount: execution.debug.modelCallCount,
        fallbackApplied: result.fallbackApplied,
        debug,
        highlightedText: highlightedText ?? "",
        fullPrompt: fullPrompt ?? "",
        suggestions: this._flattenSuggestionTexts(result.suggestions),
      });

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

      t.recordError(currentStage, error);
      t.complete({
        outcome: "error",
        promptLength: fullPrompt?.length ?? 0,
        suggestionCount: 0,
        highlightedCategory: highlightedCategory ?? null,
        isVideoPrompt,
        isPlaceholder: false,
        modelTarget,
        promptSection,
        phraseRole: phraseRoleForTelemetry,
        policyVersion:
          v2Execution?.debug.policyVersion ??
          this.enhancementConfig.policyVersion,
        categoryId: v2Execution?.debug.categoryId ?? null,
        engineMode: v2Execution?.debug.mode ?? null,
        modelCallCount: v2Execution?.debug.modelCallCount ?? 0,
        fallbackApplied: v2Execution?.result.fallbackApplied ?? false,
        debug,
        highlightedText: highlightedText ?? "",
        fullPrompt: fullPrompt ?? "",
        suggestions: [],
      });

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

    // Check cache. Hash full inputs instead of substring-truncating — the
    // previous truncation (fullPrompt to 500, contexts to 200) caused silent
    // collisions for prompts that diverged past those positions and produced
    // wrong cached suggestions.
    const cacheKey = this.cacheService.generateKey(this.cacheConfig.namespace, {
      engineVersion: "v2",
      mode: "custom",
      policyVersion: this.enhancementConfig.policyVersion,
      highlightedText,
      customRequest,
      fullPromptHash: sha256Hex(fullPrompt, 16),
      contextBeforeHash: contextBefore ? sha256Hex(contextBefore, 16) : null,
      contextAfterHash: contextAfter ? sha256Hex(contextAfter, 16) : null,
      spanId:
        (metadata as { spanId?: string } | null)?.spanId ??
        (metadata as { span?: { id?: string } } | null)?.span?.id ??
        null,
    });

    const cached = await this.cacheService.get<{ suggestions: Suggestion[] }>(
      cacheKey,
      "enhancement",
    );
    if (cached) {
      this.log.debug("Cache hit for custom suggestions", {
        operation,
        duration: Math.round(performance.now() - startTime),
        suggestionCount: cached.suggestions?.length || 0,
      });
      return cached;
    }

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

    const execution = await this.pipeline.enhancementV2.execute(v2Context);
    const suggestions = execution.finalSuggestions;
    const result = { suggestions };

    await this.cacheService.set(cacheKey, result, {
      ttl: this.cacheConfig.ttl,
    });

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

  /**
   * Flattens the polymorphic suggestion shape (flat array vs grouped array)
   * to a plain string[] of suggestion texts, for the telemetry event content.
   * Lets dashboards show the actual alternatives the model returned.
   */
  private _flattenSuggestionTexts(
    suggestions: EnhancementResult["suggestions"] | undefined,
  ): string[] {
    if (!Array.isArray(suggestions)) return [];
    const first = suggestions[0] as { suggestions?: unknown } | undefined;
    if (first && Array.isArray(first.suggestions)) {
      const out: string[] = [];
      for (const group of suggestions) {
        const groupSuggestions = (group as { suggestions?: unknown })
          .suggestions;
        if (Array.isArray(groupSuggestions)) {
          for (const s of groupSuggestions) {
            const text = (s as { text?: unknown })?.text;
            if (typeof text === "string") out.push(text);
          }
        }
      }
      return out;
    }
    return suggestions
      .map((s) => (s as { text?: unknown })?.text)
      .filter((t): t is string => typeof t === "string");
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
