import { logger } from "@infrastructure/Logger";
import { generateId } from "@utils/uid";
/** Narrow metrics interface — avoids importing the concrete MetricsService class. */
interface ModelIntelligenceMetrics {
  recordModelRecommendationRequest(
    mode: string,
    availabilityState: string,
  ): void;
}
import { getVideoCost } from "@config/modelCosts";
import type { CanonicalPromptModelId } from "@shared/videoModels";
import { ModelCapabilityRegistry } from "./services/ModelCapabilityRegistry";
import { ModelScoringService } from "./services/ModelScoringService";
import type { RequirementsClassifier } from "./services/RequirementsClassifier";
import { deriveRequirementsFromRoles } from "./services/requirementsMapper";
import { RecommendationExplainerService } from "./services/RecommendationExplainerService";
import type { AvailabilityGateService } from "./services/AvailabilityGateService";
import type { PromptSpanProvider } from "@llm/span-labeling/ports/PromptSpanProvider";
import type {
  ModelRecommendation,
  PromptRequirements,
  ModelScore,
  PromptSpan,
} from "./types";

interface ModelIntelligenceDependencies {
  promptSpanProvider: PromptSpanProvider;
  availabilityGate: AvailabilityGateService;
  metricsService?: ModelIntelligenceMetrics;
  requirementsClassifier?: RequirementsClassifier;
  registry?: ModelCapabilityRegistry;
  scoringService?: ModelScoringService;
  explainerService?: RecommendationExplainerService;
}

interface RecommendationOptions {
  mode?: "t2v" | "i2v";
  spans?: PromptSpan[];
  durationSeconds?: number;
  userId?: string | null;
}

const log = logger.child({ service: "ModelIntelligenceService" });

export class ModelIntelligenceService {
  private readonly requirementsClassifier: RequirementsClassifier;
  private readonly registry: ModelCapabilityRegistry;
  private readonly scoringService: ModelScoringService;
  private readonly explainerService: RecommendationExplainerService;
  private readonly availabilityGate: AvailabilityGateService;
  private readonly metrics: ModelIntelligenceMetrics | undefined;

  constructor(private readonly deps: ModelIntelligenceDependencies) {
    this.metrics = deps.metricsService;
    // Default to role-only derivation (no LLM) when no classifier is injected.
    // DI supplies the LLM-backed AIServiceRequirementsClassifier in production.
    this.requirementsClassifier = deps.requirementsClassifier ?? {
      classify: async (_prompt, spans) => deriveRequirementsFromRoles(spans),
    };
    this.registry = deps.registry ?? new ModelCapabilityRegistry();
    this.scoringService = deps.scoringService ?? new ModelScoringService();
    this.explainerService =
      deps.explainerService ?? new RecommendationExplainerService();
    this.availabilityGate = deps.availabilityGate;
  }

