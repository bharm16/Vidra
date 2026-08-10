/**
 * DepthEstimationService for Visual Convergence
 *
 * Integrates with fal.ai Depth Anything v2 for depth map generation.
 * Used to create depth maps from images for client-side camera motion rendering.
 *
 * Requirements:
 * - 5.1: Generate depth map from last generated image using Depth Anything v2
 * - 5.2: Use fal.ai API to run the depth estimation model
 * - 5.5: If depth estimation fails, offer text-only camera motion selection as fallback
 *
 * @module convergence/depth
 */

import { fal } from "@fal-ai/client";
import { logger } from "@infrastructure/Logger";
import { isFalKeyPlaceholder, resolveFalApiKey } from "@utils/falApiKey";
import { safeUrlHost } from "@shared/utils/url";
import { withRetry } from "../helpers";
import type { StorageService } from "../storage";
import type { DepthEstimationProvider, FalDepthResponse } from "./types";

// ============================================================================
// Configuration
// ============================================================================

/**
 * fal.ai model identifier for Depth Anything v2
 */
const FAL_DEPTH_MODEL = "fal-ai/image-preprocessors/depth-anything/v2" as const;

/**
 * Module-level depth config — populated via setDepthEstimationModuleConfig() at startup.
 * Defaults are test-safe (warmup disabled).
 */
export interface DepthModuleConfig {
  warmupRetryTimeoutMs: number;
  falWarmupEnabled: boolean;
  falWarmupIntervalMs: number;
  falWarmupImageUrl: string;
  warmupOnStartup: boolean;
  warmupTimeoutMs: number;
}

const DEFAULT_WARMUP_IMAGE_URL =
  "https://storage.googleapis.com/generativeai-downloads/images/cat.jpg";

let depthModuleConfig: DepthModuleConfig = {
  warmupRetryTimeoutMs: 20_000,
  falWarmupEnabled: false,
  falWarmupIntervalMs: 120_000,
  falWarmupImageUrl: DEFAULT_WARMUP_IMAGE_URL,
  warmupOnStartup: false,
  warmupTimeoutMs: 60_000,
};

export function setDepthEstimationModuleConfig(
  config: DepthModuleConfig,
): void {
  depthModuleConfig = config;
}

/**
 * Configuration for depth estimation
 */
const DEPTH_ESTIMATION_CONFIG = {
  /** Maximum retries for API calls */
  maxRetries: 2,
  /** Base delay for exponential backoff (ms) */
  baseDelayMs: 1000,
  /** Cache TTL in milliseconds (1 hour) */
  cacheTtlMs: 60 * 60 * 1000,
} as const;

// ============================================================================
// In-Memory Cache
// ============================================================================

interface CacheEntry {
  depthMapUrl: string;
  expiresAt: number;
}

/**
 * Simple in-memory cache for depth maps by image URL.
 * Makes repeated calls for the same image instant.
 */
const depthMapCache = new Map<string, CacheEntry>();

function getCachedDepthMap(imageUrl: string): string | null {
  const entry = depthMapCache.get(imageUrl);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    depthMapCache.delete(imageUrl);
    return null;
  }
  return entry.depthMapUrl;
}

function setCachedDepthMap(imageUrl: string, depthMapUrl: string): void {
  depthMapCache.set(imageUrl, {
    depthMapUrl,
    expiresAt: Date.now() + DEPTH_ESTIMATION_CONFIG.cacheTtlMs,
  });
}

// ============================================================================
// Warm Start (fal.ai cold start mitigation)
// ============================================================================

const getFalWarmStartConfig = () => ({
  get enabled() {
    return depthModuleConfig.falWarmupEnabled;
  },
  get intervalMs() {
    return depthModuleConfig.falWarmupIntervalMs;
  },
  get warmupImageUrl() {
    return depthModuleConfig.falWarmupImageUrl || DEFAULT_WARMUP_IMAGE_URL;
  },
});

const getDepthStartupWarmupConfig = () => ({
  get enabled() {
    return depthModuleConfig.warmupOnStartup;
  },
  get timeoutMs() {
    return depthModuleConfig.warmupTimeoutMs;
  },
});

