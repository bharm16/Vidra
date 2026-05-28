/**
 * Zod-based environment variable validation.
 *
 * Validates and coerces all server env vars at startup, failing fast with
 * a complete list of errors rather than surfacing issues one at a time
 * when individual services attempt to read them.
 */

import { z } from "zod";
import { logger } from "@infrastructure/Logger";

// ─── Reusable coercion helpers ─────────────────────────────────

const optionalString = () => z.string().optional();
const optionalApiKey = () => z.string().min(1).optional();
const coercePositiveInt = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);
const coerceNonNegativeNumber = (fallback: number) =>
  z.coerce.number().min(0).default(fallback);
const coerceBooleanString = (fallback: boolean) =>
  z
    .string()
    .default(String(fallback))
    .transform((v) => v === "true");

/**
 * Strict boolean env var: requires exactly "true" or "false". Fails validation
 * on other values (e.g. "yes", "1", "garbage"). Use for canonical flag names
 * where typos should surface at boot rather than silently falling to `false`.
 */
const strictBooleanString = (fallback: boolean) =>
  z
    .enum(["true", "false"])
    .default(String(fallback) as "true" | "false")
    .transform((v) => v === "true");

// ─── Domain schemas ────────────────────────────────────────────

const serverSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65535).default(3001),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PROCESS_ROLE: z.enum(["api", "worker"]).optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),
});

// Only flags with real boot-time validation live here:
// - ENABLE_CONVERGENCE: safety-first default (anything-not-"false" → true).
// - UNHANDLED_REJECTION_MODE: strict enum.
// - *_ENABLED: strict "true"/"false" — typos fail boot.
// All other flag resolution (including alias handling) is owned by feature-flags.ts.
const featureFlagSchema = z.object({
  ENABLE_CONVERGENCE: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
  UNHANDLED_REJECTION_MODE: z
    .enum(["classified", "strict"])
    .default("classified"),
  WEBHOOK_RECONCILIATION_ENABLED: strictBooleanString(true),
  BILLING_PROFILE_REPAIR_ENABLED: strictBooleanString(true),
  CREDIT_REFUND_SWEEPER_ENABLED: strictBooleanString(true),
  CREDIT_RECONCILIATION_ENABLED: strictBooleanString(true),
  VIDEO_JOB_SWEEPER_ENABLED: strictBooleanString(true),
  VIDEO_DLQ_REPROCESSOR_ENABLED: strictBooleanString(true),
  VIDEO_ASSET_RETENTION_ENABLED: strictBooleanString(true),
  VIDEO_ASSET_RECONCILER_ENABLED: strictBooleanString(false),
  CONTINUITY_CLIP_ENABLED: strictBooleanString(true),
});

