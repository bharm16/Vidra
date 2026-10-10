/**
 * Server Lifecycle Management
 *
 * Handles:
 * - Server startup
 * - Graceful shutdown
 * - Signal handling (SIGTERM, SIGINT)
 * - Resource cleanup
 */

import type { Application } from "express";
import type { Server } from "http";
import type Redis from "ioredis";
import type { ServiceConfig } from "./config/services.config.ts";
import { logger } from "./infrastructure/Logger.ts";
import { closeRedisClient } from "./config/redis.ts";
import { isTransientError } from "./utils/transientErrors.ts";
import { toError } from "@shared/utils/error";
import type { DIContainer } from "./infrastructure/DIContainer.ts";
import type { IPostHogClient } from "./infrastructure/PostHogClient.ts";
import type { SpanLabelingCacheService } from "./services/cache/SpanLabelingCacheService.ts";
import type { CapabilitiesProbeService } from "./services/capabilities/CapabilitiesProbeService.ts";
import type { CreditRefundSweeper } from "./services/video-generation/refunds/CreditRefundSweeper.ts";
import type { VideoJobWorker } from "./services/video-generation/runtime/VideoJobWorker.ts";
import type { VideoAssetRetentionService } from "./services/video-generation/storage/VideoAssetRetentionService.ts";
import { getRuntimeFlags } from "./config/feature-flags.ts";

function isFatalUnhandledRejection(reason: unknown): boolean {
  if (!reason || typeof reason !== "object") {
    return false;
  }

  const error = toError(reason);
  const fatalFlag = (reason as { fatal?: unknown }).fatal;
  if (fatalFlag === true) {
    return true;
  }

  if (
    error instanceof TypeError ||
    error instanceof ReferenceError ||
    error instanceof SyntaxError ||
    error instanceof RangeError
  ) {
    return true;
  }

  // "Did the world misbehave, or did we?" is not this file's question to
  // answer — @utils/transientErrors owns it, and owns it for the retry paths
  // too. This used to be a second pair of tables here, missing `socket hang
  // up` and `fetch failed`; a miss on this path exits the process.
  return !isTransientError(reason);
}

/**
 * Start the HTTP server
 *
 * @param {express.Application} app - Express app instance
 * @param {DIContainer} container - Dependency injection container
 * @returns {Promise<http.Server>} The HTTP server instance
 */
export async function startServer(
  app: Application,
  container: DIContainer,
): Promise<Server> {
  const config = container.resolve<ServiceConfig>("config");
  const PORT = config.server.port;

  return new Promise((resolve, reject) => {
    try {
      const server = app.listen(PORT, () => {
        logger.info("Server started successfully", {
          port: PORT,
          environment: config.server.environment,
          nodeVersion: process.version,
          proxyUrl: `http://localhost:${PORT}`,
          healthPath: "/health",
        });

        resolve(server);
      });

      // Configure server timeouts
      // Invariant: headersTimeout > keepAliveTimeout. server.timeout is disabled
      // because per-route timeouts and SSE idle timeout handle request-level enforcement.
      server.keepAliveTimeout = 125000; // 125 seconds
      server.headersTimeout = 126000; // 126 seconds
      server.timeout = 0; // Disabled — per-route timeouts handle this

      // Handle server errors
      server.on("error", (error) => {
        logger.error("Server error", error);
        reject(error);
      });
    } catch (error) {
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      logger.error("Failed to start server", errorObj);
      reject(error);
    }
  });
}

/**
 * Stop every registered periodic worker/loop during graceful shutdown.
 *
 * Exported for isolated testing — callers outside `setupGracefulShutdown`
 * should not invoke this directly. Any worker that exposes a `.stop()` method
 * and is registered in the DI container must be called here, otherwise its
 * interval timers keep the process alive past the drain budget.
 */
