import { AppError } from "@server/types/common";
import { resolveModelSelection } from "../modelResolver";
import type { StoredVideoAsset, VideoAssetStore } from "../storage";
import type { VideoGenerationOptions, VideoGenerationResult } from "../types";
import {
  getProviderAvailability,
  resolveProviderForModel,
} from "../providers/ProviderRegistry";
import { getModelAvailability } from "../availability";
import type { VideoProviderMap } from "../providers/types";
import { getWorkflowWatchdogTimeoutMs } from "../providers/timeoutPolicy";

type LogSink = {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, error?: Error) => void;
};

async function withWatchdog<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => {
        reject(
          new Error(
            `Video generation workflow timeout exceeded (${timeoutMs}ms)`,
          ),
        );
      }, timeoutMs);

      operation.then(resolve, reject);
    });
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function generateVideoWorkflow(
  prompt: string,
  options: VideoGenerationOptions,
  providers: VideoProviderMap,
  assetStore: VideoAssetStore,
  log: LogSink,
): Promise<VideoGenerationResult> {
  const workflowTimeoutMs = getWorkflowWatchdogTimeoutMs();
  const modelSelection =
    typeof options.model === "string" ? options.model.trim() : options.model;
  const startImageUrl = options.startImage || options.inputReference;
  const inputMode: VideoGenerationResult["inputMode"] = startImageUrl
    ? "i2v"
    : "t2v";
  const availability = getModelAvailability(
    modelSelection,
    getProviderAvailability(providers),
    log,
  );
  if (!availability.available) {
    throw new AppError(
      availability.message || "Requested video model is not available",
      "VIDEO_MODEL_UNAVAILABLE",
      availability.statusCode || 424,
      {
        model: modelSelection || "auto",
        reason: availability.reason,
        requiredKey: availability.requiredKey,
        resolvedModelId: availability.resolvedModelId,
      },
    );
  }

  const resolution = resolveModelSelection(modelSelection, log);
  const modelId = availability.resolvedModelId || resolution.modelId;

  log.info("Starting video generation", {
    modelSelection: modelSelection || "auto",
    model: modelId,
    promptLength: prompt.length,
  });

  try {
    const providerKey = resolveProviderForModel(modelId);
    const provider = providers[providerKey];
    if (!provider) {
      throw new Error(`No provider registered for model: ${modelId}`);
    }
    const { asset, seed, resolvedAspectRatio, providerCost } =
      await withWatchdog(
        provider.generate(prompt, modelId, options, assetStore, log),
        workflowTimeoutMs,
      );
    return formatResult(
      asset,
      inputMode,
      startImageUrl,
      seed,
      resolvedAspectRatio,
      providerCost,
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(
      "Video generation failed",
      error instanceof Error ? error : new Error(errorMessage),
    );
    throw error;
  }
}

function formatResult(
  asset: StoredVideoAsset,
  inputMode?: VideoGenerationResult["inputMode"],
  startImageUrl?: string,
  seed?: number,
  resolvedAspectRatio?: string,
  providerCost?: VideoGenerationResult["providerCost"],
): VideoGenerationResult {
  return {
    assetId: asset.id,
    videoUrl: asset.url,
    contentType: asset.contentType,
    ...(inputMode ? { inputMode } : {}),
    ...(startImageUrl ? { startImageUrl } : {}),
    ...(seed !== undefined ? { seed } : {}),
    ...(resolvedAspectRatio ? { resolvedAspectRatio } : {}),
    ...(providerCost ? { providerCost } : {}),
  };
}