const openaiSchema = z.object({
  OPENAI_API_KEY: optionalApiKey(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_TIMEOUT_MS: coercePositiveInt(60000),
  OPENAI_MAX_CONCURRENT: coercePositiveInt(5),
  OPENAI_QUEUE_TIMEOUT_MS: coercePositiveInt(30000),
});

const groqSchema = z.object({
  GROQ_API_KEY: optionalApiKey(),
  GROQ_MODEL: z.string().default("llama-3.1-8b-instant"),
  GROQ_TIMEOUT_MS: coercePositiveInt(5000),
  GROQ_MAX_CONCURRENT: coercePositiveInt(5),
  GROQ_QUEUE_TIMEOUT_MS: coercePositiveInt(30000),
});

const geminiSchema = z.object({
  GEMINI_API_KEY: optionalApiKey(),
  GOOGLE_API_KEY: optionalApiKey(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  GEMINI_TIMEOUT_MS: coercePositiveInt(30000),
  GEMINI_MAX_CONCURRENT: coercePositiveInt(5),
  GEMINI_QUEUE_TIMEOUT_MS: coercePositiveInt(30000),
  GEMINI_BASE_URL: z
    .string()
    .default("https://generativelanguage.googleapis.com/v1beta"),
});

const qwenSchema = z.object({
  QWEN_MODEL: z.string().default("qwen/qwen3-32b"),
  QWEN_TIMEOUT_MS: coercePositiveInt(10000),
});

const firebaseSchema = z.object({
  VITE_FIREBASE_API_KEY: z.string().min(1, "VITE_FIREBASE_API_KEY is required"),
  VITE_FIREBASE_PROJECT_ID: z
    .string()
    .min(1, "VITE_FIREBASE_PROJECT_ID is required"),
  VITE_FIREBASE_AUTH_DOMAIN: optionalString(),
  VITE_FIREBASE_STORAGE_BUCKET: optionalString(),
  VITE_FIREBASE_MESSAGING_SENDER_ID: optionalString(),
  VITE_FIREBASE_APP_ID: optionalString(),
  VITE_FIREBASE_MEASUREMENT_ID: optionalString(),
  GOOGLE_APPLICATION_CREDENTIALS: optionalString(),
  // Firebase Admin auth: either a service-account JSON file (PATH) or the
  // JSON blob inline (JSON). Both are read by infrastructure/firebaseAdmin.ts
  // with fallback to Application Default Credentials.
  FIREBASE_SERVICE_ACCOUNT_PATH: optionalString(),
  FIREBASE_SERVICE_ACCOUNT_JSON: optionalString(),
});

const storageSchema = z.object({
  GCS_BUCKET_NAME: optionalString(),
  FIREBASE_STORAGE_BUCKET: optionalString(),
  IMAGE_STORAGE_BUCKET: optionalString(),
  VIDEO_STORAGE_BUCKET: optionalString(),
  ASSET_STORAGE_BUCKET: optionalString(),
  SPAN_LABELING_MODELS_GCS_URI: optionalString(),
  VIDEO_STORAGE_BASE_PATH: z.string().default("video-previews"),
  IMAGE_STORAGE_BASE_PATH: z.string().default("image-previews"),
  VIDEO_STORAGE_SIGNED_URL_TTL_SECONDS: z.coerce.number().positive().optional(),
  IMAGE_STORAGE_SIGNED_URL_TTL_SECONDS: z.coerce.number().positive().optional(),
  VIDEO_STORAGE_CACHE_CONTROL: z.string().default("public, max-age=86400"),
  IMAGE_STORAGE_CACHE_CONTROL: z.string().default("public, max-age=86400"),
});

const videoGenerationSchema = z.object({
  REPLICATE_API_TOKEN: optionalApiKey(),
  FAL_KEY: optionalApiKey(),
  FAL_API_KEY: optionalApiKey(),
  FAL_KEY_ID: optionalString(),
  FAL_KEY_SECRET: optionalString(),
  LUMA_API_KEY: optionalApiKey(),
  LUMAAI_API_KEY: optionalApiKey(),
  KLING_API_KEY: optionalApiKey(),
  KLING_API_BASE_URL: optionalString(),
  IMAGE_PREVIEW_PROVIDER: optionalString(),
  IMAGE_PREVIEW_PROVIDER_ORDER: optionalString(),
});

const videoJobSchema = z.object({
  VIDEO_JOB_MAX_ATTEMPTS: coercePositiveInt(3),
  // Must be > VIDEO_JOB_HEARTBEAT_INTERVAL_MS × MAX_HEARTBEAT_FAILURES
  // (20s × 3 = 60s). 90s leaves a 30s safety margin so a 60s heartbeat-failure
  // window doesn't exactly equal the lease (phantom-takeover risk).
  VIDEO_JOB_LEASE_SECONDS: coercePositiveInt(90),
  VIDEO_JOB_HEARTBEAT_INTERVAL_MS: coercePositiveInt(20000),
  VIDEO_JOB_STALE_QUEUE_SECONDS: coercePositiveInt(300),
  VIDEO_JOB_STALE_QUEUE_MINUTES: z.coerce.number().int().positive().optional(),
  VIDEO_JOB_STALE_PROCESSING_SECONDS: coercePositiveInt(90),
  VIDEO_JOB_STALE_PROCESSING_MINUTES: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  VIDEO_JOB_SWEEP_INTERVAL_SECONDS: coercePositiveInt(15),
  VIDEO_JOB_SWEEP_MAX: coercePositiveInt(25),
  VIDEO_PROVIDER_POLL_TIMEOUT_MS: coercePositiveInt(270000),
  VIDEO_WORKFLOW_TIMEOUT_MS: coercePositiveInt(300000),
  VIDEO_JOB_POLL_INTERVAL_MS: coercePositiveInt(2000),
  VIDEO_JOB_MAX_CONCURRENT: coercePositiveInt(2),
  VIDEO_JOB_PER_PROVIDER_MAX_CONCURRENT: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  VIDEO_PROVIDER_CIRCUIT_FAILURE_RATE: coerceNonNegativeNumber(0.6),
  VIDEO_PROVIDER_CIRCUIT_MIN_VOLUME: coercePositiveInt(20),
  VIDEO_PROVIDER_CIRCUIT_COOLDOWN_MS: coercePositiveInt(60000),
  VIDEO_PROVIDER_CIRCUIT_MAX_SAMPLES: coercePositiveInt(50),
  VIDEO_DLQ_POLL_INTERVAL_MS: coercePositiveInt(30000),
  VIDEO_DLQ_MAX_ENTRIES_PER_RUN: coercePositiveInt(5),
  VIDEO_GENERATE_IDEMPOTENCY_PENDING_TTL_MS: coercePositiveInt(360000),
  VIDEO_GENERATE_IDEMPOTENCY_REPLAY_TTL_MS: coercePositiveInt(86400000),
  VIDEO_WORKER_SHUTDOWN_DRAIN_SECONDS: coercePositiveInt(45),
  VIDEO_WORKER_HEARTBEAT_MAX_AGE_MS: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  VIDEO_CONTENT_TOKEN_SECRET: optionalString(),
  VIDEO_CONTENT_TOKEN_SECRET_PREVIOUS: optionalString(),
  VIDEO_CONTENT_TOKEN_TTL_SECONDS: coercePositiveInt(3600),
});

const videoAssetsSchema = z.object({
  VIDEO_ASSET_RETENTION_HOURS: coercePositiveInt(24),
  VIDEO_ASSET_CLEANUP_INTERVAL_MINUTES: coercePositiveInt(15),
  VIDEO_ASSET_CLEANUP_BATCH_SIZE: coercePositiveInt(100),
  VIDEO_ASSET_RECONCILER_ORPHAN_THRESHOLD_MS: coercePositiveInt(3_600_000),
  VIDEO_ASSET_RECONCILER_INTERVAL_MS: coercePositiveInt(300_000),
  VIDEO_ASSET_RECONCILER_MAX_PER_RUN: coercePositiveInt(50),
});

const firestoreCircuitSchema = z.object({
  FIRESTORE_CIRCUIT_TIMEOUT_MS: coercePositiveInt(3000),
  FIRESTORE_CIRCUIT_ERROR_THRESHOLD_PERCENT: coercePositiveInt(50),
  FIRESTORE_CIRCUIT_RESET_TIMEOUT_MS: coercePositiveInt(15000),
  FIRESTORE_CIRCUIT_MIN_VOLUME: coercePositiveInt(20),
  FIRESTORE_CIRCUIT_MAX_RETRIES: coerceNonNegativeNumber(2),
  FIRESTORE_CIRCUIT_RETRY_BASE_DELAY_MS: coercePositiveInt(120),
  FIRESTORE_CIRCUIT_RETRY_JITTER_MS: coerceNonNegativeNumber(80),
  FIRESTORE_READINESS_MAX_FAILURE_RATE: coerceNonNegativeNumber(0.5),
  FIRESTORE_READINESS_MAX_LATENCY_MS: coercePositiveInt(1500),
});

const creditSchema = z.object({
  CREDIT_RECONCILIATION_INCREMENTAL_SCAN_LIMIT: coercePositiveInt(500),
  CREDIT_RECONCILIATION_FULL_PAGE_SIZE: coercePositiveInt(200),
  CREDIT_RECONCILIATION_INCREMENTAL_INTERVAL_SECONDS: coercePositiveInt(3600),
  CREDIT_RECONCILIATION_FULL_INTERVAL_HOURS: coercePositiveInt(24),
  CREDIT_RECONCILIATION_MAX_INTERVAL_SECONDS: coercePositiveInt(21600),
  CREDIT_RECONCILIATION_BACKOFF_FACTOR: coerceNonNegativeNumber(2),
  CREDIT_REFUND_SWEEP_INTERVAL_SECONDS: coercePositiveInt(60),
  CREDIT_REFUND_SWEEP_MAX: coercePositiveInt(25),
  CREDIT_REFUND_MAX_ATTEMPTS: coercePositiveInt(20),
  FREE_TIER_STARTER_CREDITS: z.coerce.number().int().min(0).default(25),
});

const billingSchema = z.object({
  STRIPE_SECRET_KEY: optionalApiKey(),
  STRIPE_WEBHOOK_SECRET: optionalApiKey(),
  STRIPE_PRICE_CREDITS: optionalString(),
  WEBHOOK_RECONCILIATION_INTERVAL_SECONDS: coercePositiveInt(300),
  WEBHOOK_RECONCILIATION_LOOKBACK_HOURS: coercePositiveInt(72),
  BILLING_PROFILE_REPAIR_INTERVAL_SECONDS: coercePositiveInt(60),
  BILLING_PROFILE_REPAIR_MAX_PER_RUN: coercePositiveInt(25),
  BILLING_PROFILE_REPAIR_MAX_ATTEMPTS: coercePositiveInt(20),
});

const redisSchema = z.object({
  REDIS_URL: optionalString(),
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_PASSWORD: optionalString(),
  REDIS_DB: z.coerce.number().int().min(0).default(0),
  REDIS_DISABLED: coerceBooleanString(false),
  REDIS_ENABLE_OFFLINE_QUEUE: coerceBooleanString(false),
});

const securitySchema = z.object({
  API_KEY: optionalApiKey(),
  ALLOWED_API_KEYS: optionalString(),
  ALLOWED_ORIGINS: optionalString(),
  FRONTEND_URL: optionalString(),
});

const observabilitySchema = z.object({
  SENTRY_DSN: optionalString(),
  SENTRY_DEBUG: coerceBooleanString(false),
  APP_VERSION: optionalString(),
  // Structured logging stack-trace controls — consumed by infrastructure/Logger.ts
  LOG_STACK: coerceBooleanString(false),
  LOG_STACK_LEVELS: z.string().default("warn,error"),
  LOG_STACK_DEPTH: coercePositiveInt(6),
  LOG_STACK_LIMIT: z.coerce.number().int().positive().optional(),
  LOG_CALLER: coerceBooleanString(false),
});

const startupSchema = z.object({
  SERVICE_STARTUP_HEALTHCHECKS: coerceBooleanString(false),
  SERVICE_STARTUP_PRE_RESOLVE: coerceBooleanString(false),
  DEPTH_ESTIMATION_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  DEPTH_ESTIMATION_COLD_START_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
});

const capabilitiesSchema = z.object({
  CAPABILITIES_PROBE_URL: optionalString(),
  CAPABILITIES_PROBE_PATH: optionalString(),
  CAPABILITIES_PROBE_REFRESH_MS: coercePositiveInt(6 * 60 * 60 * 1000),
});

const convergenceSchema = z.object({
  DEPTH_ESTIMATION_WARMUP_RETRY_TIMEOUT_MS: coercePositiveInt(20_000),
  DEPTH_WARMUP_ON_STARTUP: coerceBooleanString(true),
  DEPTH_WARMUP_TIMEOUT_MS: coercePositiveInt(60_000),
  // FAL_DEPTH_WARMUP_ENABLED default is NODE_ENV-dependent (see core.services.ts);
  // declared here as optional for pass-through validation only.
  FAL_DEPTH_WARMUP_ENABLED: optionalString(),
  FAL_DEPTH_WARMUP_IMAGE_URL: optionalString(),
  FAL_DEPTH_WARMUP_INTERVAL_MS: coercePositiveInt(120_000),
  CONVERGENCE_STORAGE_SIGNED_URL_TTL_SECONDS: coercePositiveInt(86_400),
  IP_ADAPTER_MODEL: optionalString(),
});

const enhancementSchema = z.object({
  ENHANCEMENT_POLICY_VERSION: z.string().default("2026-03-v2a"),
  SHOT_PLAN_CACHE_TTL_MS: coercePositiveInt(300_000),
  SHOT_PLAN_CACHE_MAX: coercePositiveInt(200),
});

const spanLabelingSchema = z.object({
  // Provider/model for span-labeling LLM calls. Independent of main LLM config
  // so span labeling can run on a cheaper/faster model than primary prompts.
  SPAN_PROVIDER: optionalString(),
  SPAN_MODEL: optionalString(),
  SPAN_LABELING_PROVIDER: optionalString(),
});

const devSchema = z.object({
  ALLOW_DEV_CROSS_USER_SESSIONS: coerceBooleanString(false),
  RUN_FAL_INTEGRATION: coerceBooleanString(false),
});

// ─── Eval / test-script overrides ──────────────────────────────────
// The following env vars are intentionally NOT validated here. They're
// read by scripts/test-models-comparison.ts, evaluation harnesses, and
// per-LLM-call overrides that should be *absent* in normal runtime.
// Validating them here would force callers to set them. See scripts/README.md.
//
// Eval overrides: CATEGORIZE_MODEL, CATEGORIZE_PROVIDER, ENHANCE_MODEL,
//   ENHANCE_PROVIDER, JUDGE_MODEL, JUDGE_PROVIDER, JUDGE_GENERAL_MODEL,
//   JUDGE_GENERAL_PROVIDER, OPTIMIZE_MODEL, OPTIMIZE_PROVIDER,
//   QUESTION_MODEL, QUESTION_PROVIDER, ROLE_MODEL, ROLE_PROVIDER,
//   I2V_PARSE_MODEL, I2V_PARSE_PROVIDER, IMAGE_OBSERVATION_MODEL,
//   IMAGE_OBSERVATION_PROVIDER, VIDEO_PROMPT_IR_MODEL,
//   VIDEO_PROMPT_REWRITE_MODEL, VIDEO_MODEL, VIDEO_PROVIDER,
//   DRAFT_I2V_MODEL, WAN_2_5_I2V_MODEL, PROVIDER, CUSTOM_PROVIDER,
//   MODEL_TIER_REQUIREMENTS, FACE_SWAP_TEST_FACE_URL, FACE_SWAP_TEST_TARGET_URL.
// Test-runner vars set by Vitest/Codex: VITEST, VITEST_WORKER_ID, CODEX_SANDBOX.

// ─── Composite schema ──────────────────────────────────────────

const envSchema = serverSchema
  .merge(featureFlagSchema)
  .merge(openaiSchema)
  .merge(groqSchema)
  .merge(geminiSchema)
  .merge(qwenSchema)
  .merge(firebaseSchema)
  .merge(storageSchema)
  .merge(videoGenerationSchema)
  .merge(videoJobSchema)
  .merge(videoAssetsSchema)
  .merge(firestoreCircuitSchema)
  .merge(creditSchema)
  .merge(billingSchema)
  .merge(redisSchema)
  .merge(securitySchema)
  .merge(observabilitySchema)
  .merge(startupSchema)
  .merge(capabilitiesSchema)
  .merge(convergenceSchema)
  .merge(enhancementSchema)
  .merge(spanLabelingSchema)
  .merge(devSchema)
  .passthrough();

// ─── Production refinements ────────────────────────────────────

const envSchemaWithRefinements = envSchema.superRefine((data, ctx) => {
  if (data.NODE_ENV === "production") {
    if (!data.ALLOWED_ORIGINS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ALLOWED_ORIGINS is required in production",
        path: ["ALLOWED_ORIGINS"],
      });
    }
    if (!data.FRONTEND_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "FRONTEND_URL is required in production",
        path: ["FRONTEND_URL"],
      });
    }
    if (!data.GCS_BUCKET_NAME) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "GCS_BUCKET_NAME is required in production",
        path: ["GCS_BUCKET_NAME"],
      });
    }
  }
});

