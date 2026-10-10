import type { Bucket } from "@google-cloud/storage";
import type { DIContainer } from "@infrastructure/DIContainer";
import { logger } from "@infrastructure/Logger";
import { getAuth, getFirestore } from "@infrastructure/firebaseAdmin";
import type { LLMClient } from "@clients/LLMClient";
import type { CapabilitiesProbeService } from "@services/capabilities/CapabilitiesProbeService";
import { getRuntimeFlags, resolveAllFlags } from "./feature-flags.ts";

// ────────────────────────────────────────────────────────────────
// Shared helpers
// ────────────────────────────────────────────────────────────────

interface HealthCheckResult {
  healthy: boolean;
  error?: string;
  responseTime?: number;
}

interface LLMClientValidationConfig {
  client: LLMClient;
  serviceName: string;
  successMessage: string;
  unhealthyMessage: string;
  failureMessage: string;
  allowUnhealthy?: boolean;
  disableUnhealthyMessage?: string;
  keepUnhealthyMessage?: string;
}

async function validateLLMClient(
  container: DIContainer,
  config: LLMClientValidationConfig,
): Promise<void> {
  try {
    const health = (await config.client.healthCheck()) as HealthCheckResult;

    if (!health.healthy) {
      logger.warn(config.unhealthyMessage, {
        error: health.error,
      });

      if (!config.allowUnhealthy) {
        if (config.disableUnhealthyMessage) {
          logger.warn(config.disableUnhealthyMessage);
        }
        container.registerValue(config.serviceName, null);
      } else if (config.keepUnhealthyMessage) {
        logger.warn(config.keepUnhealthyMessage);
      }

      return;
    }

    logger.info(config.successMessage, {
      responseTime: health.responseTime,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.warn(config.failureMessage, {
      error: errorMessage,
    });

    if (!config.allowUnhealthy) {
      if (config.disableUnhealthyMessage) {
        logger.warn(config.disableUnhealthyMessage);
      }
      container.registerValue(config.serviceName, null);
    } else if (config.keepUnhealthyMessage) {
      logger.warn(config.keepUnhealthyMessage);
    }
  }
}

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
  const runtimeFlags = getRuntimeFlags();

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

  // Validate LLM clients — run in parallel
  const openAIClient = container.resolve<LLMClient | null>("openAIClient");
  const groqClient = container.resolve<LLMClient | null>("groqClient");
  const qwenClient = container.resolve<LLMClient | null>("qwenClient");
  const geminiClient = container.resolve<LLMClient | null>("geminiClient");

  const llmValidations: Promise<void>[] = [];

  if (openAIClient) {
    logger.info("Validating OpenAI API key...");
    llmValidations.push(
      validateLLMClient(container, {
        client: openAIClient,
        serviceName: "openAIClient",
        successMessage: "✅ OpenAI API key validated successfully",
        unhealthyMessage:
          "⚠️  OpenAI API key validation failed - OpenAI adapter disabled",
        failureMessage:
          "⚠️  Failed to validate OpenAI API key - OpenAI adapter disabled",
      }),
    );
  } else {
    logger.warn("OpenAI client not configured; relying on other providers");
  }

  if (groqClient) {
    logger.info("Groq client initialized for adapter-based routing");
    llmValidations.push(
      validateLLMClient(container, {
        client: groqClient,
        serviceName: "groqClient",
        successMessage: "✅ Groq API key validated successfully",
        unhealthyMessage:
          "⚠️  Groq API key validation failed - Groq adapter disabled",
        failureMessage:
          "⚠️  Failed to validate Groq API key - Groq adapter disabled",
      }),
    );
  }

  if (qwenClient) {
    logger.info("Qwen client initialized for adapter-based routing");
    llmValidations.push(
      validateLLMClient(container, {
        client: qwenClient,
        serviceName: "qwenClient",
        successMessage: "✅ Qwen API key validated successfully",
        unhealthyMessage:
          "⚠️  Qwen API key validation failed - adapter disabled",
        failureMessage:
          "⚠️  Failed to validate Qwen API key - adapter disabled",
      }),
    );
  }

  if (geminiClient) {
    logger.info("Gemini client initialized for adapter-based routing");
    const allowUnhealthyGemini = runtimeFlags.allowUnhealthyGemini;
    llmValidations.push(
      validateLLMClient(container, {
        client: geminiClient,
        serviceName: "geminiClient",
        successMessage: "✅ Gemini API key validated successfully",
        unhealthyMessage: "⚠️  Gemini API key validation failed",
        failureMessage: "⚠️  Failed to validate Gemini API key",
        allowUnhealthy: allowUnhealthyGemini,
        disableUnhealthyMessage:
          "⚠️  Gemini adapter disabled (health check failed)",
        keepUnhealthyMessage:
          "Keeping Gemini adapter enabled despite failed health check",
      }),
    );
  }

  await Promise.all(llmValidations);

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

  // Pre-warm LLM provider connections in the background (non-blocking)
  const llmClientsToWarm = [
    openAIClient,
    groqClient,
    qwenClient,
    geminiClient,
  ].filter((c): c is LLMClient => c !== null);
  if (llmClientsToWarm.length > 0 && !isTestEnv) {
    Promise.allSettled(
      llmClientsToWarm.map((client) =>
        client.healthCheck().catch(() => {
          /* best-effort warmup */
        }),
      ),
    ).then((results) => {
      const warmed = results.filter((r) => r.status === "fulfilled").length;
      logger.info("LLM connection pre-warming complete", {
        warmed,
        total: llmClientsToWarm.length,
      });
    });
  }

  const capabilitiesProbe = container.resolve<CapabilitiesProbeService | null>(
    "capabilitiesProbeService",
  );
  if (capabilitiesProbe) {
    try {
      capabilitiesProbe.start();
    } catch (error) {
      logger.warn("Capabilities probe failed to start", {
        error: error instanceof Error ? error.message : String(error),
      });
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
  const worker = container.resolve<
    (Startable & { resetPollInterval(): void }) | null
  >("videoJobWorker");
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
  const circuits = container.resolve<{
    onRecovery(cb: (provider: string) => void): void;
  }>("providerCircuitManager");
  if (worker) circuits.onRecovery(() => worker.resetPollInterval());
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
    } else if (runtimeFlags.processRole === "worker") {
      await initializeWorkerServices(container);
    }
  }

  return container;
}
