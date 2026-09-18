/**
 * Motion Route Registration
 *
 * Registers convergence media and motion routes.
 * Auth required.
 */

import type { Application } from "express";
import type { Bucket } from "@google-cloud/storage";
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
import type { SignedUrlLedger } from "@infrastructure/signedUrl/SignedUrlLedger";
import { getRuntimeFlags } from "../feature-flags.ts";
import { resolveOptionalService } from "./resolve-utils.ts";

export function registerMotionRoutes(
  app: Application,
  container: DIContainer,
): void {
  const convergenceStorageService =
    resolveOptionalService<GCSStorageService | null>(
      container,
      "convergenceStorageService",
      "convergence-storage",
    );

  // ADR-0022 decision 7 thaws exactly one route: POST /api/motion/depth, the
  // depth estimate behind the illustrative camera preview. Everything else
  // under the convergence umbrella — including the media proxy below — stays
  // behind ENABLE_CONVERGENCE, which keeps its description and its default.
  // A single route moved out from under a frozen mount, never a frozen stack
  // switched on: flipping the umbrella would thaw the whole pipeline by
  // accident, which is the exact failure the decision exists to prevent.
  const convergenceEnabled = getRuntimeFlags().enableConvergence;
  if (!convergenceEnabled) {
    logger.info(
      "Convergence media routes not mounted: ENABLE_CONVERGENCE is off. The depth route stays reachable (ADR-0022 D7).",
    );
  } else if (!convergenceStorageService) {
    logger.warn(
      "Convergence media routes disabled: storage service unavailable",
    );
  } else {
    const gcsBucket = container.resolve<Bucket>("gcsBucket");
    const signedUrlLedger =
      container.resolve<SignedUrlLedger>("signedUrlLedger");
    const motionMediaRoutes = createConvergenceMediaRoutes(
      () => convergenceStorageService,
      gcsBucket,
      signedUrlLedger,
    );
    app.use("/api/motion/media", motionMediaRoutes);
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
