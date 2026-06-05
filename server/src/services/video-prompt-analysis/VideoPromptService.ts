import { logger } from "@infrastructure/Logger";
import { VideoPromptDetectionService } from "./services/detection/VideoPromptDetectionService";
import { PhraseRoleAnalysisService } from "./services/analysis/PhraseRoleAnalysisService";
import { ConstraintGenerationService } from "./services/analysis/ConstraintGenerationService";
import { CategoryGuidanceService } from "./services/guidance/CategoryGuidanceService";
import { ModelDetectionService } from "./services/detection/ModelDetectionService";
import { SectionDetectionService } from "./services/detection/SectionDetectionService";
import { countWords } from "./utils/textHelpers";
import { resolvePromptModelId } from "@config/videoModelRegistry";
import { createDefaultStrategyRegistry, StrategyRegistry } from "./strategies";
import type {
  ConstraintConfig,
  ConstraintDetails,
  ConstraintOptions,
  GuidanceSpan,
  EditHistoryEntry,
} from "./types";
import type { VideoPromptLlmGateway } from "./services/llm/VideoPromptLlmGateway";
import type {
  PromptOptimizationResult,
  PromptContext,
  PhaseResult,
} from "./strategies/types";

export interface VideoPromptServiceDeps {
  detector?: VideoPromptDetectionService;
  phraseRoleAnalyzer?: PhraseRoleAnalysisService;
  constraintGenerator?: ConstraintGenerationService;
  categoryGuidance?: CategoryGuidanceService;
  modelDetector?: ModelDetectionService;
  sectionDetector?: SectionDetectionService;
  strategyRegistry?: StrategyRegistry;
  videoPromptLlmGateway?: VideoPromptLlmGateway | null;
}

/**
 * VideoPromptService - Main Orchestrator
 *
 * Responsible for coordinating video prompt detection, analysis, and constraint management.
 * Delegates to specialized services for each concern.
 *
 * Single Responsibility: Orchestrate video prompt logic
 */
export class VideoPromptService {
  private readonly detector: VideoPromptDetectionService;
  private readonly phraseRoleAnalyzer: PhraseRoleAnalysisService;
  private readonly constraintGenerator: ConstraintGenerationService;
  private readonly categoryGuidance: CategoryGuidanceService;
  private readonly modelDetector: ModelDetectionService;
  private readonly sectionDetector: SectionDetectionService;
  private readonly strategyRegistry: StrategyRegistry;
  private readonly log = logger.child({ service: "VideoPromptService" });

  /** Pipeline version for metadata tracking */
  private static readonly PIPELINE_VERSION = "1.0.0";
  private static readonly MAX_CONCURRENT_MODEL_OPTIMIZATIONS = 3;

  constructor(deps: VideoPromptServiceDeps = {}) {
    this.detector = deps.detector ?? new VideoPromptDetectionService();
    this.phraseRoleAnalyzer =
      deps.phraseRoleAnalyzer ?? new PhraseRoleAnalysisService();
    this.constraintGenerator =
      deps.constraintGenerator ?? new ConstraintGenerationService();
    this.categoryGuidance =
      deps.categoryGuidance ?? new CategoryGuidanceService();
    this.modelDetector = deps.modelDetector ?? new ModelDetectionService();
    this.sectionDetector =
      deps.sectionDetector ?? new SectionDetectionService();

    this.strategyRegistry =
      deps.strategyRegistry ??
      createDefaultStrategyRegistry({
        videoPromptLlmGateway: deps.videoPromptLlmGateway ?? null,
      });
  }

  /**
   * Count words in a string
   */
  countWords(text: string | null | undefined): number {
    return countWords(text);
  }

  /**
   * Check if this is a video prompt
   */
  isVideoPrompt(fullPrompt: string | null | undefined): boolean {
    const operation = "isVideoPrompt";

    this.log.debug("Checking if prompt is video prompt", {
      operation,
      promptLength: fullPrompt?.length || 0,
    });

    const result = this.detector.isVideoPrompt(fullPrompt);

    this.log.debug("Video prompt detection complete", {
      operation,
      isVideoPrompt: result,
    });

    return result;
  }

