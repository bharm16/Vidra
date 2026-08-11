import { logger } from "@infrastructure/Logger";
import type { ILogger } from "@interfaces/ILogger";
import OptimizationConfig from "@config/OptimizationConfig";

import { VideoStrategy } from "./strategies/VideoStrategy";
import { ShotInterpreterService } from "./services/ShotInterpreterService";
import { OptimizationCacheService } from "./services/OptimizationCacheService";
import { VideoPromptCompilationService } from "./services/VideoPromptCompilationService";
import { TemplateService } from "./services/TemplateService";
import { IntentLockService } from "./services/IntentLockService";
import { PromptLintGateService } from "./services/PromptLintGateService";
import { finishPrompt } from "./services/finishPrompt";
import type { ImageObservationService } from "@services/image-observation";
import type { VideoPromptService } from "../video-prompt-analysis/VideoPromptService";
import type { CacheService } from "@services/cache/CacheService";
import type { OptimizeTrace } from "@services/observability/OptimizeTelemetryService";
import type {
  AIService,
  CompileContext,
  CompilePromptResponse,
  OptimizationMode,
  OptimizationRequest,
  OptimizationResponse,
} from "./types";
import { runOptimizeFlow } from "./workflows/optimizeFlow";
import { runConstitutionalReviewFlow } from "./workflows/constitutionalReview";

const makeNoopTrace = (): OptimizeTrace =>
  ({
    recordStage: () => {},
    recordLlmCall: () => {},
    recordCacheHit: () => {},
    recordError: () => {},
    complete: () => {},
  }) as unknown as OptimizeTrace;

/**
 * Refactored Prompt Optimization Service - Orchestrator Pattern
 */
export class PromptOptimizationService {
  private readonly ai: AIService;
  private readonly videoStrategy: VideoStrategy;
  private readonly shotInterpreter: ShotInterpreterService;
  private readonly optimizationCache: OptimizationCacheService;
  private readonly compilationService: VideoPromptCompilationService | null;
  private readonly imageObservation: ImageObservationService;
  private readonly intentLock: IntentLockService;
  private readonly promptLint: PromptLintGateService;
  private readonly log: ILogger;

  constructor(
    aiService: AIService,
    cacheService: CacheService,
    videoPromptService: VideoPromptService | null = null,
    imageObservationService: ImageObservationService,
    templateService?: TemplateService,
    shotPlanCacheConfig?: { cacheTtlMs: number; cacheMax: number },
  ) {
    this.ai = aiService;
    this.log = logger.child({ service: "PromptOptimizationService" });

    const resolvedTemplateService = templateService ?? new TemplateService();
    this.videoStrategy = new VideoStrategy(aiService, resolvedTemplateService);
    this.shotInterpreter = new ShotInterpreterService(
      aiService,
      shotPlanCacheConfig,
    );
    this.optimizationCache = new OptimizationCacheService(cacheService);
    this.compilationService = videoPromptService
      ? new VideoPromptCompilationService(
          videoPromptService,
          this.optimizationCache,
        )
      : null;
    this.imageObservation = imageObservationService;
    this.intentLock = new IntentLockService();
    this.promptLint = new PromptLintGateService(
      videoPromptService
        ? {
            getModelConstraints: (modelId) =>
              videoPromptService.getModelConstraints(modelId),
          }
        : undefined,
    );

    this.log.info(
      "PromptOptimizationService initialized with refactored architecture",
      {
        operation: "constructor",
        availableClients: this.ai.getAvailableClients?.(),
        strategy: this.videoStrategy.name,
      },
    );
  }

  async optimize(request: OptimizationRequest): Promise<OptimizationResponse> {
    if (request.startImage) {
      this.log.warn(
        "Received startImage on /api/optimize; ignoring — I2V optimization is no longer supported",
        { operation: "optimize.i2vIgnored" },
      );
    }

    const telemetry = request.trace ?? makeNoopTrace();

    return runOptimizeFlow({
      request,
      log: this.log,
      optimizationCache: this.optimizationCache,
      shotInterpreter: this.shotInterpreter,
      strategy: this.videoStrategy,
      compilationService: this.compilationService,
      applyConstitutionalAI: (nextPrompt, mode, signal) =>
        this.applyConstitutionalAI(nextPrompt, mode, signal),
      logOptimizationMetrics: (originalPrompt, optimizedPrompt, mode) =>
        this.logOptimizationMetrics(originalPrompt, optimizedPrompt, mode),
      intentLock: this.intentLock,
      promptLint: this.promptLint,
      telemetry,
    });
  }

