/**
 * Replicate Flux Kontext Fast provider
 *
 * Shapes the Kontext img2img request (input image, speed mode, seed, aspect
 * ratio) and delegates the create → poll → URL protocol to the shared
 * runReplicatePrediction.
 */

import Replicate from "replicate";
import { logger } from "@infrastructure/Logger";
import { sleep as sleepForMs } from "@utils/sleep";
import { stripPreviewSections } from "@services/image-generation/promptSanitization";
import type {
  ImagePreviewProvider,
  ImagePreviewRequest,
  ImagePreviewResult,
  ImagePreviewSpeedMode,
} from "./types";
import {
  runReplicatePrediction,
  classifyReplicateError,
  type ReplicatePredictionClient,
} from "./runReplicatePrediction";

const KONTEXT_MODEL_ID = "prunaai/flux-kontext-fast";
const KONTEXT_TIMEOUT_MS = 60000;

const KONTEXT_ASPECT_RATIOS = [
  "match_input_image",
  "1:1",
  "16:9",
  "21:9",
  "3:2",
  "2:3",
  "4:5",
  "5:4",
  "3:4",
  "4:3",
  "9:16",
  "9:21",
] as const;

type KontextAspectRatio = (typeof KONTEXT_ASPECT_RATIOS)[number];

const DEFAULT_ASPECT_RATIO: KontextAspectRatio = "16:9";
const KONTEXT_ASPECT_RATIO_SET = new Set<string>(KONTEXT_ASPECT_RATIOS);

const SPEED_MODE_MAP: Record<ImagePreviewSpeedMode, string> = {
  "Lightly Juiced": "Lightly Juiced 🍊 (more consistent)",
  Juiced: "Juiced 🔥 (default)",
  "Extra Juiced": "Extra Juiced 🔥 (more speed)",
  "Real Time": "Real Time",
};

const DEFAULT_SPEED_MODE = SPEED_MODE_MAP["Juiced"];
const DEFAULT_OUTPUT_QUALITY = 80;

const isKontextAspectRatio = (value: string): value is KontextAspectRatio =>
  KONTEXT_ASPECT_RATIO_SET.has(value);

const normalizeAspectRatio = (
  value?: string,
  useInputImage?: boolean,
): KontextAspectRatio => {
  if (!value) {
    return useInputImage ? "match_input_image" : DEFAULT_ASPECT_RATIO;
  }

  const trimmed = value.trim();
  return isKontextAspectRatio(trimmed)
    ? trimmed
    : useInputImage
      ? "match_input_image"
      : DEFAULT_ASPECT_RATIO;
};

const normalizeOutputQuality = (value?: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_OUTPUT_QUALITY;
  }

  const rounded = Math.round(value);
  if (rounded < 1) {
    return 1;
  }
  if (rounded > 100) {
    return 100;
  }
  return rounded;
};

const normalizeSeed = (value?: number): number | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.round(value);
};

export interface ReplicateFluxKontextFastProviderOptions {
  apiToken?: string;
}

export class ReplicateFluxKontextFastProvider implements ImagePreviewProvider {
  public readonly id = "replicate-flux-kontext-fast" as const;
  public readonly displayName = "Replicate Flux Kontext Fast";
  public readonly requiresInputImage = true;

  private readonly replicate: ReplicatePredictionClient | null;
  private readonly log = logger.child({
    service: "ReplicateFluxKontextFastProvider",
  });

  constructor(options: ReplicateFluxKontextFastProviderOptions = {}) {
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
    const hasInputImage =
      typeof request.inputImageUrl === "string" &&
      request.inputImageUrl.trim().length > 0;

    if (!hasInputImage) {
      const missingInputError = new Error(
        "Flux Kontext Fast requires inputImageUrl for img2img edits. Generate a base image first.",
      ) as Error & { statusCode?: number };
      missingInputError.statusCode = 400;
      throw missingInputError;
    }

    const aspectRatio = normalizeAspectRatio(
      request.aspectRatio,
      hasInputImage,
    );
    const cleanedPrompt = stripPreviewSections(trimmedPrompt);
    const promptForModel = cleanedPrompt;

    const speedMode = request.speedMode
      ? SPEED_MODE_MAP[request.speedMode]
      : DEFAULT_SPEED_MODE;
    const outputQuality = normalizeOutputQuality(request.outputQuality);
    const seed = normalizeSeed(request.seed);

    this.log.info("Generating image preview", {
      prompt: promptForModel.substring(0, 100),
      aspectRatio,
      speedMode,
      outputQuality,
      hasInputImage,
      promptWasStripped: cleanedPrompt !== trimmedPrompt,
      userId,
    });

    try {
      const startTime = Date.now();

      const input: Record<string, unknown> = {
        prompt: promptForModel,
        aspect_ratio: aspectRatio,
        output_format: "webp",
        output_quality: outputQuality,
        speed_mode: speedMode,
      };

      if (seed !== undefined) {
        input.seed = seed;
      }
      const inputImageUrl = request.inputImageUrl?.trim();
      if (hasInputImage && inputImageUrl) {
        input.img_cond_path = inputImageUrl;
      }

      const imageUrl = await runReplicatePrediction({
        client: this.replicate,
        model: KONTEXT_MODEL_ID,
        input,
        timeoutMs: KONTEXT_TIMEOUT_MS,
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

      return { imageUrl, model: KONTEXT_MODEL_ID, durationMs, aspectRatio };
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