const warmLog = logger.child({ service: "FalDepthWarmer" });
const startupWarmLog = logger.child({ service: "DepthWarmup" });
let warmerInitialized = false;
let warmIntervalId: ReturnType<typeof setInterval> | null = null;
let warmupInFlight: Promise<void> | null = null;
let lastWarmupAt = 0;
let startupWarmupPromise: Promise<DepthWarmupResult> | null = null;

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Depth warmup timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const runFalWarmup = (reason: "startup" | "interval"): Promise<void> => {
  if (warmupInFlight) {
    return warmupInFlight;
  }

  const startedAt = Date.now();
  const warmupImageUrlHost = safeUrlHost(
    getFalWarmStartConfig().warmupImageUrl,
  );

  warmupInFlight = (async () => {
    try {
      warmLog.debug("Starting fal depth warmup", {
        operation: "falDepthWarmup",
        reason,
        intervalMs: getFalWarmStartConfig().intervalMs,
        warmupImageUrlHost,
        lastWarmupAt: lastWarmupAt || null,
      });

      await fal.subscribe(FAL_DEPTH_MODEL, {
        input: {
          image_url: getFalWarmStartConfig().warmupImageUrl,
        },
        logs: false,
      });

      lastWarmupAt = Date.now();
      warmLog.info("Completed fal depth warmup", {
        operation: "falDepthWarmup",
        reason,
        durationMs: lastWarmupAt - startedAt,
        warmupImageUrlHost,
      });
    } catch (error) {
      const errObj = error instanceof Error ? error : new Error(String(error));
      warmLog.warn("Fal depth warmup failed", {
        operation: "falDepthWarmup",
        reason,
        durationMs: Date.now() - startedAt,
        warmupImageUrlHost,
        error: errObj.message,
      });
    } finally {
      warmupInFlight = null;
    }
  })();

  return warmupInFlight;
};

export interface DepthWarmupResult {
  success: boolean;
  provider?: DepthEstimationProvider;
  durationMs?: number;
  message?: string;
  skipped?: boolean;
}

/**
 * Initialize a periodic fal depth warmer to reduce cold starts.
 *
 * This function is safe to call multiple times; it will only initialize once.
 */
export function initializeDepthWarmer(): void {
  if (warmerInitialized || !getFalWarmStartConfig().enabled) {
    return;
  }

  const falApiKey = resolveFalApiKey();
  if (!falApiKey) {
    warmLog.warn(
      "Fal depth warmer skipped: FAL_KEY/FAL_API_KEY not configured",
      {
        operation: "falDepthWarmup",
        enabled: getFalWarmStartConfig().enabled,
      },
    );
    return;
  }

  fal.config({ credentials: falApiKey });
  warmerInitialized = true;

  const warmupImageUrlHost = safeUrlHost(
    getFalWarmStartConfig().warmupImageUrl,
  );
  warmLog.info("Fal depth warmer enabled", {
    operation: "falDepthWarmup",
    intervalMs: getFalWarmStartConfig().intervalMs,
    warmupImageUrlHost,
  });

  if (lastWarmupAt === 0) {
    void runFalWarmup("startup");
  }

  warmIntervalId = setInterval(() => {
    void runFalWarmup("interval");
  }, getFalWarmStartConfig().intervalMs);

  if (warmIntervalId && typeof warmIntervalId.unref === "function") {
    warmIntervalId.unref();
  }
}

/**
 * Warm up depth estimation at startup to avoid first-request timeouts.
 */
