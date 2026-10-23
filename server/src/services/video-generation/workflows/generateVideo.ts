import { VideoModelUnavailableError } from "../errors/VideoModelUnavailableError";
import { resolveGenerationModelSelection } from "@config/videoModelRegistry";
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
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  callerSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const forwardAbort = (): void => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) forwardAbort();
  else callerSignal?.addEventListener("abort", forwardAbort, { once: true });
  const timer = setTimeout(() => controller.abort(
    new Error(`Video generation workflow timeout exceeded (${timeoutMs}ms)`),
  ), timeoutMs);
  timer.unref();
  let rejectAborted: (() => void) | undefined;
  try {
    controller.signal.throwIfAborted();
    return await new Promise<T>((resolve, reject) => {
      rejectAborted = () => reject(controller.signal.reason);
      controller.signal.addEventListener("abort", rejectAborted, { once: true });
      void Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return operation(controller.signal);
      }).then(result => {
        if (controller.signal.aborted) reject(controller.signal.reason);
        else resolve(result);
      }, reject);
    });
  } catch (error) {
    // A failed preparation may have sibling input reads in flight.
    controller.abort(error);
    throw error;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", forwardAbort);
    if (rejectAborted) controller.signal.removeEventListener("abort", rejectAborted);
  }
}

export async function generateVideoWorkflow(
  prompt: string,
  options: VideoGenerationOptions,
  providers: VideoProviderMap,
  assetStore: VideoAssetStore,
  log: LogSink,
  signal?: AbortSignal,
): Promise<VideoGenerationResult> {
  signal?.throwIfAborted();
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
    throw new VideoModelUnavailableError(
      availability.message || "Requested video model is not available",
      availability.statusCode || 424,
      {
        model: modelSelection || "auto",
        reason: availability.reason,
        requiredKey: availability.requiredKey,
        resolvedModelId: availability.resolvedModelId,
      },
    );
  }

  const resolution = resolveGenerationModelSelection(modelSelection, log);
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
        executionSignal => provider.generate(prompt, modelId, options, assetStore, log, executionSignal),
        workflowTimeoutMs,
        signal,
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
