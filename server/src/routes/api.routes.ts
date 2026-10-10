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
import { createSessionRoutes } from "./sessions.routes";
import type { OptimizeServices } from "./optimize/types";
import type { SessionService } from "@services/sessions/SessionService";
import type { SessionDto } from "@shared/types/session";

interface ApiServices extends OptimizeServices, EnhancementServices {
  storageService: StorageRoutesService;
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
    suggestionsTelemetryService,
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
      suggestionsTelemetryService,
    }),
  );

  // Mount storage routes under /storage
  router.use("/storage", createStorageRoutes(storageService));

  if (sessionService) {
    router.use(
      "/sessions",
      createSessionRoutes(
        sessionService,
        remintSessionPictures ?? undefined,
        armFirstFrame ?? undefined,
      ),
    );
  }

  // Capabilities registry routes (schema-driven UI)
  router.use("/", createCapabilitiesRoutes());

  return router;
}