export function warmupDepthEstimationOnStartup(): Promise<DepthWarmupResult> {
  if (startupWarmupPromise) {
    return startupWarmupPromise;
  }

  startupWarmupPromise = (async () => {
    const startupWarmupConfig = getDepthStartupWarmupConfig();
    if (!startupWarmupConfig.enabled) {
      return { success: false, skipped: true, message: "disabled" };
    }

    const falApiKey = resolveFalApiKey();
    if (!falApiKey) {
      return { success: false, skipped: true, message: "no-fal-provider" };
    }

    const warmupImageUrl = getFalWarmStartConfig().warmupImageUrl;
    const warmupImageUrlHost = safeUrlHost(warmupImageUrl);
    const timeoutMs = startupWarmupConfig.timeoutMs;
    const startedAt = Date.now();

    fal.config({ credentials: falApiKey });

    if (lastWarmupAt > 0) {
      return {
        success: true,
        provider: "fal.ai",
        durationMs: 0,
        message: "already-warmed",
      };
    }

    startupWarmLog.info("Depth warmup starting (fal.ai)", {
      operation: "depthStartupWarmup",
      provider: "fal.ai",
      timeoutMs,
      warmupImageUrlHost,
    });

    const beforeWarmupAt = lastWarmupAt;
    try {
      await withTimeout(runFalWarmup("startup"), timeoutMs);
    } catch (error) {
      const errObj = error instanceof Error ? error : new Error(String(error));
      startupWarmLog.warn("Depth warmup timed out (fal.ai)", {
        operation: "depthStartupWarmup",
        provider: "fal.ai",
        timeoutMs,
        warmupImageUrlHost,
        error: errObj.message,
      });
    }

    const durationMs = Date.now() - startedAt;
    if (lastWarmupAt > beforeWarmupAt) {
      return { success: true, provider: "fal.ai", durationMs };
    }

    return {
      success: false,
      provider: "fal.ai",
      durationMs,
      message: "fal-warmup-failed",
    };
  })();

  return startupWarmupPromise;
}

export function getDepthWarmupStatus(): {
  warmupInFlight: boolean;
  lastWarmupAt: number;
} {
  return {
    warmupInFlight: Boolean(warmupInFlight),
    lastWarmupAt,
  };
}

/**
 * Returns the in-flight startup warmup promise (if any).
 * Route handlers can await this to ensure the model is warm before making estimation calls.
 */
export function getStartupWarmupPromise(): Promise<DepthWarmupResult> | null {
  return startupWarmupPromise;
}

// ============================================================================
// Interface
// ============================================================================

/**
 * Interface for depth estimation operations.
 * Abstracts provider integration for easier testing.
 */
export interface DepthEstimationService {
  /**
   * Generate a depth map from an image URL
   *
   * @param imageUrl - URL of the source image (GCS URL)
   * @returns URL of the generated depth map (GCS URL after upload)
   * @throws Error if depth estimation fails after retries
   */
  estimateDepth(imageUrl: string): Promise<string>;

  /**
   * Check if the depth estimation service is available
   * (i.e., a provider is configured)
   *
   * @returns true if the service can be used
   */
  isAvailable(): boolean;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Options for creating a DepthEstimationService
 */
export interface DepthEstimationServiceOptions {
  /** fal.ai API key (defaults to FAL_KEY/FAL_API_KEY env vars) */
  falApiKey?: string | undefined;
  /** Storage service for persisting depth maps to GCS */
  storageService: StorageService;
  /** User ID for storage path organization */
  userId?: string | undefined;
}

/**
 * fal.ai-based implementation of DepthEstimationService.
 *
 * Uses Depth Anything v2 model to generate depth maps from images.
 * Depth maps are uploaded to GCS and served via signed URLs.
 */
export class FalDepthEstimationService implements DepthEstimationService {
  private readonly log = logger.child({ service: "DepthEstimationService" });
  private readonly falAvailable: boolean;
  private readonly storageService: StorageService;
  private readonly userId: string | undefined;

  constructor(options: DepthEstimationServiceOptions) {
    const falApiKey = resolveFalApiKey(options.falApiKey);
    this.storageService = options.storageService;
    this.userId = options.userId;

    if (falApiKey) {
      fal.config({ credentials: falApiKey });
      this.falAvailable = true;
    } else {
      this.falAvailable = false;
      const envFalKey = options.falApiKey ? null : process.env.FAL_KEY;
      if (isFalKeyPlaceholder(envFalKey)) {
        this.log.warn(
          "FAL_KEY appears to reference another env var; fal.ai depth estimation unavailable",
        );
      } else {
        this.log.warn(
          "FAL_KEY/FAL_API_KEY not provided, fal.ai depth estimation unavailable",
        );
      }
    }

    if (!this.falAvailable) {
      this.log.warn("No depth estimation providers available");
    }

    // If the warmer was not started at app bootstrap, start it on first construction.
    if (this.falAvailable) {
      initializeDepthWarmer();
    }
  }

