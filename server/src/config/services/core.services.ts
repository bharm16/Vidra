import type { DIContainer } from "@infrastructure/DIContainer";
import { logger } from "@infrastructure/Logger";
import { DEFAULT_QWEN_MODEL } from "@config/modelConfig";
import { DEFAULT_GROQ_MODEL } from "@config/llmModelDefaults";
import {
  FirestoreCircuitExecutor,
  setFirestoreCircuitExecutor,
} from "@services/firestore/FirestoreCircuitExecutor";
import { SketchBudgetService } from "@services/sketch-budget/SketchBudgetService";
import { FirestoreSketchBudgetStore } from "@services/sketch-budget/storage/FirestoreSketchBudgetStore";
import { resolveFalApiKey } from "@utils/falApiKey";
import { SIGNED_URL_TTL_MS } from "@config/signedUrlPolicy";
import { resolvePositiveNumber, resolveSignedUrlTtlMs } from "./env-utils.ts";
import { resolveAllFlags } from "../feature-flags.ts";
import { DEFAULT_VIDEO_JOB_LEASE_SECONDS } from "../env.ts";
import type { ServiceConfig } from "./service-config.types.ts";

export function registerCoreServices(container: DIContainer): void {
  // Single-source-of-truth flag resolution. See feature-flags.ts for the canonical flag registry.
  const { flags } = resolveAllFlags(process.env);

  container.registerValue("logger", logger);

  // ── Centralized config: all env-var parsing happens here ──────────────
  container.registerValue("config", {
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      timeout: parseInt(process.env.OPENAI_TIMEOUT_MS || "60000", 10),
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    },
    groq: {
      apiKey: process.env.GROQ_API_KEY,
      timeout: parseInt(process.env.GROQ_TIMEOUT_MS || "5000", 10),
      model: process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL,
    },
    qwen: {
      apiKey: process.env.GROQ_API_KEY,
      timeout: parseInt(process.env.QWEN_TIMEOUT_MS || "10000", 10),
      model: process.env.QWEN_MODEL || DEFAULT_QWEN_MODEL,
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
      timeout: parseInt(process.env.GEMINI_TIMEOUT_MS || "30000", 10),
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      baseURL:
        process.env.GEMINI_BASE_URL ||
        "https://generativelanguage.googleapis.com/v1beta",
    },
    replicate: {
      apiToken: process.env.REPLICATE_API_TOKEN,
    },
    studio: {
      // Boot-validated by env.ts (studioSchema) — a malformed value never
      // reaches this fallback in a running process.
      dailyCapCents: resolvePositiveNumber(
        process.env.STUDIO_DAILY_SPEND_CAP_CENTS,
        500,
        1,
      ),
    },
    fal: {
      apiKey: resolveFalApiKey() || undefined,
      // Boot-validated by env.ts (sketchRelaySchema). Same reset boundary and
      // same default as the studio's cap — a creator's two daily allowances
      // roll over together at UTC midnight.
      sketchDailyCapCents: resolvePositiveNumber(
        process.env.SKETCH_DAILY_SPEND_CAP_CENTS,
        500,
        1,
      ),
      sketchFrameCostMillicents: resolvePositiveNumber(
        process.env.SKETCH_FRAME_COST_MILLICENTS,
        300,
        1,
      ),
    },
    redis: {
      defaultTTL: 3600,
      shortTTL: 300,
      maxMemoryCacheSize: 100,
    },
    server: {
      port: process.env.PORT || 3001,
      environment: process.env.NODE_ENV || "development",
    },
    credits: {
      refundSweeper: {
        disabled: !flags.creditRefundSweeperEnabled,
        intervalSeconds: resolvePositiveNumber(
          process.env.CREDIT_REFUND_SWEEP_INTERVAL_SECONDS,
          60,
          1,
        ),
        maxPerRun: resolvePositiveNumber(
          process.env.CREDIT_REFUND_SWEEP_MAX,
          25,
          1,
        ),
        maxAttempts: resolvePositiveNumber(
          process.env.CREDIT_REFUND_MAX_ATTEMPTS,
          20,
          1,
        ),
      },
    },
    videoJobs: {
      maxAttempts: resolvePositiveNumber(
        process.env.VIDEO_JOB_MAX_ATTEMPTS,
        3,
        1,
      ),
      hostname: process.env.HOSTNAME,
      worker: {
        pollIntervalMs: resolvePositiveNumber(
          process.env.VIDEO_JOB_POLL_INTERVAL_MS,
          2000,
          1,
        ),
        // Lease must exceed heartbeatInterval × MAX_HEARTBEAT_FAILURES
        // (20s × 3 = 60s). At the prior 60s default, the heartbeat-failure
        // window equaled the lease — leaving zero margin between "this worker
        // is unhealthy" and "another worker may claim the lease." The shared
        // default (env.ts) gives a 30s margin so the unhealthy state can be
        // detected before the lease expires.
        leaseSeconds: resolvePositiveNumber(
          process.env.VIDEO_JOB_LEASE_SECONDS,
          DEFAULT_VIDEO_JOB_LEASE_SECONDS,
          1,
        ),
        maxConcurrent: resolvePositiveNumber(
          process.env.VIDEO_JOB_MAX_CONCURRENT,
          2,
          1,
        ),
        heartbeatIntervalMs: resolvePositiveNumber(
          process.env.VIDEO_JOB_HEARTBEAT_INTERVAL_MS,
          20_000,
          1,
        ),
        perProviderMaxConcurrent: (() => {
          const v = Number.parseInt(
            process.env.VIDEO_JOB_PER_PROVIDER_MAX_CONCURRENT || "",
            10,
          );
          return Number.isFinite(v) && v > 0 ? v : undefined;
        })(),
      },
      providerCircuit: {
        failureRateThreshold: resolvePositiveNumber(
          process.env.VIDEO_PROVIDER_CIRCUIT_FAILURE_RATE,
          0.6,
          0.01,
        ),
        minVolume: resolvePositiveNumber(
          process.env.VIDEO_PROVIDER_CIRCUIT_MIN_VOLUME,
          20,
          1,
        ),
        cooldownMs: resolvePositiveNumber(
          process.env.VIDEO_PROVIDER_CIRCUIT_COOLDOWN_MS,
          60_000,
          1,
        ),
        maxSamples: resolvePositiveNumber(
          process.env.VIDEO_PROVIDER_CIRCUIT_MAX_SAMPLES,
          50,
          1,
        ),
      },
    },
    videoAssets: {
      retention: {
        disabled: !flags.videoAssetRetentionEnabled,
        retentionHours: resolvePositiveNumber(
          process.env.VIDEO_ASSET_RETENTION_HOURS,
          24,
          1,
        ),
        cleanupIntervalMinutes: resolvePositiveNumber(
          process.env.VIDEO_ASSET_CLEANUP_INTERVAL_MINUTES,
          15,
          1,
        ),
        batchSize: resolvePositiveNumber(
          process.env.VIDEO_ASSET_CLEANUP_BATCH_SIZE,
          100,
          1,
        ),
      },
      storage: {
        basePath: process.env.VIDEO_STORAGE_BASE_PATH || "video-previews",
        signedUrlTtlMs: resolveSignedUrlTtlMs(
          process.env.VIDEO_STORAGE_SIGNED_URL_TTL_SECONDS,
          SIGNED_URL_TTL_MS.view,
        ),
        cacheControl:
          process.env.VIDEO_STORAGE_CACHE_CONTROL || "public, max-age=86400",
      },
      access: {
        tokenSecret: process.env.VIDEO_CONTENT_TOKEN_SECRET,
        previousTokenSecrets: (
          process.env.VIDEO_CONTENT_TOKEN_SECRET_PREVIOUS ?? ""
        )
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
        tokenTtlSeconds: resolvePositiveNumber(
          process.env.VIDEO_CONTENT_TOKEN_TTL_SECONDS,
          3600,
          1,
        ),
      },
    },
    imageAssets: {
      storage: {
        basePath: process.env.IMAGE_STORAGE_BASE_PATH || "image-previews",
        signedUrlTtlMs: resolveSignedUrlTtlMs(
          process.env.IMAGE_STORAGE_SIGNED_URL_TTL_SECONDS,
          SIGNED_URL_TTL_MS.view,
        ),
        cacheControl:
          process.env.IMAGE_STORAGE_CACHE_CONTROL || "public, max-age=86400",
      },
    },
    videoProviders: {
      pollTimeoutMs: resolvePositiveNumber(
        process.env.VIDEO_PROVIDER_POLL_TIMEOUT_MS,
        270_000,
        1,
      ),
      workflowTimeoutMs: resolvePositiveNumber(
        process.env.VIDEO_WORKFLOW_TIMEOUT_MS,
        300_000,
        1,
      ),
      imagePreviewProvider: process.env.IMAGE_PREVIEW_PROVIDER,
      imagePreviewProviderOrder: (
        process.env.IMAGE_PREVIEW_PROVIDER_ORDER || ""
      )
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      credentials: {
        replicateApiToken: process.env.REPLICATE_API_TOKEN,
        geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
        geminiBaseUrl: process.env.GEMINI_BASE_URL,
      },
    },
    capabilities: {
      probeUrl: process.env.CAPABILITIES_PROBE_URL,
      probePath: process.env.CAPABILITIES_PROBE_PATH,
      probeRefreshMs: resolvePositiveNumber(
        process.env.CAPABILITIES_PROBE_REFRESH_MS,
        6 * 60 * 60 * 1000,
        1,
      ),
    },
    promptOptimization: {
      shotPlanCacheTtlMs: resolvePositiveNumber(
        process.env.SHOT_PLAN_CACHE_TTL_MS,
        300_000,
        1,
      ),
      shotPlanCacheMax: resolvePositiveNumber(
        process.env.SHOT_PLAN_CACHE_MAX,
        200,
        1,
      ),
    },
    enhancement: {
      policyVersion: process.env.ENHANCEMENT_POLICY_VERSION || "2026-03-v2a",
    },
    firestore: {
      circuit: {
        timeoutMs: resolvePositiveNumber(
          process.env.FIRESTORE_CIRCUIT_TIMEOUT_MS,
          3000,
          1,
        ),
        errorThresholdPercent: resolvePositiveNumber(
          process.env.FIRESTORE_CIRCUIT_ERROR_THRESHOLD_PERCENT,
          50,
          1,
        ),
        resetTimeoutMs: resolvePositiveNumber(
          process.env.FIRESTORE_CIRCUIT_RESET_TIMEOUT_MS,
          15000,
          1,
        ),
        minVolume: resolvePositiveNumber(
          process.env.FIRESTORE_CIRCUIT_MIN_VOLUME,
          20,
          1,
        ),
        maxRetries: resolvePositiveNumber(
          process.env.FIRESTORE_CIRCUIT_MAX_RETRIES,
          2,
          0,
        ),
        retryBaseDelayMs: resolvePositiveNumber(
          process.env.FIRESTORE_CIRCUIT_RETRY_BASE_DELAY_MS,
          120,
          1,
        ),
        retryJitterMs: resolvePositiveNumber(
          process.env.FIRESTORE_CIRCUIT_RETRY_JITTER_MS,
          80,
          0,
        ),
      },
      readiness: {
        maxFailureRate: resolvePositiveNumber(
          process.env.FIRESTORE_READINESS_MAX_FAILURE_RATE,
          0.5,
          0,
        ),
        maxLatencyMs: resolvePositiveNumber(
          process.env.FIRESTORE_READINESS_MAX_LATENCY_MS,
          1500,
          1,
        ),
      },
    },
    idempotency: {
      pendingLockTtlMs: resolvePositiveNumber(
        process.env.VIDEO_GENERATE_IDEMPOTENCY_PENDING_TTL_MS,
        6 * 60 * 1000,
        60_000,
      ),
      replayTtlMs: resolvePositiveNumber(
        process.env.VIDEO_GENERATE_IDEMPOTENCY_REPLAY_TTL_MS,
        24 * 60 * 60 * 1000,
        60_000,
      ),
    },
  } satisfies ServiceConfig);

  // ── Firestore circuit breaker (reads from config instead of raw env vars) ──
  container.register(
    "firestoreCircuitExecutor",
    (config: ServiceConfig) => {
      const fc = config.firestore.circuit;
      const fr = config.firestore.readiness;
      const executor = new FirestoreCircuitExecutor({
        timeoutMs: fc.timeoutMs,
        errorThresholdPercentage: fc.errorThresholdPercent,
        resetTimeoutMs: fc.resetTimeoutMs,
        volumeThreshold: fc.minVolume,
        maxRetries: fc.maxRetries,
        retryBaseDelayMs: fc.retryBaseDelayMs,
        retryJitterMs: fc.retryJitterMs,
        readinessMaxFailureRate: fr.maxFailureRate,
        readinessMaxLatencyMs: fr.maxLatencyMs,
      });
      setFirestoreCircuitExecutor(executor);
      return executor;
    },
    ["config"],
  );

  // Sketch relay admission budget (issue #84) — a Firestore-backed daily
  // counter with no domain of its own, so it registers here rather than
  // pulling a registration file into existence for one service.
  container.register(
    "sketchBudgetService",
    (config: ServiceConfig) =>
      new SketchBudgetService({
        store: new FirestoreSketchBudgetStore(),
        dailyCapCents: config.fal.sketchDailyCapCents,
        frameCostMillicents: config.fal.sketchFrameCostMillicents,
        now: () => new Date(),
      }),
    ["config"],
  );
}
