/**
 * Motion Route Registration
 *
 * Registers convergence media and motion routes.
 * Auth required.
 */

import type { Application } from "express";
import type { DIContainer } from "@infrastructure/DIContainer";
import { logger } from "@infrastructure/Logger";
import { apiAuthMiddleware } from "@middleware/apiAuth";
import { createConvergenceMediaRoutes } from "@routes/convergence/convergenceMedia.routes";
import { createMotionRoutes } from "@routes/motion.routes";
import { CAMERA_PATHS } from "@services/convergence/constants";
import {
  createDepthEstimationServiceForUser,
  getDepthWarmupStatus,
  getStartupWarmupPromise,
} from "@services/convergence/depth";
import type { GCSStorageService } from "@services/convergence/storage";
import { getRuntimeFlags } from "../feature-flags.ts";
import { resolveOptionalService } from "./resolve-utils.ts";

export function registerMotionRoutes(
  app: Application,
  container: DIContainer,
): void {
  // ADR-0002 froze convergence, but ENABLE_CONVERGENCE gated only the
  // continuity services — /api/motion stayed mounted with the flag off.
  if (!getRuntimeFlags().enableConvergence) {
    logger.info("Motion routes not mounted: ENABLE_CONVERGENCE is off");
    return;
  }

  const convergenceStorageService =
    resolveOptionalService<GCSStorageService | null>(
      container,
      "convergenceStorageService",
      "convergence-storage",
    );

  if (convergenceStorageService) {
    const motionMediaRoutes = createConvergenceMediaRoutes(
      () => convergenceStorageService,
    );
    app.use("/api/motion/media", motionMediaRoutes);
  } else {
    logger.warn(
      "Convergence media routes disabled: storage service unavailable",
    );
  }

  const motionRoutes = createMotionRoutes({
    cameraPaths: CAMERA_PATHS,
    createDepthEstimationServiceForUser,
    getDepthWarmupStatus,
    getStartupWarmupPromise,
    getStorageService: () => {
      if (!convergenceStorageService) {
        throw new Error("Convergence storage service is not available");
      }
      return convergenceStorageService;
    },
  });
  app.use("/api/motion", apiAuthMiddleware, motionRoutes);
}
