import type { WorkflowExecutionService } from "@services/creation-requests/execution/WorkflowExecutionService";
import type { StudioWorkflowSpendGuard } from "@services/creation-requests/execution/StudioWorkflowSpendGuard";
import type { Bucket } from "@google-cloud/storage";
import type { DIContainer } from "@infrastructure/DIContainer";
import { logger } from "@infrastructure/Logger";
import { getAuth, getFirestore } from "@infrastructure/firebaseAdmin";
import { getRuntimeFlags, resolveAllFlags } from "./feature-flags.ts";

// ────────────────────────────────────────────────────────────────
// Shared helpers
// ────────────────────────────────────────────────────────────────

export const STARTUP_CHECK_TIMEOUT_MS = 20_000;

function withTimeout<T>(label: string, fn: () => Promise<T>): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              `Infrastructure check '${label}' timed out after ${STARTUP_CHECK_TIMEOUT_MS}ms`,
            ),
          ),
        STARTUP_CHECK_TIMEOUT_MS,
      );
      timer.unref();
    }),
  ]);
}

// ────────────────────────────────────────────────────────────────
// Phase 1: Common initialization (both roles)
// ────────────────────────────────────────────────────────────────

async function initializeCommon(container: DIContainer): Promise<void> {
  const isTestEnv =
    process.env.NODE_ENV === "test" ||
    process.env.VITEST ||
    process.env.VITEST_WORKER_ID;

  // Infrastructure startup checks (skip in test) — run in parallel
  if (!isTestEnv) {
    try {
      await Promise.all([
        withTimeout("firebase-auth", async () => {
          const auth = getAuth();
          await auth.listUsers(1);
        }),
        withTimeout("firestore", async () => {
          const firestore = getFirestore();
          await firestore.listCollections();
        }),
        withTimeout("gcs-bucket", async () => {
          const bucket = container.resolve<Bucket>("gcsBucket");
          const [exists] = await bucket.exists();
          if (!exists) {
            throw new Error(
              `Configured GCS bucket does not exist: ${bucket.name}`,
            );
          }
        }),
      ]);

      logger.info("✅ Infrastructure startup checks passed", {
        checks: ["firebase-auth", "firestore", "gcs-bucket"],
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("Infrastructure startup checks failed", error as Error, {
        error: errorMessage,
      });
      throw new Error(`Infrastructure startup checks failed: ${errorMessage}`);
    }
  }

  // Pre-resolve critical services to catch configuration errors early
  const serviceNames = [
    "promptOptimizationService",
    "enhancementService",
    "sceneDetectionService",
    "spanLabelingCacheService",
  ];

  for (const serviceName of serviceNames) {
    try {
      container.resolve(serviceName);
      logger.info("Service initialized", { serviceName });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        "Service initialization failed",
        error instanceof Error ? error : new Error(String(error)),
        { serviceName },
      );
      throw new Error(
        `Service initialization failed for ${serviceName}: ${errorMessage}`,
      );
    }
  }

  logger.info("All services initialized and validated successfully");
}

// ────────────────────────────────────────────────────────────────
// Phase 2a: API-role initialization
// ────────────────────────────────────────────────────────────────

async function initializeApiServices(): Promise<void> {
  // GLiNER warmup (API role only)
  const { warmupGliner } = await import(
    "@llm/span-labeling/nlp/NlpSpanService"
  );
  const { NEURO_SYMBOLIC } = await import(
    "@llm/span-labeling/config/SpanLabelingConfig"
  );
  const shouldWarmGliner =
    NEURO_SYMBOLIC.ENABLED &&
    NEURO_SYMBOLIC.GLINER?.ENABLED &&
    NEURO_SYMBOLIC.GLINER.PREWARM_ON_STARTUP;

  if (shouldWarmGliner) {
    try {
      const glinerResult = await warmupGliner();
      if (glinerResult.success) {
        logger.info("✅ GLiNER model warmed up for semantic extraction");
      } else {
        logger.warn("⚠️ GLiNER warmup skipped", {
          reason: glinerResult.message || "Unknown reason",
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.warn("⚠️ GLiNER warmup failed", { error: errorMessage });
    }
  } else {
    logger.info("ℹ️ GLiNER warmup skipped", {
      reason: "prewarm disabled or GLiNER disabled",
    });
  }
}

async function initializeWorkerServices(container: DIContainer): Promise<void> {
  type Startable = { start(): void };
  const startIfResolved = (name: string): void => {
    const service = container.resolve<Startable | null>(name);
    service?.start();
  };
  startIfResolved("creditRefundSweeper");
  startIfResolved("videoAssetRetentionService");
  const worker = container.resolve<Startable | null>("videoJobWorker");
  if (!getRuntimeFlags().videoWorkerDisabled) {
    const recoverAttachments = container.resolve<() => Promise<void>>(
      "resumePendingVideoAttachments",
    );
    void recoverAttachments().catch((error: unknown) => {
      logger.warn(
        "Clip attachment recovery failed; persisted debt remains pending",
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
    });
    worker?.start();
  }
}

export async function initializeServices(
  container: DIContainer,
): Promise<DIContainer> {
  logger.info("Initializing services...");
  const runtimeFlags = getRuntimeFlags();

  // Surface any deprecated env var names once at startup so operators know to
  // update their deploy configs. Legacy names still work — this is a heads-up.
  const { flags, deprecations } = resolveAllFlags(process.env);
  logger.info("Feature flags resolved", { flags });
  for (const notice of deprecations) {
    logger.warn(notice, { operation: "featureFlags.deprecation" });
  }

  const isTestEnv =
    process.env.NODE_ENV === "test" ||
    process.env.VITEST ||
    process.env.VITEST_WORKER_ID;

  // Phase 1: common initialization (both roles)
  await initializeCommon(container);

  // Phase 2: role-specific initialization
  if (!isTestEnv) {
    if (runtimeFlags.processRole === "api") {
      await initializeApiServices();
      await container.resolve<StudioWorkflowSpendGuard>("workflowSpendGuard").start();
      await container.resolve<WorkflowExecutionService>("workflowExecutionService").initialize();
    } else if (runtimeFlags.processRole === "worker") {
      await initializeWorkerServices(container);
    }
  }

  return container;
}
