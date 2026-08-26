/**
 * Replicate Flux Schnell provider
 *
 * Shapes the Schnell request (prompt cleanup, aspect ratio) and delegates the
 * create → poll → URL protocol to the shared runReplicatePrediction.
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
  runReplicatePrediction,
  classifyReplicateError,
  type ReplicatePredictionClient,
} from "./runReplicatePrediction";

const FLUX_MODEL_ID = "black-forest-labs/flux-schnell";
const FLUX_TIMEOUT_MS = 60000;

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

  private readonly replicate: ReplicatePredictionClient | null;
  private readonly log = logger.child({
    service: "ReplicateFluxSchnellProvider",
  });

  constructor(options: ReplicateFluxSchnellProviderOptions = {}) {
    const apiToken = options.apiToken;
    this.replicate = apiToken
      ? (new Replicate({
          auth: apiToken,
        }) as unknown as ReplicatePredictionClient)
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

      const imageUrl = await runReplicatePrediction({
        client: this.replicate,
        model: FLUX_MODEL_ID,
        input: {
          prompt: promptForModel,
          aspect_ratio: aspectRatio,
          output_format: "webp",
          output_quality: 80,
        },
        timeoutMs: FLUX_TIMEOUT_MS,
        userId,
        log: this.log,
        sleep: (ms) => this.sleep(ms),
      });

      const durationMs = Date.now() - startTime;

      this.log.info("Image preview generated successfully", {
        imageUrl: imageUrl.substring(0, 100),
        duration: durationMs,
        userId,
      });

      return { imageUrl, model: FLUX_MODEL_ID, durationMs, aspectRatio };
    } catch (error) {
      throw classifyReplicateError(error, this.log, {
        prompt: promptForModel.substring(0, 100),
        userId,
      });
    }
  }

  private async sleep(ms: number): Promise<void> {
    if (!Number.isFinite(ms) || ms <= 0) {
      return;
    }
    await sleepForMs(ms);
  }
}