  /**
   * Detect the likely role of a highlighted phrase within a video prompt
   */
  detectVideoPhraseRole(
    highlightedText: string | null | undefined,
    contextBefore: string | null | undefined,
    contextAfter: string | null | undefined,
    explicitCategory: string | null | undefined,
  ): string {
    return this.phraseRoleAnalyzer.detectVideoPhraseRole(
      highlightedText,
      contextBefore,
      contextAfter,
      explicitCategory,
    );
  }

  /**
   * Resolve video replacement constraints based on highlight context
   */
  getVideoReplacementConstraints(
    details: ConstraintDetails = {},
    options: ConstraintOptions = {},
  ): ConstraintConfig {
    return this.constraintGenerator.getVideoReplacementConstraints(
      details,
      options,
    );
  }

  /**
   * Get category-specific focus guidance for better suggestions
   * NEW: Now context-aware with full prompt, spans, and edit history
   */
  getCategoryFocusGuidance(
    phraseRole: string | null | undefined,
    categoryHint: string | null | undefined,
    fullContext: string = "",
    allSpans: GuidanceSpan[] = [],
    editHistory: EditHistoryEntry[] = [],
  ): string[] | null {
    return this.categoryGuidance.getCategoryFocusGuidance(
      phraseRole,
      categoryHint,
      fullContext,
      allSpans,
      editHistory,
    );
  }

  /**
   * Detect which AI video model is being targeted
   */
  detectTargetModel(fullPrompt: string | null | undefined): string | null {
    const detected = this.modelDetector.detectTargetModel(fullPrompt);
    return detected ? resolvePromptModelId(detected) : null;
  }

  /**
   * Detect which section of the prompt template is being edited
   */
  detectPromptSection(
    highlightedText: string | null | undefined,
    fullPrompt: string | null | undefined,
    contextBefore: string = "",
  ): string {
    return this.sectionDetector.detectSection(
      highlightedText,
      fullPrompt,
      contextBefore,
    );
  }

