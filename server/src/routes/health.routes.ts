import express, { type Router } from "express";
import { asyncHandler } from "@middleware/asyncHandler";
import { createRouteTimeout } from "@middleware/routeTimeout";
import { logger } from "@infrastructure/Logger";
import type { FirestoreCircuitExecutor } from "@services/firestore/FirestoreCircuitExecutor";
import type { WorkerStatus } from "@services/jobs/WorkerStatus";
import type { RedisStatus } from "@config/redis";

interface WorkerStatusProvider {
  getStatus(): WorkerStatus;
}

/**
 * A single entry in the explicit dependency contract returned by GET /health/ready.
 *
 * - `required`: true means an unhealthy state here will cause a 503 response.
 * - `lastChecked`: ISO timestamp of the last probe, or null when the dependency
 *   was not wired (absent = skipped, not failed — see per-dep comments).
 * - `error`: present only when healthy === false, describing why.
 */
interface DependencyStatus {
  required: boolean;
  healthy: boolean;
  lastChecked: string | null;
  error?: string;
}

interface HealthDependencies {
  openAIClient?: { getStats: () => { state: string } } | null;
  groqClient?: { getStats: () => { state: string } } | null;
  geminiClient?: { getStats: () => { state: string } } | null;
  cacheService: {
    isHealthy: () => boolean;
  };
  /** Optional Firestore connectivity check. When absent, firebase is reported as
   *  healthy: true with lastChecked: null — absence of a probe is not a failure. */
  checkFirestore?: () => Promise<void>;
  /** Optional Firestore circuit state for readiness gating. */
  firestoreCircuitExecutor?: FirestoreCircuitExecutor;
  /** Optional background worker status providers for health reporting. */
  workers?: Record<string, WorkerStatusProvider | null>;
  /** Optional Redis status provider for health reporting. */
  getRedisStatus?: () => RedisStatus;
  /**
   * Optional GCS bucket. When provided, `bucket.exists()` is called to verify
   * connectivity. When absent, gcs is reported as healthy: true with
   * lastChecked: null — absence of a probe is not a failure.
   */
  gcsBucket?: { exists: () => Promise<[boolean]> };
}

/**
 * Create health check routes
 * @param {Object} dependencies - Service dependencies
 * @returns {Router} Express router
 */
