import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";
import { logger } from "@infrastructure/Logger";
import type { ILogger } from "@interfaces/ILogger";
import type { CacheService } from "@services/cache/CacheService";
import { sha256Hex } from "@utils/hash";
import { TemperatureOptimizer } from "@utils/TemperatureOptimizer";
import { EnhancementMetricsService } from "./services/EnhancementMetricsService";
import { detectPlaceholder } from "./services/placeholderDetection";
import { CacheKeyFactory } from "./utils/CacheKeyFactory";
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