  /**
   * Check if the depth estimation service is available
   */
  isAvailable(): boolean {
    return this.falAvailable;
  }

  /**
   * Generate a depth map from an image URL
   *
   * Uses fal.ai Depth Anything v2 with retry logic.
   * The resulting depth map is uploaded to GCS and returned as a signed URL.
   *
   * @param imageUrl - URL of the source image
   * @returns Signed GCS URL of the generated depth map
   * @throws Error if depth estimation fails after retries
   */
  async estimateDepth(imageUrl: string): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error(
        "Depth estimation service is not available: fal.ai provider not configured",
      );
    }

    const cachedDepthMap = getCachedDepthMap(imageUrl);
    if (cachedDepthMap) {
      this.log.debug("Depth estimation cache hit", {
        imageUrlHost: this.getUrlHost(imageUrl),
        cacheTtlMs: DEPTH_ESTIMATION_CONFIG.cacheTtlMs,
      });
      return cachedDepthMap;
    }

    const startTime = Date.now();
    const primaryProvider: DepthEstimationProvider = "fal.ai";
    const providerImageUrl = await this.resolveInputImageUrlForFal(imageUrl);
    this.log.info("Starting depth estimation", {
      imageUrlHost: this.getUrlHost(imageUrl),
      providerImageUrlHost: this.getUrlHost(providerImageUrl),
      primaryProvider,
    });