  /**
   * Optimize a prompt for a specific video model
   * Runs the full 3-phase pipeline: normalize → transform → augment
   *
   * @param prompt - The user's input prompt
   * @param modelId - Optional model ID; if not provided, will attempt to detect from prompt
   * @param context - Optional context for optimization
   * @returns Optimized prompt result, or original prompt wrapped in result on failure
   *
   * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
   */
  async optimizeForModel(
    prompt: string,
    modelId?: string | null,
    context?: PromptContext,
  ): Promise<PromptOptimizationResult> {
    const operation = "optimizeForModel";
    const startTime = Date.now();

    // Detect model if not provided
    let detectedModelId =
      modelId ?? this.modelDetector.detectTargetModel(prompt);
    detectedModelId = detectedModelId
      ? resolvePromptModelId(detectedModelId)
      : null;

    this.log.info("Starting prompt optimization", {
      operation,
      modelId: detectedModelId,
      promptLength: prompt.length,
      hasContext: !!context,
    });

    // If no model detected, return original prompt without optimization (Requirement 10.3)
    if (!detectedModelId) {
      this.log.info("No model detected, returning original prompt", {
        operation,
      });
      return this.createOriginalResult(prompt, "unknown");
    }

    // Get strategy for the model
    const strategy = this.strategyRegistry.get(detectedModelId);
    if (!strategy) {
      this.log.warn("No strategy found for model", {
        operation,
        modelId: detectedModelId,
      });
      return this.createOriginalResult(prompt, detectedModelId);
    }

    const phases: PhaseResult[] = [];
    const warnings: string[] = [];
    const tokensStripped: string[] = [];
    const triggersInjected: string[] = [];

    try {
      // Phase 0: Validate (optional, may add warnings)
      const validateStart = Date.now();
      try {
        await strategy.validate(prompt, context);
        phases.push({
          phase: "normalize", // Validation is part of normalize phase
          durationMs: Date.now() - validateStart,
          changes: ["Validation passed"],
        });
      } catch (validationError) {
        const errorMessage =
          validationError instanceof Error
            ? validationError.message
            : String(validationError);
        warnings.push(`Validation warning: ${errorMessage}`);
        this.log.warn("Validation warning", {
          operation,
          modelId: detectedModelId,
          error: errorMessage,
        });
      }

      // Phase 1: Normalize
      const normalizeStart = Date.now();
      const normalizedText = strategy.normalize(prompt, context);
      const normalizeDuration = Date.now() - normalizeStart;

      this.log.debug("Normalize phase complete", {
        operation,
        modelId: detectedModelId,
        phase: "normalize",
        durationMs: normalizeDuration,
        inputLength: prompt.length,
        outputLength: normalizedText.length,
      });

      phases.push({
        phase: "normalize",
        durationMs: normalizeDuration,
        changes: [
          `Normalized text (${prompt.length} → ${normalizedText.length} chars)`,
        ],
      });

      // Phase 2: Transform
      const transformStart = Date.now();
      const transformResult = await strategy.transform(normalizedText, context);
      const transformDuration = Date.now() - transformStart;

      this.log.debug("Transform phase complete", {
        operation,
        modelId: detectedModelId,
        phase: "transform",
        durationMs: transformDuration,
      });

      phases.push({
        phase: "transform",
        durationMs: transformDuration,
        changes: transformResult.metadata?.phases?.find(
          (p) => p.phase === "transform",
        )?.changes ?? ["Transformed prompt"],
      });

      // Collect tokens stripped from transform metadata
      if (transformResult.metadata?.tokensStripped) {
        tokensStripped.push(...transformResult.metadata.tokensStripped);
      }

      // Phase 3: Augment
      const augmentStart = Date.now();
      const augmentResult = strategy.augment(transformResult, context);
      const augmentDuration = Date.now() - augmentStart;

      this.log.debug("Augment phase complete", {
        operation,
        modelId: detectedModelId,
        phase: "augment",
        durationMs: augmentDuration,
      });

      phases.push({
        phase: "augment",
        durationMs: augmentDuration,
        changes: augmentResult.metadata?.phases?.find(
          (p) => p.phase === "augment",
        )?.changes ?? ["Augmented prompt"],
      });

      // Collect triggers injected from augment metadata
      if (augmentResult.metadata?.triggersInjected) {
        triggersInjected.push(...augmentResult.metadata.triggersInjected);
      }

      // Collect warnings from result metadata
      if (augmentResult.metadata?.warnings) {
        warnings.push(...augmentResult.metadata.warnings);
      }

      const totalDuration = Date.now() - startTime;

      this.log.info("Prompt optimization complete", {
        operation,
        modelId: detectedModelId,
        totalDurationMs: totalDuration,
        phasesCompleted: phases.length,
        warningsCount: warnings.length,
        tokensStrippedCount: tokensStripped.length,
        triggersInjectedCount: triggersInjected.length,
      });

      // Return final result with consolidated metadata
      const result: PromptOptimizationResult = {
        prompt: augmentResult.prompt,
        metadata: {
          modelId: detectedModelId,
          pipelineVersion: VideoPromptService.PIPELINE_VERSION,
          phases,
          warnings,
          tokensStripped,
          triggersInjected,
        },
      };

      // Only include negativePrompt if it's defined
      if (augmentResult.negativePrompt !== undefined) {
        result.negativePrompt = augmentResult.negativePrompt;
      }

      return result;
    } catch (error) {
      // Log error and return original prompt (Requirement 10.5)
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const totalDuration = Date.now() - startTime;
      const errorObj = error instanceof Error ? error : new Error(errorMessage);

      this.log.error(
        "Prompt optimization failed, returning original",
        errorObj,
        {
          operation,
          modelId: detectedModelId,
          totalDurationMs: totalDuration,
        },
      );

      return this.createOriginalResult(prompt, detectedModelId, [
        `Optimization failed: ${errorMessage}`,
      ]);
    }
  }