export function stopAllPeriodicWorkers(container: DIContainer): void {
  const resolveOptional = <T>(serviceName: string): T | null => {
    try {
      return container.resolve<T>(serviceName);
    } catch {
      return null;
    }
  };

  const creditRefundSweeper = resolveOptional<CreditRefundSweeper | null>(
    "creditRefundSweeper",
  );
  creditRefundSweeper?.stop();

  const videoAssetRetentionService =
    resolveOptional<VideoAssetRetentionService | null>(
      "videoAssetRetentionService",
    );
  videoAssetRetentionService?.stop();

  const capabilitiesProbe = resolveOptional<CapabilitiesProbeService | null>(
    "capabilitiesProbeService",
  );
  capabilitiesProbe?.stop();
}

/**
 * Setup graceful shutdown handlers
 *
 * @param {http.Server} server - HTTP server instance
 * @param {DIContainer} container - Dependency injection container
 */
export function setupGracefulShutdown(
  server: Server,
  container: DIContainer,
): void {
  const runtimeFlags = getRuntimeFlags();
  const resolveOptional = <T>(serviceName: string): T | null => {
    try {
      return container.resolve<T>(serviceName);
    } catch {
      return null;
    }
  };

  const shutdown = async (signal: string) => {
    logger.info("Signal received; closing HTTP server.", { signal });
    const { videoWorkerShutdownDrainSeconds } = getRuntimeFlags();
    const drainTimeoutMs = Math.max(
      1_000,
      videoWorkerShutdownDrainSeconds * 1000,
    );

    // Stop accepting new connections
    server.close(async () => {
      logger.info("HTTP server closed");

      try {
        stopAllPeriodicWorkers(container);

        // Drain active worker jobs with a deadline, then release claims for fast reclaim.
        const videoJobWorker = resolveOptional<VideoJobWorker | null>(
          "videoJobWorker",
        );
        if (videoJobWorker) {
          await videoJobWorker.shutdown(drainTimeoutMs);
        }

        // Close Redis connection
        const redisClient = container.resolve<Redis | null>("redisClient");
        await closeRedisClient(redisClient);

        // Flush pending telemetry events before exiting.
        const postHogClient = resolveOptional<IPostHogClient>("postHogClient");
        if (postHogClient) {
          try {
            await postHogClient.shutdown();
          } catch (err) {
            logger.warn("PostHog shutdown failed (non-fatal)", {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        // Stop cache cleanup interval
        const spanLabelingCacheService =
          container.resolve<SpanLabelingCacheService | null>(
            "spanLabelingCacheService",
          );
        if (
          spanLabelingCacheService &&
          spanLabelingCacheService.stopPeriodicCleanup
        ) {
          spanLabelingCacheService.stopPeriodicCleanup();
        }

        logger.info("All resources cleaned up successfully");
        process.exit(0);
      } catch (error) {
        const errorObj =
          error instanceof Error ? error : new Error(String(error));
        logger.error("Error during graceful shutdown", errorObj);
        process.exit(1);
      }
    });

    const forceShutdownMs = Math.max(30_000, drainTimeoutMs + 15_000);

    // Force shutdown after drain budget + safety margin
    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, forceShutdownMs);
  };

  // Handle shutdown signals
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Handle uncaught errors
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception", error);
    shutdown("UNCAUGHT_EXCEPTION");
  });

  process.on("unhandledRejection", (reason, promise) => {
    const error = toError(reason);
    const shouldShutdown =
      runtimeFlags.unhandledRejectionMode === "strict" ||
      isFatalUnhandledRejection(reason);

    if (shouldShutdown) {
      logger.error("Unhandled rejection (fatal)", error, {
        mode: runtimeFlags.unhandledRejectionMode,
        promise,
      });
      shutdown("UNHANDLED_REJECTION_FATAL");
      return;
    }

    logger.error("Unhandled rejection (non-fatal)", error, {
      mode: runtimeFlags.unhandledRejectionMode,
      promise,
    });
  });
}
