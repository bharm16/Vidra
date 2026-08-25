import type { DIContainer } from "@infrastructure/DIContainer";
import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";
import { PromptOptimizationService } from "@services/prompt-optimization/PromptOptimizationService";
import type { VideoPromptService } from "@services/video-prompt-analysis/VideoPromptService";
import type { ImageObservationService } from "@services/image-observation";
import type { CacheService } from "@services/cache/CacheService";
import type { ServiceConfig } from "./service-config.types.ts";

export function registerOptimizationServices(container: DIContainer): void {
  container.register(
    "promptOptimizationService",
    (
      aiService: AIExecutionPort,
      cacheService: CacheService,
      videoPromptService: VideoPromptService,
      imageObservationService: ImageObservationService,
      config: ServiceConfig,
    ) => {
      const po = config.promptOptimization;
      return new PromptOptimizationService(
        aiService,
        cacheService,
        videoPromptService,
        imageObservationService,
        { cacheTtlMs: po.shotPlanCacheTtlMs, cacheMax: po.shotPlanCacheMax },
      );
    },
    [
      "aiService",
      "cacheService",
      "videoPromptService",
      "imageObservationService",
      "config",
    ],
  );
}
