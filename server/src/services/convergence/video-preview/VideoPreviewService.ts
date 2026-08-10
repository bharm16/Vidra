/**
 * VideoPreviewService for Visual Convergence
 *
 * Generates Wan 2.2 preview videos for the subject motion step.
 * Uses Replicate API to run the Wan 2.2 text-to-video model.
 *
 * Requirements:
 * - 7.2: When user enters subject motion text and submits, generate a Wan 2.2 preview video
 * - 7.3: Use full prompt including all locked dimensions and subject motion
 * - 7.6: If Wan preview fails, allow user to proceed to final generation without preview
 *
 * @module convergence/video-preview
 */

import Replicate from "replicate";
import { logger } from "@infrastructure/Logger";
import { withRetry } from "../helpers";
import type { StorageService } from "../storage";

// ============================================================================
// Configuration
// ============================================================================

/**
 * Wan 2.2 text-to-video model identifier on Replicate
 * This is the fast version optimized for preview generation
 */
const WAN_2_2_MODEL = "wan-video/wan-2.2-t2v-fast" as const;
const WAN_2_2_I2V_MODEL = "wan-video/wan-2.2-i2v-fast" as const;

/**
 * Default negative prompt for Wan 2.2 to improve quality
 */
const DEFAULT_NEGATIVE_PROMPT =
  "morphing, distorted, disfigured, text, watermark, low quality, blurry, static, extra limbs, fused fingers";

/**
 * Aspect ratio to size mapping for Wan 2.2
 */
const ASPECT_RATIO_SIZE_MAP: Record<string, string> = {
  "16:9": "1280*720",
  "9:16": "720*1280",
  "1:1": "1024*1024",
  "4:3": "1024*768",
  "3:4": "768*1024",
};

/**
 * Configuration for video preview generation
 */
const VIDEO_PREVIEW_CONFIG = {
  /** Maximum retries for API calls */
  maxRetries: 2,
  /** Base delay for exponential backoff (ms) */
  baseDelayMs: 1000,
  /** Default video duration in seconds */
  defaultDuration: 3,
  /** Default aspect ratio */
  defaultAspectRatio: "16:9",
  /** Frames per second */
  fps: 16,
  /** Number of frames for 3 second video at 16fps */
  numFrames: 49, // ~3 seconds at 16fps
} as const;

// ============================================================================
// Interface
// ============================================================================

/**
 * Options for video preview generation
 */
export interface VideoPreviewOptions {
  /** Video duration in seconds (default: 3) */
  duration?: number;
  /** Aspect ratio (e.g., '16:9', '9:16', '1:1') */
  aspectRatio?: string;
  /** Optional starting image for i2v previews */
  startImage?: string;
}

/**
 * Interface for video preview operations.
 * Abstracts the Replicate API integration for easier testing.
 */
export interface VideoPreviewService {
  /**
   * Generate a Wan 2.2 preview video
   *
   * @param prompt - The full prompt for video generation (includes all locked dimensions and subject motion)
   * @param options - Generation options (duration, aspectRatio)
   * @returns URL to generated video (signed GCS URL)
   * @throws Error if video generation fails after retries
   */
  generatePreview(
    prompt: string,
    options?: VideoPreviewOptions,
  ): Promise<string>;

  /**
   * Check if the video preview service is available
   * (i.e., API token is configured)
   *
   * @returns true if the service can be used
   */
  isAvailable(): boolean;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Options for creating a VideoPreviewService
 */
export interface VideoPreviewServiceOptions {
  /** Replicate API token (defaults to REPLICATE_API_TOKEN env var) */
  apiToken?: string | undefined;
  /** Storage service for persisting videos to GCS */
  storageService: StorageService;
  /** User ID for storage path organization */
  userId?: string | undefined;
}

/**
 * Replicate-based implementation of VideoPreviewService.
 *
 * Uses Wan 2.2 model to generate preview videos from prompts.
 * Videos are uploaded to GCS and served via signed URLs.
 */
export class ReplicateVideoPreviewService implements VideoPreviewService {
  private readonly log = logger.child({ service: "VideoPreviewService" });
  private readonly replicate: Replicate | null;
  private readonly storageService: StorageService;
  private readonly userId: string;

  constructor(options: VideoPreviewServiceOptions) {
    const apiToken = options.apiToken;

    if (apiToken) {
      this.replicate = new Replicate({ auth: apiToken });
    } else {
      this.replicate = null;
      this.log.warn(
        "REPLICATE_API_TOKEN not provided, video preview will be unavailable",
      );
    }

    this.storageService = options.storageService;
    this.userId = options.userId || "anonymous";
  }

  /**
   * Check if the video preview service is available
   */
  isAvailable(): boolean {
    return this.replicate !== null;
  }

