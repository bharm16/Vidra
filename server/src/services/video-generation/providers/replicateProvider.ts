import type Replicate from "replicate";
import type { VideoGenerationOptions, VideoModelId } from "../types";
import { resolveImageInput, summarizeInputForLog } from "./imagePreprocessing";

type LogSink = {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (
    message: string,
    error?: Error,
    meta?: Record<string, unknown>,
  ) => void;
};

const DEFAULT_WAN_NEGATIVE_PROMPT =
  "morphing, distorted, disfigured, text, watermark, low quality, blurry, static, extra limbs, fused fingers";

// Replicate-routed Runway-style models (e.g. genmo/mochi-1-final,
// minimax/video-02, and the future runway-gen45 generation adapter once
// wired) reject empty prompts. Wan models accept empty prompts natively, so
// the substitution is scoped to the non-Wan branch only.
const RUNWAY_EMPTY_PROMPT_SUBSTITUTE = "subtle ambient motion";

const WAN_ASPECT_RATIO_SIZE_MAP: Record<string, string> = {
  "16:9": "1280*720",
  "9:16": "720*1280",
  "1:1": "1024*1024",
  "4:3": "1024*768",
  "3:4": "768*1024",
};

const WAN_I2V_MODEL_MAP: Record<string, string> = {
  "wan-video/wan-2.2-t2v-fast": "wan-video/wan-2.2-i2v-fast",
  "wan-video/wan-2.1-t2v-480p": "wavespeedai/wan-2.1-i2v-480p",
  "wan-video/wan-2.1-t2v-720p": "wavespeedai/wan-2.1-i2v-720p",
};
const WAN_T2V_FALLBACK_MODEL = "wan-video/wan-2.2-t2v-fast";

const isWan25Model = (modelId: string): boolean => modelId.includes("wan-2.5");
// wan-2.2-{t2v,i2v}-fast take `resolution` (480p/720p) and, for t2v, `aspect_ratio`; they have no `size` or negative prompt.
const isWan22FastModel = (modelId: string): boolean =>
  modelId.includes("wan-2.2") && modelId.endsWith("-fast");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

function normalizeWanSize(rawSize: string): string | null {
  const cleaned = rawSize.trim().toLowerCase().replace(/\s+/g, "");
  if (!cleaned) {
    return null;
  }

  const match = cleaned.match(/^(\d{2,5})[x*](\d{2,5})$/);
  if (match) {
    return `${match[1]}*${match[2]}`;
  }

  return null;
}

function resolveWanSize(aspectRatio: string, rawSize?: string): string {
  if (typeof rawSize === "string" && rawSize.trim().length > 0) {
    const cleaned = rawSize.trim().toLowerCase().replace(/\s+/g, "");
    if (!/^\d+p$/.test(cleaned)) {
      const normalized = normalizeWanSize(rawSize);
      if (normalized) {
        return normalized;
      }
    }
  }

  const normalizedAspectRatio = aspectRatio.trim();
  const defaultSize = WAN_ASPECT_RATIO_SIZE_MAP["16:9"] ?? "1280*720";
  return WAN_ASPECT_RATIO_SIZE_MAP[normalizedAspectRatio] ?? defaultSize;
}

function resolveWan25Resolution(rawSize?: string): string | null {
  if (typeof rawSize !== "string") {
    return null;
  }
  const cleaned = rawSize.trim().toLowerCase();
  if (!cleaned) {
    return null;
  }
  if (/^\d+p$/.test(cleaned)) {
    return cleaned;
  }
  const match = cleaned.match(/^(\d{2,5})[x*](\d{2,5})$/);
  if (match) {
    return `${match[2]}p`;
  }
  return null;
}

function resolveWan22Resolution(rawSize?: string): "480p" | "720p" {
  const cleaned = rawSize?.trim().toLowerCase() ?? "";
  const progressive = cleaned.match(/^(\d+)p$/);
  const dimensions = cleaned.match(/^(\d{2,5})[x*](\d{2,5})$/);
  const lines = progressive
    ? Number(progressive[1])
    : dimensions
      ? Math.min(Number(dimensions[1]), Number(dimensions[2]))
      : 720;
  return lines >= 720 ? "720p" : "480p";
}

