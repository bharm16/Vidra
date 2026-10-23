import type { VideoGenerationOptions } from "../types";
import type { VideoAssetStore, StoredVideoAsset } from "../storage";
import { toNodeReadableStream } from "../storage/utils";
import { downloadVeoVideoStream } from "./veo/download";
import {
  extractVeoVideoUri,
  startVeoGeneration,
  waitForVeoOperation,
  type VeoGenerationInput,
} from "./veo/operations";
import { fetchAsVeoInline } from "./veo/imageUtils";
import { getProviderPollTimeoutMs } from "./timeoutPolicy";
import { assertNoLegacyApiKeyData } from "@utils/apiKeyUser";

type LogSink = {
  info: (message: string, meta?: Record<string, unknown>) => void;
};

export const DEFAULT_VEO_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta";
export const VEO_MODEL_ID = "veo-3.1-generate-preview";

const VEO_STATUS_POLL_INTERVAL_MS = 10000;

export async function generateVeoVideo(
  apiKey: string,
  baseUrl: string,
  prompt: string,
  options: VideoGenerationOptions,
  assetStore: VideoAssetStore,
  log: LogSink,
  signal?: AbortSignal,
): Promise<StoredVideoAsset> {
  signal?.throwIfAborted();
  for (const inputUrl of [options.startImage, options.endImage, options.extendVideoUrl, ...(options.referenceImages?.map(ref => ref.url) ?? [])]) {
    if (inputUrl) assertNoLegacyApiKeyData(inputUrl);
  }
  const timeoutMs = getProviderPollTimeoutMs();
  const input: VeoGenerationInput = { prompt };

  if (options.startImage) {
    log.info("Fetching start image for Veo i2v", { url: options.startImage });
    input.startImage = await fetchAsVeoInline(options.startImage, "image", {}, signal);
  }

  if (options.endImage) {
    log.info("Fetching end image for Veo last-frame", {
      url: options.endImage,
    });
    input.lastFrame = await fetchAsVeoInline(options.endImage, "image", {}, signal);
  }

  if (options.referenceImages?.length) {
    const refs = options.referenceImages.slice(0, 3);
    log.info("Fetching reference images for Veo", { count: refs.length });
    input.referenceImages = await Promise.all(
      refs.map(async (ref) => ({
        image: await fetchAsVeoInline(ref.url, "image", {}, signal),
        referenceType: ref.type,
      })),
    );
  }

  if (options.extendVideoUrl) {
    log.info("Fetching video for Veo extension", {
      url: options.extendVideoUrl,
    });
    input.extendVideo = await fetchAsVeoInline(options.extendVideoUrl, "video", {}, signal);
  }

  const veoParams: NonNullable<VeoGenerationInput["parameters"]> = {};
  if (options.aspectRatio) {
    veoParams.aspectRatio = options.aspectRatio;
  }
  if (options.seed !== undefined && options.seed !== 0) {
    veoParams.seed = Math.round(options.seed);
  }
  if (options.seconds) {
    veoParams.durationSeconds = Number.parseInt(options.seconds, 10);
  }
  if (options.size && /^(720p|1080p|4k)$/i.test(options.size)) {
    veoParams.resolution = options.size.toLowerCase();
  }
  if (Object.keys(veoParams).length > 0) {
    input.parameters = veoParams;
  }

  signal?.throwIfAborted();
  const operationName = await startVeoGeneration(
    baseUrl,
    apiKey,
    input,
    VEO_MODEL_ID,
    signal,
  );

  const mode = options.extendVideoUrl
    ? "extend"
    : options.startImage
      ? "i2v"
      : "t2v";
  log.info("Veo generation started", {
    operationName,
    model: VEO_MODEL_ID,
    mode,
    hasEndFrame: Boolean(options.endImage),
    referenceImageCount: options.referenceImages?.length ?? 0,
  });

  const operation = await waitForVeoOperation(baseUrl, apiKey, operationName, {
    pollIntervalMs: VEO_STATUS_POLL_INTERVAL_MS,
    timeoutMs,
    ...(signal ? { signal } : {}),
  });
  signal?.throwIfAborted();
  const videoUri = extractVeoVideoUri(operation.response);

  if (!videoUri) {
    throw new Error(
      "Veo generation completed without a downloadable video URI.",
    );
  }

  const { stream, contentType } = await downloadVeoVideoStream(
    apiKey,
    videoUri,
    signal,
  );
  signal?.throwIfAborted();
  return await assetStore.storeFromStream(
    toNodeReadableStream(stream, signal),
    contentType,
  );
}
