/**
 * Replicate Flux Schnell provider
 *
 * Handles prompt cleanup, optional video-to-image transformation,
 * and Replicate polling for Flux Schnell preview images.
 */

import Replicate from "replicate";
import { logger } from "@infrastructure/Logger";
import { sleep as sleepForMs } from "@utils/sleep";
import type {
  ImagePreviewProvider,
  ImagePreviewRequest,
  ImagePreviewResult,
} from "./types";
import { stripPreviewSections } from "@services/image-generation/promptSanitization";
import {
  parseRetryAfterMs,
  parseReplicateErrorDetail,
  extractImageUrl,
} from "./replicatePrediction";

interface ReplicateClient {
  predictions: {
    create: (params: {
      model: string;
      input: {
        prompt: string;
        aspect_ratio: string;
        output_format: string;
        output_quality: number;
      };
    }) => Promise<ReplicatePrediction>;
    get: (id: string) => Promise<ReplicatePrediction>;
  };
}

type ReplicatePredictionInput = Parameters<
  ReplicateClient["predictions"]["create"]
>[0]["input"];

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: string | string[] | null | undefined;
  error?: string | null;
  logs?: string | null;
}

const FLUX_MODEL_ID = "black-forest-labs/flux-schnell";

const FLUX_ASPECT_RATIOS = [
  "1:1",
  "16:9",
  "21:9",
  "2:3",
  "3:2",
  "4:5",
  "5:4",
  "9:16",
  "9:21",
] as const;

type FluxAspectRatio = (typeof FLUX_ASPECT_RATIOS)[number];

const DEFAULT_ASPECT_RATIO: FluxAspectRatio = "16:9";
const FLUX_ASPECT_RATIO_SET = new Set<string>(FLUX_ASPECT_RATIOS);
const MAX_CREATE_RETRIES = 2;
const DEFAULT_RETRY_AFTER_MS = 4000;

const isFluxAspectRatio = (value: string): value is FluxAspectRatio =>
  FLUX_ASPECT_RATIO_SET.has(value);

const normalizeAspectRatio = (value?: string): FluxAspectRatio => {
  if (!value) {
    return DEFAULT_ASPECT_RATIO;
  }

  const trimmed = value.trim();
  return isFluxAspectRatio(trimmed) ? trimmed : DEFAULT_ASPECT_RATIO;
};

export interface ReplicateFluxSchnellProviderOptions {
  apiToken?: string;
}

export class ReplicateFluxSchnellProvider implements ImagePreviewProvider {
  public readonly id = "replicate-flux-schnell" as const;
  public readonly displayName = "Replicate Flux Schnell";

  private readonly replicate: ReplicateClient | null;
  private readonly log = logger.child({
    service: "ReplicateFluxSchnellProvider",
  });

  constructor(options: ReplicateFluxSchnellProviderOptions = {}) {
    const apiToken = options.apiToken;
    this.replicate = apiToken
      ? (new Replicate({
          auth: apiToken,
        }) as ReplicateClient)
      : null;
  }

  public isAvailable(): boolean {
    return this.replicate !== null;
  }

