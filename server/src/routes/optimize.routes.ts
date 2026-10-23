import express, { type Router } from "express";
import { asyncHandler } from "@middleware/asyncHandler";
import { enforceVideoMode } from "@middleware/enforceVideoMode";
import { normalizeOptimizationRequest } from "@middleware/normalizeOptimizationRequest";
import { validateRequest } from "@middleware/validateRequest";
import { promptSchema, compileSchema } from "@config/schemas";
import type { OptimizeServices } from "./optimize/types";
import { createOptimizeHandler } from "./optimize/handlers/optimize";
import { createOptimizeCompileHandler } from "./optimize/handlers/optimizeCompile";

/**
 * Create optimization routes
 * Handles prompt optimization
 */
export function createOptimizeRoutes(services: OptimizeServices): Router {
  const router = express.Router();
  const { promptOptimizationService, wordingGuidance } = services;

  const optimizeHandler = createOptimizeHandler(
    promptOptimizationService,
    wordingGuidance,
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
