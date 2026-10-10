import express, { type Router } from "express";
import { PerformanceMonitor } from "@middleware/performanceMonitor";
import { registerEnhancementSuggestionsRoute } from "./enhancement/enhancementSuggestionsRoute";
import { registerCustomSuggestionsRoute } from "./enhancement/customSuggestionsRoute";
import { registerSceneChangeRoute } from "./enhancement/sceneChangeRoute";
import { registerNlpTestRoute } from "./enhancement/nlpTestRoute";
import type { EnhancementService } from "@services/enhancement/EnhancementService";
import type { SceneChangeDetectionService } from "@services/enhancement/services/SceneChangeDetectionService";
import type { SuggestionsTelemetryService } from "@services/observability/SuggestionsTelemetryService";

export interface EnhancementServices {
  enhancementService: Pick<
    EnhancementService,
    "getEnhancementSuggestions" | "getCustomSuggestions"
  >;
  sceneDetectionService: Pick<SceneChangeDetectionService, "detectSceneChange">;
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
  registerNlpTestRoute(router);

  return router;
}