  /**
   * Generate a Wan 2.2 preview video
   *
   * Uses Wan 2.2 via Replicate API with retry logic.
   * The resulting video is uploaded to GCS and returned as a signed URL.
   *
   * @param prompt - The full prompt for video generation
   * @param options - Generation options
   * @returns Signed GCS URL of the generated video
   * @throws Error if video generation fails after retries
   */
  async generatePreview(
    prompt: string,
    options?: VideoPreviewOptions,
  ): Promise<string> {
    if (!this.replicate) {
      throw new Error(
        "Video preview service is not available: missing API token",
      );
    }

    const startTime = Date.now();
    const duration = options?.duration ?? VIDEO_PREVIEW_CONFIG.defaultDuration;
    const aspectRatio =
      options?.aspectRatio ?? VIDEO_PREVIEW_CONFIG.defaultAspectRatio;
    const startImage = options?.startImage;

    this.log.info("Starting video preview generation", {
      promptLength: prompt.length,
      duration,
      aspectRatio,
      inputMode: startImage ? "i2v" : "t2v",
    });

    try {
      // Use withRetry for resilience (Requirement 7.6 fallback handled by caller)
      const videoTempUrl = await withRetry(
        () =>
          this.runVideoGeneration(prompt, duration, aspectRatio, startImage),
        VIDEO_PREVIEW_CONFIG.maxRetries,
        VIDEO_PREVIEW_CONFIG.baseDelayMs,
      );

      // Upload video to GCS and generate a signed URL
      const signedUrl = await this.uploadVideoToGCS(videoTempUrl);

      const totalDuration = Date.now() - startTime;
      this.log.info("Video preview generation completed", {
        totalDuration,
        signedUrl,
      });

      return signedUrl;
    } catch (error) {
      const totalDuration = Date.now() - startTime;
      this.log.error("Video preview generation failed", error as Error, {
        promptLength: prompt.length,
        duration,
        aspectRatio,
        totalDuration,
      });
      throw error;
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Run the Wan 2.2 video generation model on Replicate
   *
   * @param prompt - The prompt for video generation
   * @param duration - Video duration in seconds
   * @param aspectRatio - Aspect ratio (e.g., '16:9')
   * @returns Temporary URL of the generated video
   */
  private async runVideoGeneration(
    prompt: string,
    duration: number,
    aspectRatio: string,
    startImage?: string,
  ): Promise<string> {
    if (!this.replicate) {
      throw new Error("Replicate client not initialized");
    }

    // Calculate number of frames based on duration
    const numFrames = Math.round(duration * VIDEO_PREVIEW_CONFIG.fps);

    // Resolve size from aspect ratio
    const size =
      ASPECT_RATIO_SIZE_MAP[aspectRatio] ?? ASPECT_RATIO_SIZE_MAP["16:9"];

    const input: Record<string, unknown> = {
      prompt,
      negative_prompt: DEFAULT_NEGATIVE_PROMPT,
      size,
      num_frames: numFrames,
      frames_per_second: VIDEO_PREVIEW_CONFIG.fps,
      prompt_extend: true,
      go_fast: true,
      sample_shift: 12,
    };

    if (startImage) {
      input.image = startImage;
    }

    const modelId = startImage ? WAN_2_2_I2V_MODEL : WAN_2_2_MODEL;

    this.log.debug("Calling Replicate video generation", {
      model: modelId,
      input: {
        ...input,
        prompt: prompt.slice(0, 100) + (prompt.length > 100 ? "..." : ""),
      },
    });

    const output = await this.replicate.run(modelId as `${string}/${string}`, {
      input,
    });

    this.log.debug("Replicate video generation response", {
      outputType: typeof output,
      outputKeys:
        output && typeof output === "object" ? Object.keys(output) : [],
    });

    // Extract URL from output
    const videoUrl = this.extractUrlFromOutput(output);

    if (!videoUrl) {
      throw new Error(
        "Invalid output format from Replicate: Could not extract video URL",
      );
    }

    return videoUrl;
  }

  /**
   * Upload video from temporary URL to GCS
   *
   * @param tempUrl - Temporary Replicate URL
   * @returns Signed GCS URL
   */
  private async uploadVideoToGCS(tempUrl: string): Promise<string> {
    this.log.debug("Uploading video to GCS", {
      tempUrlHost: this.getUrlHost(tempUrl),
      userId: this.userId,
    });

    // Use the storage service's upload method
    // Note: StorageService.upload handles fetching from temp URL and uploading to GCS
    const signedUrl = await this.storageService.upload(
      tempUrl,
      this.userId,
      "preview",
    );

    return signedUrl;
  }

  /**
   * Extract URL from Replicate output
   *
   * Handles various output formats:
   * - Direct string URL
   * - FileOutput object with url() method
   * - Array of URLs
   */
  private extractUrlFromOutput(output: unknown): string | null {
    // Direct string URL
    if (typeof output === "string" && output.startsWith("http")) {
      return output;
    }

    // Object with url property or method
    if (output && typeof output === "object") {
      const outputRecord = output as Record<string, unknown>;

      // FileOutput with url() method
      if ("url" in outputRecord && typeof outputRecord.url === "function") {
        const url = (outputRecord.url as () => unknown)();
        return typeof url === "string" ? url : String(url);
      }

      // Direct url property
      if ("url" in outputRecord && typeof outputRecord.url === "string") {
        return outputRecord.url;
      }

      // Array of URLs
      if (Array.isArray(output) && output.length > 0) {
        const firstItem = output[0];
        if (typeof firstItem === "string" && firstItem.startsWith("http")) {
          return firstItem;
        }
      }
    }

    return null;
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
 * Create a VideoPreviewService instance
 *
 * @param options - Service configuration options
 * @returns VideoPreviewService instance
 */
export function createVideoPreviewService(
  options: VideoPreviewServiceOptions,
): VideoPreviewService {
  return new ReplicateVideoPreviewService(options);
}

/**
 * Create a VideoPreviewService with a specific user context
 *
 * @param storageService - Storage service for GCS uploads
 * @param userId - User ID for storage path organization
 * @param apiToken - Optional Replicate API token
 * @returns VideoPreviewService instance
 */
export function createVideoPreviewServiceForUser(
  storageService: StorageService,
  userId: string,
  apiToken?: string,
): VideoPreviewService {
  return new ReplicateVideoPreviewService({
    storageService,
    userId,
    apiToken,
  });
}

export default ReplicateVideoPreviewService;