  public async generatePreview(
    request: ImagePreviewRequest,
  ): Promise<ImagePreviewResult> {
    if (!this.replicate) {
      throw new Error(
        "Replicate provider is not configured. REPLICATE_API_TOKEN is required.",
      );
    }

    const trimmedPrompt = request.prompt.trim();
    if (!trimmedPrompt) {
      throw new Error("Prompt is required and must be a non-empty string");
    }

    const userId = request.userId;
    const aspectRatio = normalizeAspectRatio(request.aspectRatio);
    const cleanedPrompt = stripPreviewSections(trimmedPrompt);

    const promptForModel = cleanedPrompt;

    this.log.info("Generating image preview", {
      prompt: promptForModel.substring(0, 100),
      aspectRatio,
      promptWasStripped: cleanedPrompt !== trimmedPrompt,
      userId,
    });

    try {
      const startTime = Date.now();

      const prediction = await this.createPrediction(
        {
          prompt: promptForModel,
          aspect_ratio: aspectRatio,
          output_format: "webp",
          output_quality: 80,
        },
        userId,
      );

      this.log.info("Prediction created", {
        predictionId: prediction.id,
        status: prediction.status,
        userId,
      });

      const maxWaitTime = 60000; // 60 seconds max
      const pollInterval = 1000; // Poll every second
      const endTime = Date.now() + maxWaitTime;
      let currentPrediction = prediction;

      while (Date.now() < endTime) {
        if (currentPrediction.status === "succeeded") {
          break;
        }
        if (
          currentPrediction.status === "failed" ||
          currentPrediction.status === "canceled"
        ) {
          const predictionError = new Error(
            `Image generation failed: ${currentPrediction.error || "Unknown error"}`,
          );
          this.log.error("Prediction failed", predictionError, {
            predictionId: currentPrediction.id,
            status: currentPrediction.status,
            error: currentPrediction.error,
            logs: currentPrediction.logs,
            userId,
          });
          throw predictionError;
        }

        await this.sleep(pollInterval);
        currentPrediction = await this.replicate.predictions.get(prediction.id);

        this.log.debug("Polling prediction", {
          predictionId: currentPrediction.id,
          status: currentPrediction.status,
          userId,
        });
      }

      if (currentPrediction.status !== "succeeded") {
        throw new Error(
          `Prediction timed out or failed. Status: ${currentPrediction.status}`,
        );
      }

      const output = currentPrediction.output;
      const durationMs = Date.now() - startTime;

      if (output === null || output === undefined) {
        const outputError = new Error(
          "Replicate API returned no output. The image generation may have failed silently.",
        );
        this.log.error(
          "Replicate API returned null/undefined output",
          outputError,
          {
            userId,
            duration: durationMs,
          },
        );
        throw outputError;
      }

      this.log.info("Replicate API response received", {
        outputType: typeof output,
        isArray: Array.isArray(output),
        outputLength: Array.isArray(output) ? output.length : null,
        outputPreview: JSON.stringify(output, null, 2).substring(0, 1000),
        userId,
      });

      const imageUrl = extractImageUrl(output, userId, this.log);

      if (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://")) {
        const urlError = new Error(
          "Invalid image URL format returned from Replicate API",
        );
        this.log.error("Invalid URL format returned", urlError, {
          imageUrl: imageUrl.substring(0, 100),
          userId,
        });
        throw urlError;
      }

      this.log.info("Image preview generated successfully", {
        imageUrl: imageUrl.substring(0, 100),
        duration: durationMs,
        userId,
      });

      return {
        imageUrl,
        model: FLUX_MODEL_ID,
        durationMs,
        aspectRatio,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      let parsedError = errorMessage;
      let statusCode = 500;

      if (
        errorMessage.includes("402") ||
        errorMessage.includes("Insufficient credit")
      ) {
        statusCode = 402;
        parsedError = parseReplicateErrorDetail(
          errorMessage,
          "Insufficient credit. Please add payment method to your Replicate account.",
        );
      } else if (
        errorMessage.includes("429") ||
        errorMessage.includes("rate limit") ||
        errorMessage.includes("throttled")
      ) {
        statusCode = 429;
        parsedError = parseReplicateErrorDetail(
          errorMessage,
          "Rate limit exceeded. Please wait a moment and try again.",
        );
      }

      this.log.error(
        "Image generation failed",
        error instanceof Error ? error : new Error(errorMessage),
        {
          parsedError,
          statusCode,
          prompt: promptForModel.substring(0, 100),
          userId,
        },
      );

      const enhancedError = new Error(parsedError) as Error & {
        statusCode?: number;
      };
      enhancedError.statusCode = statusCode;
      throw enhancedError;
    }
  }

  private async createPrediction(
    input: ReplicatePredictionInput,
    userId: string,
  ): Promise<ReplicatePrediction> {
    if (!this.replicate) {
      throw new Error(
        "Replicate provider is not configured. REPLICATE_API_TOKEN is required.",
      );
    }

    for (let attempt = 0; attempt <= MAX_CREATE_RETRIES; attempt += 1) {
      try {
        return await this.replicate.predictions.create({
          model: FLUX_MODEL_ID,
          input,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const retryAfterMs = parseRetryAfterMs(errorMessage);
        const isRateLimitError =
          retryAfterMs !== null ||
          /429|throttled|rate limit/i.test(errorMessage);

        if (!isRateLimitError || attempt >= MAX_CREATE_RETRIES) {
          throw error;
        }

        const delayMs = retryAfterMs ?? DEFAULT_RETRY_AFTER_MS;
        this.log.warn(
          "Replicate rate limit encountered, retrying create prediction",
          {
            attempt: attempt + 1,
            delayMs,
            userId,
          },
        );
        await this.sleep(delayMs);
      }
    }

    throw new Error("Replicate create prediction failed after retries");
  }

  private async sleep(ms: number): Promise<void> {
    if (!Number.isFinite(ms) || ms <= 0) {
      return;
    }
    await sleepForMs(ms);
  }
}
