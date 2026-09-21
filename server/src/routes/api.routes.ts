/**
 * API Routes Aggregator
 *
 * Mounts domain-specific route modules under /api
 *
 * Route structure:
 * - /api/optimize → optimize.routes.ts
 * - /api/enhancement/suggestions, /api/enhancement/custom-suggestions,
 *   /api/enhancement/scene-change, /api/enhancement/test-nlp → enhancement.routes.ts
 * - /api/enhancement/observe-image → image-observation.routes.ts
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
import { createSessionRoutes } from "./sessions.routes";
import { createModelIntelligenceRoutes } from "./model-intelligence.routes";
import type { OptimizeServices } from "./optimize/types";
import type { ReferenceImageStorePort } from "@services/asset/reference-images/ports/ReferenceImageStorePort";
import type { AssetService } from "@services/asset/AssetService";
import type { ConsistentVideoService } from "@services/video-generation/ConsistentVideoService";
import type { RouteCreditService } from "@services/credits/ports";
import type { ImageObservationService } from "@services/image-observation";
import type { ContinuitySessionService } from "@services/continuity/ContinuitySessionService";
import type { ModelIntelligenceService } from "@services/model-intelligence/ModelIntelligenceService";
import type { SessionService } from "@services/sessions/SessionService";
import type { SessionDto } from "@shared/types/session";

interface ApiServices extends OptimizeServices, EnhancementServices {
  storageService: StorageRoutesService;
  assetService?: AssetService;
  consistentVideoService?: ConsistentVideoService;
  userCreditService?: RouteCreditService;
  referenceImageRepository?: ReferenceImageStorePort | null;
  imageObservationService?: ImageObservationService | null;
  continuitySessionService?: ContinuitySessionService | null;
  modelIntelligenceService?: ModelIntelligenceService | null;
  sessionService?: SessionService | null;
  /**
   * Issue #125: freshen a single session's picture view URLs on read from
   * owner-checked durable handles. Bound at registration; the sessions router
   * stays decoupled from the resolver.
   */
  remintSessionPictures?: ((dto: SessionDto) => Promise<SessionDto>) | null;
  /**
   * Issue #136: arm an already-attached take as the session's first frame —
   * the repair door for an attached-but-not-armed handoff. Bound at
   * registration; the sessions router stays decoupled from the admission
   * modules and the resolver.
   */
  armFirstFrame?:
    | ((input: {
        userId: string;
        sessionId: string;
        generationId: string;
      }) => Promise<
        | { ok: true; frame: Record<string, unknown> }
        | { ok: false; reason: string }
      >)
    | null;
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
    continuitySessionService,
    modelIntelligenceService,
    sessionService,
    storageService,
    remintSessionPictures,
    armFirstFrame,
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

  if (consistentVideoService) {
    router.use(
      "/generate/consistent",
      createConsistentGenerationRoutes(
        consistentVideoService,
        userCreditService,
      ),
    );
  }

  if (sessionService) {
    router.use(
      "/sessions",
      createSessionRoutes(
        sessionService,
        continuitySessionService ?? null,
        userCreditService,
        remintSessionPictures ?? undefined,
        armFirstFrame ?? undefined,
      ),
    );
  }

  if (modelIntelligenceService) {
    router.use("/", createModelIntelligenceRoutes(modelIntelligenceService));
  }

  // Capabilities registry routes (schema-driven UI)
  router.use("/", createCapabilitiesRoutes());

  return router;
}
