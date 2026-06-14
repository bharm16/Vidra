import type OpenAI from "openai";
import sharp from "sharp";
import type { ReadableStream } from "node:stream/web";
import type { VideoGenerationOptions, SoraModelId } from "../types";
import { sleep, pollingDelay } from "@utils/sleep";
import type { VideoAssetStore, StoredVideoAsset } from "../storage";
import { toNodeReadableStream } from "../storage/utils";
import { getProviderPollTimeoutMs } from "./timeoutPolicy";

type LogSink = {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
};

const SORA_STATUS_POLL_INTERVAL_MS = 2000;
type SoraVideoSize = "720x1280" | "1280x720" | "1024x1792" | "1792x1024";
const SORA_SIZES_BY_ASPECT_RATIO: Record<"16:9" | "9:16", SoraVideoSize> = {
  "16:9": "1280x720",
  "9:16": "720x1280",
};
const SORA_SIZES: SoraVideoSize[] = [
  "720x1280",
  "1280x720",
  "1024x1792",
  "1792x1024",
];

function resolveSoraSeconds(
  seconds?: VideoGenerationOptions["seconds"],
): "4" | "8" | "12" {
  if (seconds === "4" || seconds === "8" || seconds === "12") {
    return seconds;
  }
  return "8";
}

function resolveSoraSize(
  aspectRatio?: VideoGenerationOptions["aspectRatio"],
  sizeOverride?: string,
  log?: LogSink,
): SoraVideoSize {
  if (sizeOverride) {
    if (SORA_SIZES.includes(sizeOverride as SoraVideoSize)) {
      return sizeOverride as SoraVideoSize;
    }
    log?.warn("Unsupported Sora size override; defaulting to 1280x720", {
      sizeOverride,
    });
  }
  if (aspectRatio === "9:16") {
    return SORA_SIZES_BY_ASPECT_RATIO["9:16"];
  }
  if (aspectRatio === "1:1") {
    log?.warn("Sora does not support 1:1; defaulting to 1280x720", {
      aspectRatio,
    });
  }
  return SORA_SIZES_BY_ASPECT_RATIO["16:9"];
}

function deriveAspectRatioFromSize(size: SoraVideoSize): string {
  if (size === "720x1280" || size === "1024x1792") return "9:16";
  return "16:9";
}

/**
 * The videos API takes input_reference as an image-reference object
 * ({ image_url }) — uploading bytes as a multipart file is rejected with
 * "expected an object, but got a file instead" — and requires the image's
 * dimensions to exactly match the requested output size ("Inpaint image must
 * match the requested width and height"). Fetch the frame, resize-cover to
 * the requested size, and pass it as a base64 data URL.
 */
async function buildSoraInputReference(
  imageUrl: string,
  size: SoraVideoSize,
  log: LogSink,
): Promise<{ image_url: string }> {
  if (imageUrl.startsWith("data:")) {
    return { image_url: imageUrl };
  }
  const [width, height] = size.split("x").map(Number) as [number, number];
  log.debug("Fetching Sora input reference", { size });
  const response = await fetch(imageUrl, { redirect: "follow" });
  if (!response.ok) {
    log.warn("Failed to fetch Sora input reference", {
      status: response.status,
      statusText: response.statusText,
    });
    throw new Error(`Failed to fetch inputReference (${response.status})`);
  }
  const source = Buffer.from(await response.arrayBuffer());
  const resized = await sharp(source)
    .resize(width, height, { fit: "cover" })
    .jpeg({ quality: 92 })
    .toBuffer();
  return { image_url: `data:image/jpeg;base64,${resized.toString("base64")}` };
}

export async function generateSoraVideo(
  openai: OpenAI,
  prompt: string,
  modelId: SoraModelId,
  options: VideoGenerationOptions,
  assetStore: VideoAssetStore,
  log: LogSink,
): Promise<{ asset: StoredVideoAsset; resolvedAspectRatio?: string }> {
  const timeoutMs = getProviderPollTimeoutMs();
  const seconds = resolveSoraSeconds(options.seconds);
  const size = resolveSoraSize(options.aspectRatio, options.size, log);

  const resolvedInputReference = options.inputReference || options.startImage;
  const inputReference = resolvedInputReference
    ? await buildSoraInputReference(resolvedInputReference, size, log)
    : undefined;

  const job = await openai.videos.create({
    model: modelId,
    prompt,
    seconds,
    size,
    ...(inputReference ? { input_reference: inputReference } : {}),
  });

  let video = job;
  const start = Date.now();
  while (video.status === "queued" || video.status === "in_progress") {
    const elapsed = Date.now() - start;
    if (elapsed > timeoutMs) {
      throw new Error(`Timed out waiting for Sora video ${video.id}`);
    }
    await sleep(pollingDelay(SORA_STATUS_POLL_INTERVAL_MS, elapsed));
    video = await openai.videos.retrieve(video.id);
  }

  if (video.status !== "completed") {
    throw new Error(
      `Sora video failed: ${JSON.stringify(video.error ?? video)}`,
    );
  }

  const response = await openai.videos.downloadContent(video.id);
  const contentType = response.headers.get("content-type") || "video/mp4";
  const stream = toNodeReadableStream(
    response.body as ReadableStream<Uint8Array> | null,
  );
  const asset = await assetStore.storeFromStream(stream, contentType);
  const resolvedAspectRatio = deriveAspectRatioFromSize(size);
  return { asset, resolvedAspectRatio };
}
