import type { DIContainer } from "@infrastructure/DIContainer";
import type { VideoService } from "@services/enhancement/services/types";
import { AIModelService } from "@services/ai-model/index";
import { EnhancementService } from "@services/enhancement/index";
import { BrainstormContextBuilder } from "@services/enhancement/services/BrainstormContextBuilder";
import { PromptCoherenceService } from "@services/enhancement/services/PromptCoherenceService";
import { SuggestionDiversityEnforcer } from "@services/enhancement/services/SuggestionDeduplicator";
import { SceneChangeDetectionService } from "@services/enhancement/services/SceneChangeDetectionService";
import type { CacheService } from "@services/cache/CacheService";
import { VideoPromptService } from "@services/video-prompt-analysis/index";
import { AIServiceVideoPromptLlmGateway } from "@services/video-prompt-analysis/services/llm/VideoPromptLlmGateway";
import type { ServiceConfig } from "./service-config.types.ts";

export function registerEnhancementServices(container: DIContainer): void {
  container.register(
    "videoPromptService",
    (aiService: AIModelService) =>
      new VideoPromptService({
        videoPromptLlmGateway: new AIServiceVideoPromptLlmGateway(aiService),
      }),
    ["aiService"],
  );
  container.register(
    "brainstormBuilder",
    () => new BrainstormContextBuilder(),
    [],
  );
  container.register(
    "diversityEnforcer",
    (aiService: AIModelService) => new SuggestionDiversityEnforcer(aiService),
    ["aiService"],
  );

  container.register(
    "enhancementService",
    (
      aiService: AIModelService,
      videoPromptService: VideoService,
      brainstormBuilder: BrainstormContextBuilder,
      diversityEnforcer: SuggestionDiversityEnforcer,
      cacheService: CacheService,
      config: ServiceConfig,
    ) =>
      new EnhancementService({
        aiService,
        videoPromptService,
        brainstormBuilder,
        diversityEnforcer,
        cacheService,
        enhancementConfig: config.enhancement,
      }),
    [
      "aiService",
      "videoPromptService",
      "brainstormBuilder",
      "diversityEnforcer",
      "cacheService",
      "config",
    ],
  );

  container.register(
    "sceneDetectionService",
    (aiService: AIModelService, cacheService: CacheService) =>
      new SceneChangeDetectionService(aiService, cacheService),
    ["aiService", "cacheService"],
  );

  container.register(
    "promptCoherenceService",
    (aiService: AIModelService) => new PromptCoherenceService(aiService),
    ["aiService"],
  );
}