  /**
   * Compile a pre-optimized prompt for a specific video model (Stage 3 only).
   *
   * Shares `finishPrompt` with the optimize flow so both entrypoints apply the
   * same intent policy and the same lint pass; they used to open-code it twice.
   */
  async compilePrompt({
    prompt,
    artifactKey,
    targetModel,
    context,
  }: {
    prompt?: string;
    artifactKey?: string;
    targetModel: string;
    context?: CompileContext | null;
  }): Promise<CompilePromptResponse> {
    if (!this.compilationService) {
      throw new Error("Video prompt service unavailable");
    }

    const normalizedPrompt = typeof prompt === "string" ? prompt : "";
    const compilation = await this.compilationService.compile({
      operation: "compilePrompt",
      targetModel,
      source: artifactKey
        ? { kind: "artifactKey", artifactKey }
        : { kind: "prompt", prompt: normalizedPrompt },
      context: context ?? null,
      fallbackPrompt: normalizedPrompt,
      ...(artifactKey ? { artifactKey } : {}),
    });

    const resolvedTargetModel =
      compilation.compilation.compiledFor ?? targetModel;
    const finished = finishPrompt({
      prompt: compilation.prompt,
      originalPrompt: this.resolveOriginalPromptForCompile(
        context,
        normalizedPrompt,
      ),
      shotPlan: null,
      phase: "post-compile",
      modelId: resolvedTargetModel,
      intentLock: this.intentLock,
      promptLint: this.promptLint,
      compilation: compilation.compilation,
    });

    return {
      compiledPrompt: finished.prompt,
      metadata: compilation.metadata,
      targetModel: resolvedTargetModel,
      ...(compilation.artifactKey
        ? { artifactKey: compilation.artifactKey }
        : {}),
      // The intent verdict rides on the compilation state, which is already a
      // typed wire field — no second copy.
      compilation: finished.compilation ?? compilation.compilation,
    };
  }

  /**
   * Apply constitutional AI review to optimized prompt
   */
  private async applyConstitutionalAI(
    prompt: string,
    mode: OptimizationMode,
    signal?: AbortSignal,
  ): Promise<string> {
    return runConstitutionalReviewFlow({
      prompt,
      mode,
      signal,
      log: this.log,
      ai: this.ai,
    });
  }

  /**
   * Log optimization metrics
   */
  private logOptimizationMetrics(
    originalPrompt: string,
    optimizedPrompt: string,
    mode: OptimizationMode,
  ): void {
    logger.info("Optimization metrics", {
      mode,
      originalLength: originalPrompt.length,
      optimizedLength: optimizedPrompt.length,
      lengthChange: optimizedPrompt.length - originalPrompt.length,
      lengthChangePercent: (
        (optimizedPrompt.length / originalPrompt.length - 1) *
        100
      ).toFixed(1),
    });
  }

  private resolveOriginalPromptForCompile(
    context: CompileContext | null | undefined,
    fallbackPrompt: string,
  ): string {
    if (!context || typeof context !== "object") {
      return fallbackPrompt;
    }

    const contextRecord = context as Record<string, unknown>;
    const originalPromptCandidate = contextRecord.originalPrompt;
    if (
      typeof originalPromptCandidate === "string" &&
      originalPromptCandidate.trim().length > 0
    ) {
      return originalPromptCandidate.trim();
    }

    const originalUserPromptCandidate = contextRecord.originalUserPrompt;
    if (
      typeof originalUserPromptCandidate === "string" &&
      originalUserPromptCandidate.trim().length > 0
    ) {
      return originalUserPromptCandidate.trim();
    }

    return fallbackPrompt;
  }
}

export default PromptOptimizationService;
