/**
 * Health Route Registration
 *
 * Registers health/readiness endpoints and OpenAPI dev routes.
 * No auth required.
 */

import type { Application } from "express";
import type { DIContainer } from "@infrastructure/DIContainer";
import { logger } from "@infrastructure/Logger";
import { getFirestore } from "@infrastructure/firebaseAdmin";
import { getRedisStatus } from "@config/redis";
import { createHealthRoutes } from "@routes/health.routes";
import { createOpenApiDevRoute } from "../../openapi/devRoute.ts";
import { resolveOptionalService } from "./resolve-utils.ts";

export function registerHealthRoutes(
  app: Application,
  container: DIContainer,
): void {
  const firestoreCircuitExecutor = container.resolve(
    "firestoreCircuitExecutor",
  );

  // Resolve worker instances for health status reporting
  type StatusProvider = {
    getStatus(): {
      running: boolean;
      lastRunAt: Date | null;
      consecutiveFailures: number;
    };
  };
  const workerEntries: [string, StatusProvider | null][] = [
    [
      "creditRefundSweeper",
      resolveOptionalService<StatusProvider | null>(
        container,
        "creditRefundSweeper",
        "health-workers",
      ),
    ],
    [
      "videoJobWorker",
      resolveOptionalService<StatusProvider | null>(
        container,
        "videoJobWorker",
        "health-workers",
      ),
    ],
  ];
  const workers: Record<string, StatusProvider> = {};
  for (const [name, provider] of workerEntries) {
    if (provider) workers[name] = provider;
  }

  // Cached Firestore probe — runs on a 15s interval so /health/ready does zero inline I/O.
  const PROBE_INTERVAL_MS = 15_000;
  const PROBE_STALE_THRESHOLD_MS = 45_000;
  let firestoreProbeHealthy = false;
  let firestoreProbeLastSuccessAt: number | null = null;
  let firestoreProbeLastError: string | null = null;

  const runFirestoreProbe = async (): Promise<void> => {
    try {
      await firestoreCircuitExecutor.executeRead(
        "health.ready.firestoreProbe",
        async () => {
          const firestore = getFirestore();
          // Lightweight connectivity check — the collection name is arbitrary and
          // need not exist. Firestore returns an empty snapshot for nonexistent
          // collections, so this verifies connectivity without side effects.
          await firestore.collection("_health_probe").limit(1).get();
        },
      );
      firestoreProbeHealthy = true;
      firestoreProbeLastSuccessAt = Date.now();
      firestoreProbeLastError = null;
    } catch (error) {
      firestoreProbeHealthy = false;
      firestoreProbeLastError =
        error instanceof Error ? error.message : String(error);
      logger.warn("Firestore readiness probe failed", {
        error: firestoreProbeLastError,
      });
    }
  };

  // Run the probe once immediately, then on interval
  void runFirestoreProbe();
  const probeInterval = setInterval(
    () => void runFirestoreProbe(),
    PROBE_INTERVAL_MS,
  );
  probeInterval.unref(); // Don't keep the process alive for the probe

  const healthRoutes = createHealthRoutes({
    openAIClient: container.resolve("openAIClient"),
    groqClient: container.resolve("groqClient"),
    geminiClient: container.resolve("geminiClient"),
    cacheService: container.resolve("cacheService"),
    gcsBucket: container.resolve("gcsBucket"),
    firestoreCircuitExecutor,
    checkFirestore: async () => {
      // Read cached probe result — zero inline I/O
      const isStale =
        firestoreProbeLastSuccessAt === null ||
        Date.now() - firestoreProbeLastSuccessAt > PROBE_STALE_THRESHOLD_MS;
      if (!firestoreProbeHealthy || isStale) {
        throw new Error(
          firestoreProbeLastError ??
            (isStale
              ? "Firestore probe stale (no successful check within threshold)"
              : "Firestore probe unhealthy"),
        );
      }
    },
    workers,
    getRedisStatus,
  });

  app.use("/", healthRoutes);

  // OpenAPI spec (dev only — returns null in production, not mounted)
  const openApiRoute = createOpenApiDevRoute();
  if (openApiRoute) {
    app.use("/api-docs", openApiRoute);
  }

  logger.debug("Health routes registered");
}
