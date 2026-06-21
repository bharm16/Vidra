import { describe, expect, it, vi, type MockedFunction } from "vitest";
import { ModelIntelligenceService } from "../ModelIntelligenceService";
import type { ModelCapabilities } from "../types";
import type { LLMSpan } from "@llm/span-labeling/types";
import type { CanonicalPromptModelId } from "@shared/videoModels";
import type { ModelCapabilityRegistry } from "../services/ModelCapabilityRegistry";
import type { ModelScoringService } from "../services/ModelScoringService";
import type { RequirementsClassifier } from "../services/RequirementsClassifier";
import type { RecommendationExplainerService } from "../services/RecommendationExplainerService";
import type { AvailabilityGateService } from "../services/AvailabilityGateService";
import type { PromptSpanProvider } from "@llm/span-labeling/ports/PromptSpanProvider";

const VEO_3_CANONICAL: CanonicalPromptModelId = "veo-3";
const SORA_2_CANONICAL: CanonicalPromptModelId = "sora-2";

type MockScoringService = {
  scoreModel: MockedFunction<ModelScoringService["scoreModel"]>;
};

type MockAvailabilityGate = {
  filterModels: MockedFunction<AvailabilityGateService["filterModels"]>;
};

describe("ModelIntelligenceService", () => {
  describe("core behavior", () => {
    it("selects a cheaper close-scoring model as the efficient option", async () => {
      const dummyCapabilities: ModelCapabilities = {
        physics: 0.5,
        particleSystems: 0.5,
        fluidDynamics: 0.5,
        facialPerformance: 0.5,
        bodyLanguage: 0.5,
        characterActing: 0.5,
        cinematicLighting: 0.5,
        atmospherics: 0.5,
        environmentDetail: 0.5,
        architecturalAccuracy: 0.5,
        motionComplexity: 0.5,
        cameraControl: 0.5,
        stylization: 0.5,
        photorealism: 0.5,
        morphing: 0.5,
        transitions: 0.5,
        t2vBoost: 1,
        i2vBoost: 1,
        speedTier: "medium",
        costTier: "medium",
        qualityTier: "standard",
      };

      const scoringService: MockScoringService = {
        scoreModel: vi.fn<ModelScoringService["scoreModel"]>((modelId) => ({
          modelId,
          overallScore: modelId === VEO_3_CANONICAL ? 92 : 90,
          factorScores: [],
          strengths: [],
          weaknesses: [],
          warnings: [],
        })),
      };

      const registry = {
        getAllModels: () => [VEO_3_CANONICAL, SORA_2_CANONICAL],
        getCapabilities: () => dummyCapabilities,
      } as unknown as ModelCapabilityRegistry;

      const requirementsClassifier = {
        classify: async () => ({
          physics: {
            hasComplexPhysics: true,
            hasParticleSystems: false,
            hasFluidDynamics: false,
            hasSoftBodyPhysics: false,
            physicsComplexity: "complex",
          },
          character: {
            hasHumanCharacter: false,
            hasAnimalCharacter: false,
            hasMechanicalCharacter: false,
            requiresFacialPerformance: false,
            requiresBodyLanguage: false,
            requiresLipSync: false,
            emotionalIntensity: "none",
          },
          environment: {
            complexity: "simple",
            type: "abstract",
            hasArchitecture: false,
            hasNature: false,
            hasUrbanElements: false,
          },
          lighting: {
            requirements: "dramatic",
            complexity: "simple",
            hasPracticalLights: false,
            requiresAtmospherics: true,
          },
          style: {
            isPhotorealistic: false,
            isStylized: true,
            isAbstract: false,
            requiresCinematicLook: false,
            hasSpecificAesthetic: null,
          },
          motion: {
            cameraComplexity: "static",
            subjectComplexity: "static",
            hasMorphing: false,
            hasTransitions: false,
          },
          detectedCategories: [],
          confidenceScore: 0.7,
        }),
      } as unknown as RequirementsClassifier;

      const explainerService = {
        explainRecommendation: () => "Top match.",
        explainEfficientOption: () => "Efficient alternative.",
      } as unknown as RecommendationExplainerService;

      const availabilityGate: MockAvailabilityGate = {
        filterModels: vi
          .fn<AvailabilityGateService["filterModels"]>()
          .mockResolvedValue({
            availableModelIds: [VEO_3_CANONICAL, SORA_2_CANONICAL],
            unknownModelIds: [],
            filteredOut: [],
            snapshot: null,
          }),
      };

      const spans: LLMSpan[] = [
        { text: "dramatic lighting", role: "lighting.cinematic" },
      ];
      const promptSpanProvider: PromptSpanProvider = {
        label: vi.fn<PromptSpanProvider["label"]>().mockResolvedValue(spans),
        labelFull: vi.fn<PromptSpanProvider["labelFull"]>().mockResolvedValue({
          spans,
          meta: { version: "v1", notes: "ok" },
        }),
      };

      const service = new ModelIntelligenceService({
        promptSpanProvider,
        registry,
        scoringService: scoringService as unknown as ModelScoringService,
        requirementsClassifier,
        explainerService,
        availabilityGate:
          availabilityGate as unknown as AvailabilityGateService,
      });

      const recommendation = await service.getRecommendation("prompt", {
        spans,
        durationSeconds: 8,
      });

      expect(recommendation.recommended.modelId).toBe(VEO_3_CANONICAL);
      expect(recommendation.alsoConsider?.modelId).toBe(SORA_2_CANONICAL);
      expect(scoringService.scoreModel).toHaveBeenCalledTimes(2);
      expect(availabilityGate.filterModels).toHaveBeenCalledTimes(1);
    });
  });

  // O4: confidence ladder must be honest about low-signal inputs.
  // Previously, recommendation.confidence was derived purely from score-gap
  // arithmetic — it could claim "high" on a 5-word prompt with no spans.
  // Now: when requirements.confidenceScore < 0.4 (no spans / very weak
  // single-span signal), the "high" label is downgraded to "medium".
  describe("confidence ladder is capped on low-signal inputs", () => {
    const dummyCapabilities: ModelCapabilities = {
      physics: 0.5,
      particleSystems: 0.5,
      fluidDynamics: 0.5,
      facialPerformance: 0.5,
      bodyLanguage: 0.5,
      characterActing: 0.5,
      cinematicLighting: 0.5,
      atmospherics: 0.5,
      environmentDetail: 0.5,
      architecturalAccuracy: 0.5,
      motionComplexity: 0.5,
      cameraControl: 0.5,
      stylization: 0.5,
      photorealism: 0.5,
      morphing: 0.5,
      transitions: 0.5,
      t2vBoost: 1,
      i2vBoost: 1,
      speedTier: "medium",
      costTier: "medium",
      qualityTier: "standard",
    };

    /** Reduce per-test verbosity: only override what each test varies. */
    const createBaseRequirements = (
      overrides: { confidenceScore?: number } = {},
    ) => ({
      physics: {
        hasComplexPhysics: false,
        hasParticleSystems: false,
        hasFluidDynamics: false,
        hasSoftBodyPhysics: false,
        physicsComplexity: "none" as const,
      },
      character: {
        hasHumanCharacter: false,
        hasAnimalCharacter: false,
        hasMechanicalCharacter: false,
        requiresFacialPerformance: false,
        requiresBodyLanguage: false,
        requiresLipSync: false,
        emotionalIntensity: "none" as const,
      },
      environment: {
        complexity: "simple" as const,
        type: "abstract" as const,
        hasArchitecture: false,
        hasNature: false,
        hasUrbanElements: false,
      },
      lighting: {
        requirements: "natural" as const,
        complexity: "simple" as const,
        hasPracticalLights: false,
        requiresAtmospherics: false,
      },
      style: {
        isPhotorealistic: false,
        isStylized: false,
        isAbstract: false,
        requiresCinematicLook: false,
        hasSpecificAesthetic: null,
      },
      motion: {
        cameraComplexity: "static" as const,
        subjectComplexity: "static" as const,
        hasMorphing: false,
        hasTransitions: false,
      },
      detectedCategories: [],
      confidenceScore: overrides.confidenceScore ?? 0.7,
    });

    /** Score arrangement that would naturally produce "high" confidence:
     *  top=95, second=70 → diff=25 (>= 15) and top >= 80 → "high". */
    const highConfidenceScores: MockScoringService = {
      scoreModel: vi.fn<ModelScoringService["scoreModel"]>((modelId) => ({
        modelId,
        overallScore: modelId === VEO_3_CANONICAL ? 95 : 70,
        factorScores: [],
        strengths: [],
        weaknesses: [],
        warnings: [],
      })),
    };

    const buildService = (
      requirementsConfidence: number,
      scoringMock: MockScoringService = highConfidenceScores,
    ) => {
      const registry = {
        getAllModels: () => [VEO_3_CANONICAL, SORA_2_CANONICAL],
        getCapabilities: () => dummyCapabilities,
      } as unknown as ModelCapabilityRegistry;

      const requirementsClassifier = {
        classify: async () =>
          createBaseRequirements({ confidenceScore: requirementsConfidence }),
      } as unknown as RequirementsClassifier;

      const explainerService = {
        explainRecommendation: () => "Top match.",
        explainEfficientOption: () => "Efficient alternative.",
      } as unknown as RecommendationExplainerService;

      const availabilityGate: MockAvailabilityGate = {
        filterModels: vi
          .fn<AvailabilityGateService["filterModels"]>()
          .mockResolvedValue({
            availableModelIds: [VEO_3_CANONICAL, SORA_2_CANONICAL],
            unknownModelIds: [],
            filteredOut: [],
            snapshot: null,
          }),
      };

      const promptSpanProvider: PromptSpanProvider = {
        label: vi.fn<PromptSpanProvider["label"]>().mockResolvedValue([]),
        labelFull: vi.fn<PromptSpanProvider["labelFull"]>().mockResolvedValue({
          spans: [],
          meta: { version: "v1", notes: "ok" },
        }),
      };

      return new ModelIntelligenceService({
        promptSpanProvider,
        registry,
        scoringService: scoringMock as unknown as ModelScoringService,
        requirementsClassifier,
        explainerService,
        availabilityGate:
          availabilityGate as unknown as AvailabilityGateService,
      });
    };

    it("caps confidence at 'medium' when requirements.confidenceScore < 0.4 (no-spans path)", async () => {
      const service = buildService(0.3); // = floor when no spans

      const recommendation = await service.getRecommendation("short prompt", {
        durationSeconds: 8,
      });

      // Without the cap, the score arrangement (95 vs 70) yields "high".
      // With the cap, weak signal forces "medium".
      expect(recommendation.recommended.confidence).toBe("medium");
    });

    it("preserves 'high' confidence when requirements.confidenceScore >= 0.4 (good signal)", async () => {
      const service = buildService(0.8);

      const recommendation = await service.getRecommendation("rich prompt", {
        durationSeconds: 8,
      });

      expect(recommendation.recommended.confidence).toBe("high");
    });

    it("does not promote 'low' to anything else (the cap is a ceiling, not a setter)", async () => {
      // Score arrangement that yields naturally "low":
      // top=60, second=58 → diff=2 (< 8) and top < 70 → "low"
      const lowGapScores: MockScoringService = {
        scoreModel: vi.fn<ModelScoringService["scoreModel"]>((modelId) => ({
          modelId,
          overallScore: modelId === VEO_3_CANONICAL ? 60 : 58,
          factorScores: [],
          strengths: [],
          weaknesses: [],
          warnings: [],
        })),
      };
      const service = buildService(0.8, lowGapScores); // good signal, but low score gap

      const recommendation = await service.getRecommendation("ambiguous", {
        durationSeconds: 8,
      });

      expect(recommendation.recommended.confidence).toBe("low");
    });
  });

  // Runway is recommendation-only — no generation adapter exists for it in
  // VIDEO_MODELS. The pipeline must still: (a) resolve a non-null capability
  // entry, (b) include Runway in scored candidates when nothing else is
  // available, and (c) survive getRecommendation end-to-end without
  // throwing. This is the regression test for the consolidation that added
  // Runway to the canonical catalog.
  describe("Runway is recommendable end-to-end", () => {
    it("produces a non-null capability lookup for runway-gen45 via the production registry", async () => {
      const { ModelCapabilityRegistry } = await import(
        "../services/ModelCapabilityRegistry"
      );
      const registry = new ModelCapabilityRegistry();
      expect(registry.getCapabilities("runway-gen45")).not.toBeNull();
      expect(registry.getAllModels()).toContain("runway-gen45");
    });

    it("includes runway-gen45 in scored candidates when it is the only available model", async () => {
      const { ModelCapabilityRegistry } = await import(
        "../services/ModelCapabilityRegistry"
      );
      const { ModelScoringService } = await import(
        "../services/ModelScoringService"
      );
      const { RecommendationExplainerService } = await import(
        "../services/RecommendationExplainerService"
      );
      const registry = new ModelCapabilityRegistry();

      const availabilityGate: MockAvailabilityGate = {
        filterModels: vi
          .fn<AvailabilityGateService["filterModels"]>()
          .mockResolvedValue({
            // No models passed full gating; Runway falls into unknown
            // (recommendation-only). Service falls back to scoring unknowns.
            availableModelIds: [],
            unknownModelIds: ["runway-gen45"],
            filteredOut: [
              { modelId: "runway-gen45", reason: "no_generation_provider" },
            ],
            snapshot: null,
          }),
      };

      const promptSpanProvider: PromptSpanProvider = {
        label: vi.fn<PromptSpanProvider["label"]>().mockResolvedValue([]),
        labelFull: vi.fn<PromptSpanProvider["labelFull"]>().mockResolvedValue({
          spans: [],
          meta: { version: "v1", notes: "ok" },
        }),
      };

      const service = new ModelIntelligenceService({
        promptSpanProvider,
        availabilityGate:
          availabilityGate as unknown as AvailabilityGateService,
        registry,
        scoringService: new ModelScoringService(),
        explainerService: new RecommendationExplainerService(),
      });

      const recommendation = await service.getRecommendation(
        "a stylized music video with surreal artistic effects",
        { mode: "t2v", durationSeconds: 8 },
      );

      // Runway must appear in scored recommendations so the UI can surface it.
      const scoredIds = recommendation.recommendations.map(
        (score) => score.modelId,
      );
      expect(scoredIds).toContain("runway-gen45");

      // The recommended model must be a CanonicalPromptModelId — Runway is
      // the only candidate here.
      expect(recommendation.recommended.modelId).toBe("runway-gen45");
    });
  });
});