    try {
      const depthMapTempUrl =
        await this.estimateDepthWithFalRecovery(providerImageUrl);

      // Return the temporary URL directly - fal.ai URLs are valid for hours
      // and the client media proxy handles CORS. This saves 1-3 seconds per request.
      // If persistence is needed later, GCS upload can be done asynchronously.
      const signedUrl = depthMapTempUrl;

      setCachedDepthMap(imageUrl, signedUrl);

      const duration = Date.now() - startTime;
      this.log.info("Depth estimation completed", {
        duration,
        signedUrl,
      });

      return signedUrl;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log.error("Depth estimation failed", error as Error, {
        imageUrlHost: this.getUrlHost(imageUrl),
        duration,
      });
      throw error;
    }
  }

  private async estimateDepthWithFalRecovery(
    imageUrl: string,
  ): Promise<string> {
    try {
      return await withRetry(
        () => this.runFalDepthEstimation(imageUrl),
        DEPTH_ESTIMATION_CONFIG.maxRetries,
        DEPTH_ESTIMATION_CONFIG.baseDelayMs,
      );
    } catch (error) {
      if (!this.shouldAttemptWarmupRecovery(error)) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const beforeWarmupAt = lastWarmupAt;
      const warmupImageUrlHost = safeUrlHost(
        getFalWarmStartConfig().warmupImageUrl,
      );
      this.log.warn(
        "fal.ai depth estimation failed on cold start; warming and retrying once",
        {
          error: errorMessage,
          warmupImageUrlHost,
          warmupRetryTimeoutMs: depthModuleConfig.warmupRetryTimeoutMs,
        },
      );

      try {
        await withTimeout(
          runFalWarmup("startup"),
          depthModuleConfig.warmupRetryTimeoutMs,
        );
      } catch (warmupError) {
        const warmupErrorMessage =
          warmupError instanceof Error
            ? warmupError.message
            : String(warmupError);
        this.log.warn(
          "Cold-start warmup retry timed out; retrying depth estimation anyway",
          {
            warmupRetryTimeoutMs: depthModuleConfig.warmupRetryTimeoutMs,
            error: warmupErrorMessage,
          },
        );
      }

      const warmed = lastWarmupAt > beforeWarmupAt;
      this.log.info("Depth warmup retry completed", {
        warmed,
        warmupInFlight: Boolean(warmupInFlight),
      });

      return withRetry(
        () => this.runFalDepthEstimation(imageUrl),
        DEPTH_ESTIMATION_CONFIG.maxRetries,
        DEPTH_ESTIMATION_CONFIG.baseDelayMs,
      );
    }
  }

  private async resolveInputImageUrlForFal(imageUrl: string): Promise<string> {
    const host = this.getUrlHost(imageUrl);
    const isGcsUrl =
      host === "storage.googleapis.com" ||
      (host?.endsWith(".storage.googleapis.com") ?? false);
    if (!isGcsUrl) {
      return imageUrl;
    }

    if (
      !this.userId ||
      typeof this.storageService.refreshSignedUrl !== "function"
    ) {
      return imageUrl;
    }

    try {
      const refreshedUrl = await this.storageService.refreshSignedUrl(
        imageUrl,
        this.userId,
      );
      if (!refreshedUrl) {
        return imageUrl;
      }

      if (refreshedUrl !== imageUrl) {
        this.log.debug("Refreshed signed GCS URL for depth estimation input", {
          originalHost: host,
          refreshedHost: this.getUrlHost(refreshedUrl),
        });
      }

      return refreshedUrl;
    } catch (error) {
      this.log.warn(
        "Failed to refresh signed GCS URL for depth estimation input; using original",
        {
          imageUrlHost: host,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return imageUrl;
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private shouldAttemptWarmupRecovery(error: unknown): boolean {
    const coldStartLikely = lastWarmupAt === 0 || Boolean(warmupInFlight);
    if (!coldStartLikely) {
      return false;
    }

    const statusCode = this.getErrorStatusCode(error);
    if (
      statusCode &&
      [408, 422, 429, 500, 502, 503, 504].includes(statusCode)
    ) {
      return true;
    }

    const message = (
      error instanceof Error ? error.message : String(error)
    ).toLowerCase();
    return [
      "unprocessable",
      "timed out",
      "timeout",
      "temporarily unavailable",
      "service unavailable",
      "model is loading",
      "overloaded",
    ].some((fragment) => message.includes(fragment));
  }

  private getErrorStatusCode(error: unknown): number | null {
    if (!error || typeof error !== "object") {
      return null;
    }
    const candidate = error as {
      status?: unknown;
      statusCode?: unknown;
      response?: { status?: unknown };
    };
    for (const value of [
      candidate.statusCode,
      candidate.status,
      candidate.response?.status,
    ]) {
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
    }
    return null;
  }

  /**
   * Run the depth estimation model on fal.ai
   *
   * @param imageUrl - URL of the source image
   * @returns Temporary URL of the generated depth map
   */
  private async runFalDepthEstimation(imageUrl: string): Promise<string> {
    this.log.debug("Calling fal.ai depth estimation", {
      model: FAL_DEPTH_MODEL,
      imageUrlHost: this.getUrlHost(imageUrl),
    });

    const result = await fal.subscribe(FAL_DEPTH_MODEL, {
      input: {
        image_url: imageUrl,
      },
      logs: false,
    });

    const depthMapUrl = (result as { data?: FalDepthResponse }).data?.image
      ?.url;

    if (!depthMapUrl) {
      throw new Error(
        "Invalid output format from fal.ai: Could not extract depth map URL",
      );
    }

    this.log.debug("fal.ai depth estimation response", {
      outputUrl: depthMapUrl,
    });

    return depthMapUrl;
  }

  /**
   * Safely extract hostname from URL for logging
   */
  private getUrlHost(url: string): string | null {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a DepthEstimationService instance
 *
 * @param options - Service configuration options
 * @returns DepthEstimationService instance
 */
export function createDepthEstimationService(
  options: DepthEstimationServiceOptions,
): DepthEstimationService {
  return new FalDepthEstimationService(options);
}

/**
 * Create a DepthEstimationService with a specific user context
 *
 * @param storageService - Storage service for GCS uploads
 * @param userId - User ID for storage path organization
 * @param falApiKey - Optional fal.ai API key
 * @returns DepthEstimationService instance
 */
export function createDepthEstimationServiceForUser(
  storageService: StorageService,
  userId: string,
  falApiKey?: string,
): DepthEstimationService {
  return new FalDepthEstimationService({
    storageService,
    userId,
    falApiKey,
  });
}

export default FalDepthEstimationService;