  async getRecommendation(
    prompt: string,
    options: RecommendationOptions = {},
  ): Promise<ModelRecommendation> {
    const startedAt = Date.now();
    const mode = options.mode ?? "t2v";
    const durationSeconds = options.durationSeconds ?? 8;

    let spans: PromptSpan[] = Array.isArray(options.spans) ? options.spans : [];

    if (!spans.length) {
      try {
        spans = await this.deps.promptSpanProvider.label(prompt);
      } catch (error) {
        log.warn("Span labeling failed for model recommendation", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const requirements = await this.requirementsClassifier.classify(
      prompt,
      spans,
    );
    const modelIds = this.registry.getAllModels();

    const availabilityOptions = {
      mode,
      durationSeconds,
      ...(options.userId !== undefined ? { userId: options.userId } : {}),
    };
    const availability = await this.availabilityGate.filterModels(
      modelIds,
      availabilityOptions,
    );

    const availabilityState =
      availability.availableModelIds.length > 0
        ? "available"
        : availability.unknownModelIds.length > 0
          ? "unknown"
          : "unavailable";

    this.metrics?.recordModelRecommendationRequest(mode, availabilityState);

    const candidateIds =
      availability.availableModelIds.length > 0
        ? availability.availableModelIds
        : availability.unknownModelIds;

    const recommendations = this.scoreModels(candidateIds, requirements, mode);
    const recommendedScore = recommendations[0];
    const recommended = this.determineRecommendation(
      recommendations,
      requirements,
      availabilityState,
    );
    const alsoConsider = this.determineEfficientOption(
      recommendations,
      recommendedScore,
      durationSeconds,
    );
    const comparison = this.shouldSuggestComparison(recommendations);

    if (!recommendedScore) {
      log.warn("No model scores available for recommendation", {
        promptLength: prompt.length,
        mode,
      });
    }

    log.info("Model recommendation computed", {
      durationMs: Date.now() - startedAt,
      promptLength: prompt.length,
      mode,
      availableCount: availability.availableModelIds.length,
      unknownCount: availability.unknownModelIds.length,
      recommendationCount: recommendations.length,
    });

    return {
      promptId: this.generatePromptId(),
      prompt,
      requirements,
      recommendations,
      recommended,
      suggestComparison: comparison.suggest,
      ...(alsoConsider ? { alsoConsider } : {}),
      ...(comparison.models ? { comparisonModels: comparison.models } : {}),
      ...(availability.filteredOut.length > 0
        ? { filteredOut: availability.filteredOut }
        : {}),
      computedAt: new Date(),
    };
  }

  private scoreModels(
    modelIds: CanonicalPromptModelId[],
    requirements: PromptRequirements,
    mode: "t2v" | "i2v",
  ): ModelScore[] {
    return modelIds
      .map((modelId) => {
        const capabilities = this.registry.getCapabilities(modelId);
        if (!capabilities) return null;
        return this.scoringService.scoreModel(
          modelId,
          capabilities,
          requirements,
          mode,
        );
      })
      .filter((score): score is ModelScore => Boolean(score))
      .sort((a, b) => b.overallScore - a.overallScore);
  }

  private determineRecommendation(
    scores: ModelScore[],
    requirements: PromptRequirements,
    availabilityState: "available" | "unknown" | "unavailable",
  ): ModelRecommendation["recommended"] {
    const topScore = scores[0];
    const secondScore = scores[1];

    if (!topScore) {
      const fallbackModel: CanonicalPromptModelId =
        this.registry.getAllModels()[0] ?? "wan-2.2";
      const reasoning =
        availabilityState === "unavailable"
          ? "No available models based on current credentials or entitlements."
          : "No scoring data available; defaulting to baseline model.";
      return {
        modelId: fallbackModel,
        confidence: "low",
        reasoning,
      };
    }

    const scoreDiff = topScore.overallScore - (secondScore?.overallScore ?? 0);
    let confidence: "high" | "medium" | "low";

    if (scoreDiff >= 15 && topScore.overallScore >= 80) {
      confidence = "high";
    } else if (scoreDiff >= 8 || topScore.overallScore >= 70) {
      confidence = "medium";
    } else {
      confidence = "low";
    }

    // Honesty cap: requirements.confidenceScore reflects how confident we are
    // in the *prompt-side feature extraction* (no spans / very weak signal
    // produces ~0.3). When that signal is poor, claiming "high" model-fit
    // confidence is a UX lie — the score arithmetic can produce a clean
    // ranking even on guesses. Cap "high" → "medium"; "medium" and "low"
    // are already honest about uncertainty.
    if (confidence === "high" && requirements.confidenceScore < 0.4) {
      confidence = "medium";
    }

    const reasoning = this.explainerService.explainRecommendation(
      topScore,
      requirements,
    );

    return {
      modelId: topScore.modelId,
      confidence,
      reasoning,
    };
  }

  private determineEfficientOption(
    scores: ModelScore[],
    recommendedScore: ModelScore | undefined,
    durationSeconds: number,
  ): ModelRecommendation["alsoConsider"] | undefined {
    if (!recommendedScore || scores.length < 2) return undefined;

    const highScoreCutoff = 90;
    if (recommendedScore.overallScore < highScoreCutoff) return undefined;

    const threshold = 8;
    const candidates = scores.filter(
      (score) =>
        score.overallScore >= highScoreCutoff &&
        Math.abs(recommendedScore.overallScore - score.overallScore) <=
          threshold,
    );

    if (candidates.length < 2) return undefined;

    const bestValue = candidates.reduce((best, current) => {
      const bestCost = getVideoCost(best.modelId, durationSeconds);
      const currentCost = getVideoCost(current.modelId, durationSeconds);

      if (currentCost < bestCost) return current;
      if (currentCost > bestCost) return best;

      const bestSpeed = this.getSpeedRank(best.modelId);
      const currentSpeed = this.getSpeedRank(current.modelId);

      if (currentSpeed > bestSpeed) return current;
      if (currentSpeed < bestSpeed) return best;

      return current.overallScore > best.overallScore ? current : best;
    }, recommendedScore);

    if (bestValue.modelId === recommendedScore.modelId) {
      return undefined;
    }

    return {
      modelId: bestValue.modelId,
      reasoning: this.explainerService.explainEfficientOption(bestValue),
    };
  }

  private getSpeedRank(modelId: CanonicalPromptModelId): number {
    const capability = this.registry.getCapabilities(modelId);
    if (!capability) return 0;

    switch (capability.speedTier) {
      case "fast":
        return 3;
      case "medium":
        return 2;
      case "slow":
        return 1;
      default:
        return 0;
    }
  }

  private shouldSuggestComparison(scores: ModelScore[]): {
    suggest: boolean;
    models?: [CanonicalPromptModelId, CanonicalPromptModelId];
  } {
    if (scores.length < 2) return { suggest: false };

    const first = scores[0]!;
    const second = scores[1]!;
    const scoreDiff = first.overallScore - second.overallScore;

    if (scoreDiff < 12 && second.overallScore >= 65) {
      return { suggest: true, models: [first.modelId, second.modelId] };
    }

    return { suggest: false };
  }

  private generatePromptId(): string {
    return generateId("prompt");
  }
}