function resolveWan25Duration(options: VideoGenerationOptions): number | null {
  if (
    typeof options.seconds === "string" &&
    options.seconds.trim().length > 0
  ) {
    const parsed = Number(options.seconds);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  if (
    typeof options.numFrames === "number" &&
    typeof options.fps === "number" &&
    options.fps > 0
  ) {
    const duration = Math.round(options.numFrames / options.fps);
    return duration > 0 ? duration : null;
  }
  return null;
}

function resolveWanModelForI2V(
  modelId: string,
  hasStartImage: boolean,
): string {
  if (!modelId.includes("wan")) {
    return modelId;
  }

  const isI2VModel = modelId.includes("i2v");
  if (!hasStartImage) {
    return isI2VModel ? WAN_T2V_FALLBACK_MODEL : modelId;
  }

  if (isI2VModel) {
    return modelId;
  }

  const i2vModel = WAN_I2V_MODEL_MAP[modelId];
  if (i2vModel) {
    return i2vModel;
  }

  if (modelId.includes("t2v")) {
    return modelId.replace("t2v", "i2v");
  }

  return modelId;
}

export function buildReplicateInput(
  modelId: VideoModelId,
  prompt: string,
  options: VideoGenerationOptions,
): Record<string, unknown> {
  const input: Record<string, unknown> = { prompt };

  if (Number.isFinite(options.seed)) {
    input.seed = Math.round(options.seed as number);
  }

  const isWanModel = modelId.includes("wan");

  if (!isWanModel) {
    if (!prompt || prompt.trim().length === 0) {
      input.prompt = RUNWAY_EMPTY_PROMPT_SUBSTITUTE;
    }
    input.aspect_ratio = options.aspectRatio || "16:9";
    if (options.negativePrompt) {
      input.negative_prompt = options.negativePrompt;
    }
    if (options.startImage) {
      input.image = options.startImage;
    }
    if (options.style_reference) {
      input.style_reference = options.style_reference;
    }
    if (typeof options.style_reference_weight === "number") {
      input.style_reference_weight = options.style_reference_weight;
    }
    return input;
  }

  if (isWan25Model(modelId)) {
    const wanNegativePrompt =
      options.negativePrompt || DEFAULT_WAN_NEGATIVE_PROMPT;
    const promptExtend =
      typeof options.promptExtend === "boolean" ? options.promptExtend : true;
    const resolution = resolveWan25Resolution(options.size);
    const duration = resolveWan25Duration(options);

    input.negative_prompt = wanNegativePrompt;
    input.enable_prompt_expansion = promptExtend;
    if (resolution) {
      input.resolution = resolution;
    }
    if (typeof duration === "number") {
      input.duration = duration;
    }
    if (options.startImage) {
      input.image = options.startImage;
    }
    return input;
  }

  if (isWan22FastModel(modelId)) {
    input.resolution = resolveWan22Resolution(options.size);
    input.num_frames = options.numFrames || 81;
    input.frames_per_second = options.fps || 16;
    input.go_fast = true;
    input.sample_shift = 12;
    if (options.startImage) {
      input.image = options.startImage;
    } else {
      input.aspect_ratio = options.aspectRatio === "9:16" ? "9:16" : "16:9";
      if (typeof options.promptExtend === "boolean") {
        input.optimize_prompt = options.promptExtend;
      }
    }
    return input;
  }

  const wanAspectRatio = options.aspectRatio || "16:9";
  const wanSize = resolveWanSize(wanAspectRatio, options.size);
  const wanNegativePrompt =
    options.negativePrompt || DEFAULT_WAN_NEGATIVE_PROMPT;

  input.negative_prompt = wanNegativePrompt;
  input.size = wanSize;
  input.num_frames = options.numFrames || 81;
  input.frames_per_second = options.fps || 16;
  const promptExtend =
    typeof options.promptExtend === "boolean" ? options.promptExtend : true;
  input.prompt_extend = promptExtend;
  input.go_fast = true;
  input.sample_shift = 12;

  if (options.startImage) {
    input.image = options.startImage;
  }
  if (options.style_reference) {
    input.style_reference = options.style_reference;
  }
  if (typeof options.style_reference_weight === "number") {
    input.style_reference_weight = options.style_reference_weight;
  }

  return input;
}

export async function generateReplicateVideo(
  replicate: Replicate,
  prompt: string,
  modelId: VideoModelId,
  options: VideoGenerationOptions,
  log: LogSink,
): Promise<{ url: string; seed?: number }> {
  const resolvedModelId = resolveWanModelForI2V(
    modelId,
    Boolean(options.startImage),
  );
  const input = buildReplicateInput(
    resolvedModelId as VideoModelId,
    prompt,
    options,
  );
  if (typeof input.image === "string") {
    input.image = await resolveImageInput(input.image, log, "startImage");
  }
  if (typeof input.style_reference === "string") {
    input.style_reference = await resolveImageInput(
      input.style_reference,
      log,
      "style_reference",
    );
  }

  log.info("Calling replicate.run", {
    originalModelId: modelId,
    resolvedModelId,
    input: summarizeInputForLog(input),
    isI2V: Boolean(options.startImage),
  });

  const output = (await replicate.run(
    resolvedModelId as `${string}/${string}`,
    { input },
  )) as unknown;

  log.info("replicate.run finished", {
    outputType: typeof output,
    outputKeys: output && typeof output === "object" ? Object.keys(output) : [],
    outputValue: typeof output === "string" ? output : "object",
  });

  if (typeof output === "string") {
    if (output.startsWith("http")) {
      return { url: output };
    }
    throw new Error(
      `Replicate returned a string output that is not an HTTP URL: "${output.slice(0, 200)}"`,
    );
  }

  if (output && typeof output === "object") {
    const outputRecord = output as Record<string, unknown>;
    const metrics = isRecord(outputRecord.metrics)
      ? outputRecord.metrics
      : null;
    const seed =
      typeof outputRecord.seed === "number"
        ? outputRecord.seed
        : typeof metrics?.seed === "number"
          ? metrics.seed
          : undefined;

    if ("url" in outputRecord && typeof outputRecord.url === "function") {
      const url = (outputRecord.url as () => unknown)();
      const urlStr = String(url);
      if (!urlStr.startsWith("http")) {
        throw new Error(
          `Replicate FileOutput.url() returned non-HTTP value: "${urlStr.slice(0, 200)}"`,
        );
      }
      log.info("Extracted URL from FileOutput", { url: urlStr });
      return { url: urlStr, ...(seed !== undefined ? { seed } : {}) };
    }

    if (
      Array.isArray(output) &&
      output.length > 0 &&
      typeof output[0] === "string"
    ) {
      const firstUrl = output[0];
      if (!firstUrl.startsWith("http")) {
        throw new Error(
          `Replicate array output[0] is not an HTTP URL: "${firstUrl.slice(0, 200)}"`,
        );
      }
      return { url: firstUrl, ...(seed !== undefined ? { seed } : {}) };
    }

    if (typeof outputRecord.url === "string") {
      if (!outputRecord.url.startsWith("http")) {
        throw new Error(
          `Replicate output.url is not an HTTP URL: "${outputRecord.url.slice(0, 200)}"`,
        );
      }
      return { url: outputRecord.url, ...(seed !== undefined ? { seed } : {}) };
    }
  }

  log.error("Could not extract video URL from output", undefined, {
    outputType: typeof output,
    outputPreview: JSON.stringify(output)?.slice(0, 500),
  });
  throw new Error(
    "Invalid output format from Replicate: Could not extract video URL",
  );
}