  /**
   * Translate a prompt to optimized versions for all supported video models
   * Executes strategies in parallel with failure isolation
   *
   * @param prompt - The user's input prompt
   * @param context - Optional context for optimization
   * @returns Map of model IDs to optimization results (includes error indicators on failure)
   *
   * Requirements: 11.1, 11.2, 11.3, 11.4
   */
  async translateToAllModels(
    prompt: string,
    context?: PromptContext,
  ): Promise<Map<string, PromptOptimizationResult>> {
    const operation = "translateToAllModels";
    const startTime = Date.now();
    const results = new Map<string, PromptOptimizationResult>();

    const allStrategies = this.strategyRegistry.getAll();
    const modelIds = allStrategies.map((s) => s.modelId);

    const maxConcurrent = Math.min(
      VideoPromptService.MAX_CONCURRENT_MODEL_OPTIMIZATIONS,
      Math.max(1, allStrategies.length),
    );

    this.log.info("Starting cross-model translation", {
      operation,
      promptLength: prompt.length,
      modelCount: modelIds.length,
      models: modelIds,
      maxConcurrent,
    });

    const runStrategy = async (strategy: (typeof allStrategies)[number]) => {
      const modelStartTime = Date.now();
      try {
        const result = await this.optimizeForModel(
          prompt,
          strategy.modelId,
          context,
        );

        this.log.debug("Model optimization succeeded", {
          operation,
          modelId: strategy.modelId,
          durationMs: Date.now() - modelStartTime,
        });

        return { modelId: strategy.modelId, result, success: true };
      } catch (error) {
        // Failure isolation: continue processing other models (Requirement 11.4)
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        this.log.warn("Model optimization failed, continuing with others", {
          operation,
          modelId: strategy.modelId,
          errorMessage,
          durationMs: Date.now() - modelStartTime,
        });

        // Return result with error indicator
        const errorResult: PromptOptimizationResult = {
          prompt,
          metadata: {
            modelId: strategy.modelId,
            pipelineVersion: VideoPromptService.PIPELINE_VERSION,
            phases: [],
            warnings: [`Optimization failed: ${errorMessage}`],
            tokensStripped: [],
            triggersInjected: [],
          },
        };

        return {
          modelId: strategy.modelId,
          result: errorResult,
          success: false,
        };
      }
    };

    const optimizationResults: Array<{
      modelId: string;
      result: PromptOptimizationResult;
      success: boolean;
    }> = [];

    let nextIndex = 0;
    const worker = async (): Promise<void> => {
      while (true) {
        const index = nextIndex++;
        if (index >= allStrategies.length) break;
        const strategy = allStrategies[index];
        if (!strategy) {
          continue;
        }
        optimizationResults[index] = await runStrategy(strategy);
      }
    };

    const workers = Array.from({ length: maxConcurrent }, () => worker());
    await Promise.all(workers);

    // Build results map
    let successCount = 0;
    let failureCount = 0;

    for (const { modelId, result, success } of optimizationResults) {
      results.set(modelId, result);
      if (success) {
        successCount++;
      } else {
        failureCount++;
      }
    }

    const totalDuration = Date.now() - startTime;

    this.log.info("Cross-model translation complete", {
      operation,
      totalDurationMs: totalDuration,
      totalModels: modelIds.length,
      successCount,
      failureCount,
    });

    return results;
  }

  /**
   * Get all supported model IDs
   * @returns Array of model IDs that have registered strategies
   */
  getSupportedModelIds(): string[] {
    return this.strategyRegistry.getModelIds();
  }

  getModelConstraints(modelId: string) {
    return this.strategyRegistry.getModelConstraints(modelId);
  }

  /**
   * Check if a model is supported
   * @param modelId - The model ID to check
   * @returns true if a strategy exists for the model
   */
  isModelSupported(modelId: string): boolean {
    return this.strategyRegistry.has(modelId);
  }

  /**
   * Create a result containing the original prompt (used when optimization is skipped or fails)
   */
  private createOriginalResult(
    prompt: string,
    modelId: string,
    warnings: string[] = [],
  ): PromptOptimizationResult {
    return {
      prompt,
      metadata: {
        modelId,
        pipelineVersion: VideoPromptService.PIPELINE_VERSION,
        phases: [],
        warnings,
        tokensStripped: [],
        triggersInjected: [],
      },
    };
  }
}