export type ValidatedEnv = z.infer<typeof envSchema>;

// ─── Public API ────────────────────────────────────────────────

/**
 * Parse and validate environment variables. Collects ALL errors and
 * throws once with a complete list, rather than failing on the first.
 */
export function parseEnv(env: NodeJS.ProcessEnv = process.env): ValidatedEnv {
  const result = envSchemaWithRefinements.safeParse(env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Environment validation failed:\n${formatted}\n\nThe Zod schema in server/src/config/env.ts is the authoritative list of required/optional vars. Feature-flag toggles live in server/src/config/feature-flags.ts (see CLAUDE.md "Feature Flags").`,
    );
  }

  return result.data;
}

/**
 * Emit advisory warnings for non-fatal env issues (missing LLM keys,
 * non-standard key formats, single-key rotation suggestion).
 * Called after parseEnv succeeds.
 */
export function emitEnvWarnings(env: ValidatedEnv): void {
  const log = logger.child({ service: "validateEnv" });

  const hasLlmProvider = Boolean(
    env.OPENAI_API_KEY ||
      env.GROQ_API_KEY ||
      env.GEMINI_API_KEY ||
      env.GOOGLE_API_KEY,
  );

  if (!hasLlmProvider) {
    log.warn(
      "No LLM provider API keys configured; AI features will be disabled",
      {
        operation: "validateEnv",
        hasOpenAi: Boolean(env.OPENAI_API_KEY),
        hasGroq: Boolean(env.GROQ_API_KEY),
        hasGemini: Boolean(env.GEMINI_API_KEY),
        hasGoogle: Boolean(env.GOOGLE_API_KEY),
      },
    );
  } else {
    const openaiKey = env.OPENAI_API_KEY;
    if (openaiKey && !openaiKey.startsWith("sk-")) {
      log.warn("OPENAI_API_KEY may not be in the expected format", {
        operation: "validateEnv",
        environment: env.NODE_ENV,
      });
    }
  }

  if (env.NODE_ENV === "production") {
    const hasApiKeys =
      Boolean(env.ALLOWED_API_KEYS?.trim()) || Boolean(env.API_KEY?.trim());
    if (!hasApiKeys) {
      log.warn(
        "No API keys configured; relying on Firebase auth or public access",
        {
          operation: "validateEnv",
          environment: "production",
        },
      );
    }
    if (env.ALLOWED_API_KEYS && !env.ALLOWED_API_KEYS.includes(",")) {
      log.warn(
        "Consider configuring multiple API keys in ALLOWED_API_KEYS for rotation",
        {
          operation: "validateEnv",
          environment: "production",
        },
      );
    }
  }

  log.info("Environment variables validated successfully", {
    operation: "validateEnv",
  });
}
