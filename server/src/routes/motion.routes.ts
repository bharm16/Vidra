/**
 * Motion Routes
 *
 * Lightweight endpoints for the motion controls workflow.
 * Reuses the existing convergence depth estimation service.
 */

import express, { type Request, type Response, type Router } from "express";
import { z } from "zod";
import { logger } from "@infrastructure/Logger";
import { generateId } from "@utils/uid";
import { asyncHandler } from "@middleware/asyncHandler";
import { requireBody, requireCreatorId } from "@middleware/intake";
import { CAMERA_PATHS } from "@services/convergence/constants";
import {
  createDepthEstimationServiceForUser,
  getDepthWarmupStatus,
  getStartupWarmupPromise,
} from "@services/convergence/depth";
import type { GCSStorageService } from "@services/convergence/storage";
import { safeUrlHost } from "@shared/utils/url";

const log = logger.child({ routes: "motion" });
const OPERATION = "estimateDepth";
const DEPTH_ESTIMATION_TIMEOUT_MS = (() => {
  const raw = Number.parseInt(
    process.env.DEPTH_ESTIMATION_TIMEOUT_MS || "",
    10,
  );
  if (Number.isFinite(raw) && raw >= 5_000) {
    return raw;
  }
  return 25_000;
})();

const DEPTH_ESTIMATION_COLD_START_TIMEOUT_MS = (() => {
  const raw = Number.parseInt(
    process.env.DEPTH_ESTIMATION_COLD_START_TIMEOUT_MS || "",
    10,
  );
  if (Number.isFinite(raw) && raw >= 5_000) {
    return raw;
  }
  return Math.max(60_000, DEPTH_ESTIMATION_TIMEOUT_MS);
})();

const DepthEstimationRequestSchema = z.object({
  imageUrl: z.string().url("Invalid image URL"),
});

type RequestWithUser = Request & {
  user?: { uid?: string };
  id?: string;
};

interface DepthEstimationSuccessPayload {
  depthMapUrl: string | null;
  cameraPaths: typeof CAMERA_PATHS;
  fallbackMode: boolean;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: unknown;
}

export interface MotionRouteServices {
  cameraPaths: typeof CAMERA_PATHS;
  createDepthEstimationServiceForUser: typeof createDepthEstimationServiceForUser;
  getDepthWarmupStatus: typeof getDepthWarmupStatus;
  getStartupWarmupPromise: typeof getStartupWarmupPromise;
  getStorageService: () => GCSStorageService;
}

const defaultServices: MotionRouteServices = {
  cameraPaths: CAMERA_PATHS,
  createDepthEstimationServiceForUser,
  getDepthWarmupStatus,
  getStartupWarmupPromise,
  getStorageService: () => {
    throw new Error(
      "Motion routes require an injected convergence storage service",
    );
  },
};

const buildFallbackResponse = (
  cameraPaths: typeof CAMERA_PATHS,
): ApiResponse<DepthEstimationSuccessPayload> => ({
  success: true,
  data: {
    depthMapUrl: null,
    cameraPaths,
    fallbackMode: true,
  },
});

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Depth estimation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

export function createMotionRoutes(
  services: MotionRouteServices = defaultServices,
): Router {
  const router = express.Router();

  /**
   * POST /api/motion/depth
   *
   * Estimates depth from an uploaded image and returns camera path options.
   */
  router.post(
    "/depth",
    asyncHandler(async (req: RequestWithUser, res: Response) => {
      const requestId = req.id ?? null;
      const depthRequestId = generateId("depth");
      const startedAt = Date.now();

      const parsed = requireBody(DepthEstimationRequestSchema, req, res);
      if (!parsed.ok) return;

      const userId = requireCreatorId(req, res);
      if (!userId) {
        log.warn("Depth estimation requested without authenticated user", {
          operation: OPERATION,
          requestId,
          depthRequestId,
        });
        return;
      }

      const { imageUrl } = parsed.value;
      const imageUrlHost = safeUrlHost(imageUrl);

      log.info("Depth estimation requested", {
        operation: OPERATION,
        userId,
        requestId,
        depthRequestId,
        imageUrlHost,
      });

      let storageService;
      try {
        storageService = services.getStorageService();
      } catch (error) {
        log.warn(
          "Storage service unavailable; returning fallback motion options",
          {
            operation: OPERATION,
            userId,
            requestId,
            depthRequestId,
            imageUrlHost,
            error: error instanceof Error ? error.message : String(error),
          },
        );
        return res.json(buildFallbackResponse(services.cameraPaths));
      }

      const depthService = services.createDepthEstimationServiceForUser(
        storageService,
        userId,
      );
      if (!depthService.isAvailable()) {
        log.warn(
          "Depth estimation service not available; returning fallback mode",
          {
            operation: OPERATION,
            userId,
            requestId,
            depthRequestId,
            imageUrlHost,
          },
        );
        return res.json(buildFallbackResponse(services.cameraPaths));
      }

      try {
        // If startup warmup is still in-flight, wait for it so the model is warm
        // before making the user's depth estimation call.
        const pendingWarmup = services.getStartupWarmupPromise();
        if (pendingWarmup) {
          const { warmupInFlight: wif } = services.getDepthWarmupStatus();
          if (wif) {
            log.debug(
              "Waiting for startup warmup to complete before depth estimation",
              {
                operation: OPERATION,
                userId,
                requestId,
                depthRequestId,
              },
            );
            await pendingWarmup.catch(() => {
              // Warmup failure is non-fatal; proceed with estimation anyway
            });
          }
        }

        const { warmupInFlight, lastWarmupAt } =
          services.getDepthWarmupStatus();
        const coldStart = warmupInFlight || lastWarmupAt === 0;
        const timeoutMs = coldStart
          ? DEPTH_ESTIMATION_COLD_START_TIMEOUT_MS
          : DEPTH_ESTIMATION_TIMEOUT_MS;

        log.debug("Depth estimation starting", {
          operation: OPERATION,
          userId,
          requestId,
          depthRequestId,
          imageUrlHost,
          timeoutMs,
          coldStart,
        });
        const depthMapUrl = await withTimeout(
          depthService.estimateDepth(imageUrl),
          timeoutMs,
        );
        const duration = Date.now() - startedAt;
        const depthMapUrlHost = safeUrlHost(depthMapUrl);

        log.info("Depth estimation completed", {
          operation: OPERATION,
          userId,
          requestId,
          depthRequestId,
          duration,
          fallbackMode: false,
          imageUrlHost,
          depthMapUrlHost,
        });
        return res.json({
          success: true,
          data: {
            depthMapUrl,
            cameraPaths: services.cameraPaths,
            fallbackMode: false,
          },
        } satisfies ApiResponse<DepthEstimationSuccessPayload>);
      } catch (error) {
        const duration = Date.now() - startedAt;
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const timedOut = errorMessage.includes("timed out");
        const { warmupInFlight, lastWarmupAt } =
          services.getDepthWarmupStatus();
        const coldStart = warmupInFlight || lastWarmupAt === 0;
        const timeoutMs = coldStart
          ? DEPTH_ESTIMATION_COLD_START_TIMEOUT_MS
          : DEPTH_ESTIMATION_TIMEOUT_MS;
        log.warn("Depth estimation failed; returning fallback mode", {
          operation: OPERATION,
          userId,
          requestId,
          depthRequestId,
          duration,
          imageUrlHost,
          error: errorMessage,
          timedOut,
          timeoutMs,
          coldStart,
        });
        return res.json(buildFallbackResponse(services.cameraPaths));
      }
    }),
  );

  return router;
}

export default createMotionRoutes;