export function createHealthRoutes(dependencies: HealthDependencies): Router {
  const router = express.Router();
  const healthTimeout = createRouteTimeout(5_000);
  const {
    openAIClient,
    groqClient,
    geminiClient,
    cacheService,
    checkFirestore,
    firestoreCircuitExecutor,
    workers,
    getRedisStatus: getRedisStatusFn,
    gcsBucket,
  } = dependencies;

  // GET /health - Basic health check
  router.get("/health", healthTimeout, (req, res) => {
    const requestId = req.id;
    logger.debug("Health check request", {
      operation: "health",
      requestId,
    });

    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // GET /health/ready - Readiness check (checks dependencies)
  router.get(
    "/health/ready",
    healthTimeout,
    asyncHandler(async (req, res) => {
      const startTime = performance.now();
      const operation = "healthReady";
      const requestId = req.id;

      logger.debug("Starting operation.", {
        operation,
        requestId,
      });

      const now = new Date().toISOString();

      // ---- firebase (required) -----------------------------------------------
      // Uses the circuit-breaker snapshot first (cheap, no I/O), then the
      // cached Firestore probe if wired. Absence of checkFirestore is not a
      // failure: the entry is listed as healthy with lastChecked: null so that
      // test environments without Firebase credentials still report truthfully.
      let firebaseHealthy = true;
      let firebaseError: string | undefined;
      let firebaseLastChecked: string | null = null;

      const firestoreCircuitSnapshot =
        firestoreCircuitExecutor?.getReadinessSnapshot();
      if (firestoreCircuitSnapshot) {
        firebaseLastChecked = now;
        if (firestoreCircuitSnapshot.degraded) {
          firebaseHealthy = false;
          if (firestoreCircuitSnapshot.state === "open") {
            firebaseError = "Firestore circuit is open";
          } else if (
            firestoreCircuitSnapshot.failureRate >=
            firestoreCircuitSnapshot.thresholds.failureRate
          ) {
            firebaseError = `Firestore failure rate ${Math.round(firestoreCircuitSnapshot.failureRate * 100)}% exceeds threshold`;
          } else if (
            firestoreCircuitSnapshot.latencyMeanMs >=
            firestoreCircuitSnapshot.thresholds.latencyMs
          ) {
            firebaseError = `Firestore mean latency ${Math.round(firestoreCircuitSnapshot.latencyMeanMs)}ms exceeds threshold`;
          } else {
            firebaseError = `Firestore circuit degraded (state: ${firestoreCircuitSnapshot.state})`;
          }
        }
      }
      if (checkFirestore) {
        firebaseLastChecked = now;
        try {
          await Promise.race([
            checkFirestore(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("timeout")), 3000),
            ),
          ]);
        } catch (err) {
          firebaseHealthy = false;
          firebaseError = err instanceof Error ? err.message : "unknown error";
        }
      }

      // ---- gcs (required) ----------------------------------------------------
      // Calls bucket.exists() to verify GCS connectivity. Absence of gcsBucket
      // is treated the same as absence of checkFirestore: healthy, lastChecked null.
      let gcsHealthy = true;
      let gcsError: string | undefined;
      let gcsLastChecked: string | null = null;

      if (gcsBucket) {
        gcsLastChecked = now;
        try {
          const [exists] = await gcsBucket.exists();
          if (!exists) {
            gcsHealthy = false;
            gcsError = "GCS bucket does not exist";
          }
        } catch (err) {
          gcsHealthy = false;
          gcsError = err instanceof Error ? err.message : "unknown error";
        }
      }

      // ---- cache (required) --------------------------------------------------
      // Synchronous check against the in-process cache adapter.
      const cacheHealthy = cacheService.isHealthy();

      // ---- redis (not required — falls back to in-memory) --------------------
      const redisStatus = getRedisStatusFn?.();
      let redisHealthy = true;
      let redisError: string | undefined;
      if (redisStatus !== undefined) {
        redisHealthy =
          redisStatus === "connected" || redisStatus === "disabled";
        if (!redisHealthy) {
          redisError =
            redisStatus === "disconnected"
              ? "Redis disconnected — using in-memory fallback"
              : "Redis reconnecting";
        }
      }

      // ---- LLM circuit breakers (not required — informational) ---------------
      const openAIStats = openAIClient?.getStats();
      const groqStats = groqClient?.getStats();
      const geminiStats = geminiClient?.getStats();

      // Build the explicit dependency map with required flags and timestamps.
      const dependencies: Record<string, DependencyStatus> = {
        firebase: {
          required: true,
          healthy: firebaseHealthy,
          lastChecked: firebaseLastChecked,
          ...(firebaseError !== undefined ? { error: firebaseError } : {}),
        },
        gcs: {
          required: true,
          healthy: gcsHealthy,
          lastChecked: gcsLastChecked,
          ...(gcsError !== undefined ? { error: gcsError } : {}),
        },
        cache: {
          required: true,
          healthy: cacheHealthy,
          lastChecked: now,
          ...(!cacheHealthy
            ? { error: "Cache service reports unhealthy" }
            : {}),
        },
      };

      // Redis: only include when the status provider is wired.
      if (getRedisStatusFn) {
        dependencies.redis = {
          required: false,
          healthy: redisHealthy,
          lastChecked: now,
          ...(redisError !== undefined ? { error: redisError } : {}),
        };
      }

      // LLM circuit breakers: only include when client is wired.
      if (openAIStats) {
        const openAIHealthy = openAIStats.state === "CLOSED";
        dependencies.openAI = {
          required: false,
          healthy: openAIHealthy,
          lastChecked: now,
          ...(!openAIHealthy
            ? { error: `Circuit breaker state: ${openAIStats.state}` }
            : {}),
        };
      }
      if (groqStats) {
        const groqHealthy = groqStats.state === "CLOSED";
        dependencies.groq = {
          required: false,
          healthy: groqHealthy,
          lastChecked: now,
          ...(!groqHealthy
            ? { error: `Circuit breaker state: ${groqStats.state}` }
            : {}),
        };
      }
      if (geminiStats) {
        const geminiHealthy = geminiStats.state === "CLOSED";
        dependencies.gemini = {
          required: false,
          healthy: geminiHealthy,
          lastChecked: now,
          ...(!geminiHealthy
            ? { error: `Circuit breaker state: ${geminiStats.state}` }
            : {}),
        };
      }

      // 503 fires only when a required dependency is unhealthy. Non-required
      // deps (redis, LLM circuit breakers) are informational.
      const isReady = Object.values(dependencies).every(
        (d) => !d.required || d.healthy,
      );

      // Collect background worker statuses (informational — does not gate readiness)
      const workerStatuses: Record<
        string,
        {
          running: boolean;
          lastRunAt: string | null;
          consecutiveFailures: number;
        }
      > = {};
      if (workers) {
        for (const [name, provider] of Object.entries(workers)) {
          if (provider) {
            const status = provider.getStatus();
            workerStatuses[name] = {
              running: status.running,
              lastRunAt: status.lastRunAt?.toISOString() ?? null,
              consecutiveFailures: status.consecutiveFailures,
            };
          }
        }
      }

      logger.info("Operation completed.", {
        operation,
        requestId,
        duration: Math.round(performance.now() - startTime),
        status: isReady ? "ready" : "unhealthy",
        dependencies,
      });

      res.status(isReady ? 200 : 503).json({
        status: isReady ? "ready" : "unhealthy",
        timestamp: new Date().toISOString(),
        dependencies,
        ...(Object.keys(workerStatuses).length > 0
          ? { workers: workerStatuses }
          : {}),
      });
    }),
  );

  // GET /health/live - Liveness check (always returns OK if server is running)
  router.get("/health/live", healthTimeout, (req, res) => {
    const requestId = req.id;
    logger.debug("Liveness check request", {
      operation: "healthLive",
      requestId,
    });

    res.json({
      status: "alive",
      timestamp: new Date().toISOString(),
    });
  });

  if (process.env.NODE_ENV !== "production") {
    router.get("/debug-sentry", (_req, _res) => {
      throw new Error("My first Sentry error!");
    });
  }

  return router;
}
