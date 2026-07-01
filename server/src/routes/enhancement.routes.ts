import express, { type Router } from "express";
import { PerformanceMonitor } from "@middleware/performanceMonitor";
import { registerEnhancementSuggestionsRoute } from "./enhancement/enhancementSuggestionsRoute";
import { registerCustomSuggestionsRoute } from "./enhancement/customSuggestionsRoute";
import { registerSceneChangeRoute } from "./enhancement/sceneChangeRoute";
import { registerNlpTestRoute } from "./enhancement/nlpTestRoute";
import { registerCoherenceCheckRoute } from "./enhancement/coherenceCheckRoute";
import type { EnhancementService } from "@services/enhancement/EnhancementService";
import type { SceneChangeDetectionService } from "@services/enhancement/services/SceneChangeDetectionService";
import type { PromptCoherenceService } from "@services/enhancement/services/PromptCoherenceService";
import type { SuggestionsTelemetryService } from "@services/observability/SuggestionsTelemetryService";

export interface EnhancementServices {
  enhancementService: Pick<
    EnhancementService,
    "getEnhancementSuggestions" | "getCustomSuggestions"
  >;
  sceneDetectionService: Pick<SceneChangeDetectionService, "detectSceneChange">;
  promptCoherenceService: Pick<PromptCoherenceService, "checkCoherence">;
  suggestionsTelemetryService: Pick<
    SuggestionsTelemetryService,
    "startSuggestionsTrace"
  >;
}

/**
 * Create enhancement routes
 * Handles enhancement suggestions, custom suggestions, scene detection, and NLP testing
 */
export function createEnhancementRoutes(services: EnhancementServices): Router {
  const router = express.Router();
  const {
    enhancementService,
    sceneDetectionService,
    promptCoherenceService,
    suggestionsTelemetryService,
  } = services;

  const perfMonitor = new PerformanceMonitor();

  registerEnhancementSuggestionsRoute(router, {
    enhancementService,
    perfMonitor,
    suggestionsTelemetryService,
  });
  registerCustomSuggestionsRoute(router, { enhancementService });
  registerSceneChangeRoute(router, { sceneDetectionService });
  registerCoherenceCheckRoute(router, { promptCoherenceService, perfMonitor });
  registerNlpTestRoute(router);

  return router;
}
