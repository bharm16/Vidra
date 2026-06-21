import {
  afterEach,
  describe,
  expect,
  it,
  vi,
  type MockedFunction,
} from "vitest";
import { ModelIntelligenceService } from "../ModelIntelligenceService";
import { ModelCapabilityRegistry } from "../services/ModelCapabilityRegistry";
import { ModelScoringService } from "../services/ModelScoringService";
import { RecommendationExplainerService } from "../services/RecommendationExplainerService";
import { AvailabilityGateService } from "../services/AvailabilityGateService";
import type { PromptSpanProvider } from "@llm/span-labeling/ports/PromptSpanProvider";
import { SAMPLE_PROMPT, SAMPLE_SPANS } from "./fixtures/testPrompts";
import type { VideoGenerationService } from "@services/video-generation/VideoGenerationService";
import type {
  VideoAvailabilitySnapshot,
  VideoAvailabilitySnapshotModel,
} from "@services/video-generation/types";
import type { LLMSpan } from "@llm/span-labeling/types";

describe("ModelIntelligenceService (integration)", () => {
  it("generates recommendations using labeled spans", async () => {
    const spans: LLMSpan[] = SAMPLE_SPANS.map((span) => ({
      ...span,
      role: span.role ?? "subject",
    }));
    const promptSpanProvider: PromptSpanProvider = {
      label: vi.fn<PromptSpanProvider["label"]>().mockResolvedValue(spans),
      labelFull: vi.fn<PromptSpanProvider["labelFull"]>().mockResolvedValue({
        spans,
        meta: { version: "v1", notes: "ok" },
      }),
    };

    const registry = new ModelCapabilityRegistry();
    const modelIds = registry.getAllModels();
    const models: VideoAvailabilitySnapshotModel[] = modelIds.map((id) => ({
      id,
      available: true,
      supportsI2V: true,
      supportsImageInput: true,
      entitled: true,
      planTier: "unknown",
    }));

    const snapshot: VideoAvailabilitySnapshot = {
      models,
      availableModelIds: modelIds,
      unknownModelIds: [],
    };

    const videoGenerationService = {
      getAvailabilitySnapshot: vi.fn().mockReturnValue(snapshot),
    } as unknown as VideoGenerationService;

    const service = new ModelIntelligenceService({
      promptSpanProvider,
      registry,
      scoringService: new ModelScoringService(),
      explainerService: new RecommendationExplainerService(),
      availabilityGate: new AvailabilityGateService(
        videoGenerationService,
        null,
      ),
    });

    const recommendation = await service.getRecommendation(SAMPLE_PROMPT, {
      mode: "t2v",
    });

    expect(promptSpanProvider.label).toHaveBeenCalled();
    expect(recommendation.requirements.physics.hasParticleSystems).toBe(true);
    expect(recommendation.recommendations.length).toBeGreaterThan(0);
  });
});
