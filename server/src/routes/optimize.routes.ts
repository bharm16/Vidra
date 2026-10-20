import express, { type Router } from "express";
import { asyncHandler } from "@middleware/asyncHandler";
import { enforceVideoMode } from "@middleware/enforceVideoMode";
import { normalizeOptimizationRequest } from "@middleware/normalizeOptimizationRequest";
import { validateRequest } from "@middleware/validateRequest";
import { promptSchema, compileSchema } from "@config/schemas";
import type {
  OptimizeTrace,
  OptimizeTelemetryService,
} from "@services/observability/OptimizeTelemetryService";
import type { OptimizeServices } from "./optimize/types";
import { createOptimizeHandler } from "./optimize/handlers/optimize";
import { createOptimizeCompileHandler } from "./optimize/handlers/optimizeCompile";

const NOOP_TRACE: OptimizeTrace = {
  recordStage: () => {},
  recordLlmCall: () => {},
  recordCacheHit: () => {},
  recordError: () => {},
  complete: () => {},
} as unknown as OptimizeTrace;

const NOOP_TELEMETRY_SERVICE: OptimizeTelemetryService = {
  startOptimizeTrace: () => NOOP_TRACE,
} as unknown as OptimizeTelemetryService;

/**
 * Create optimization routes
 * Handles prompt optimization
 */
export function createOptimizeRoutes(services: OptimizeServices): Router {
  const router = express.Router();
  const { promptOptimizationService, optimizeTelemetryService } = services;

  const optimizeHandler = createOptimizeHandler(
    promptOptimizationService,
    optimizeTelemetryService ?? NOOP_TELEMETRY_SERVICE,
  );
  const optimizeCompileHandler = createOptimizeCompileHandler(
    promptOptimizationService,
  );

  router.post(
    "/optimize",
    normalizeOptimizationRequest,
    enforceVideoMode,
    validateRequest(promptSchema),
    asyncHandler(optimizeHandler),
  );

  router.post(
    "/optimize-compile",
    validateRequest(compileSchema),
    asyncHandler(optimizeCompileHandler),
  );

  return router;
}
