/**
 * API Routes Aggregator
 *
 * Mounts domain-specific route modules under /api
 *
 * Route structure:
 * - /api/optimize → optimize.routes.ts
 * - /api/get-enhancement-suggestions, /api/get-custom-suggestions,
 *   /api/detect-scene-change, /api/test-nlp → enhancement.routes.ts
 */

import express, { type Router } from "express";
import { createOptimizeRoutes } from "./optimize.routes";
import { createCapabilitiesRoutes } from "./capabilities.routes";
import {
  createEnhancementRoutes,
  type EnhancementServices,
} from "./enhancement.routes";
import {
  createStorageRoutes,
  type StorageRoutesService,
} from "./storage.routes";
import { createAssetRoutes } from "./asset.routes";
import { createConsistentGenerationRoutes } from "./consistentGeneration.routes";
import { createReferenceImagesRoutes } from "./reference-images.routes";
import { createImageObservationRoutes } from "./image-observation.routes";
import { createMotionIdeasRoutes } from "./i2v/motionIdeas.routes";
import { createContinuityRoutes } from "./continuity.routes";
import { createSessionRoutes } from "./sessions.routes";
import {
  createModelIntelligenceRoutes,
  type ModelIntelligenceRouteMetrics,
} from "./model-intelligence.routes";
import type { OptimizeServices } from "./optimize/types";
import type { ReferenceImageStorePort } from "@services/asset/reference-images/ports/ReferenceImageStorePort";
import type { AssetService } from "@services/asset/AssetService";
import type { ConsistentVideoService } from "@services/video-generation/ConsistentVideoService";
import type { UserCreditService } from "@services/credits/UserCreditService";
import type { ImageObservationService } from "@services/image-observation";
import type { MotionIdeaService } from "@services/i2v-motion-ideas/MotionIdeaService";
import type { ContinuitySessionService } from "@services/continuity/ContinuitySessionService";
import type { ModelIntelligenceService } from "@services/model-intelligence/ModelIntelligenceService";
import type { SessionService } from "@services/sessions/SessionService";

interface ApiServices extends OptimizeServices, EnhancementServices {
  storageService: StorageRoutesService;
  assetService?: AssetService;
  consistentVideoService?: ConsistentVideoService;
  userCreditService?: UserCreditService;
  referenceImageRepository?: ReferenceImageStorePort | null;
  imageObservationService?: ImageObservationService | null;
  motionIdeaService?: MotionIdeaService | null;
  continuitySessionService?: ContinuitySessionService | null;
  modelIntelligenceService?: ModelIntelligenceService | null;
  modelIntelligenceMetrics?: ModelIntelligenceRouteMetrics;
  sessionService?: SessionService | null;
}

/**
 * Create API routes
 * @param services - Service instances
 * @returns Express router
 */
export function createAPIRoutes(services: ApiServices): Router {
  const router = express.Router();

  const {
    promptOptimizationService,
    optimizeTelemetryService,
    enhancementService,
    sceneDetectionService,
    promptCoherenceService,
    suggestionsTelemetryService,
    assetService,
    consistentVideoService,
    userCreditService,
    referenceImageRepository,
    imageObservationService,
    motionIdeaService,
    continuitySessionService,
    modelIntelligenceService,
    modelIntelligenceMetrics,
    sessionService,
    storageService,
  } = services;

  // Mount optimization routes at root level (preserves /api/optimize paths)
  router.use(
    "/",
    createOptimizeRoutes({
      promptOptimizationService,
      ...(optimizeTelemetryService ? { optimizeTelemetryService } : {}),
    }),
  );

  // Mount enhancement routes at root level (preserves existing paths)
  router.use(
    "/",
    createEnhancementRoutes({
      enhancementService,
      sceneDetectionService,
      promptCoherenceService,
      suggestionsTelemetryService,
    }),
  );

  // Mount storage routes under /storage
  router.use("/storage", createStorageRoutes(storageService));

  if (assetService) {
    router.use("/assets", createAssetRoutes(assetService));
  }

  if (referenceImageRepository) {
    router.use(
      "/reference-images",
      createReferenceImagesRoutes(referenceImageRepository),
    );
  }

  if (imageObservationService) {
    router.use("/", createImageObservationRoutes(imageObservationService));
  }

  if (motionIdeaService) {
    router.use("/", createMotionIdeasRoutes(motionIdeaService));
  }

  if (consistentVideoService) {
    router.use(
      "/generate/consistent",
      createConsistentGenerationRoutes(
        consistentVideoService,
        userCreditService,
      ),
    );
  }

  if (continuitySessionService) {
    router.use(
      "/continuity",
      createContinuityRoutes(continuitySessionService, userCreditService),
    );
  }

  if (sessionService) {
    router.use(
      "/sessions",
      createSessionRoutes(
        sessionService,
        continuitySessionService ?? null,
        userCreditService,
      ),
    );
  }

  if (modelIntelligenceService) {
    router.use(
      "/",
      createModelIntelligenceRoutes(
        modelIntelligenceService,
        modelIntelligenceMetrics,
      ),
    );
  }

  // Capabilities registry routes (schema-driven UI)
  router.use("/", createCapabilitiesRoutes());

  return router;
}
