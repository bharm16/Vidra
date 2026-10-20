import {
  AUTO_COORDINATE,
  SEED,
  choice,
  flag,
  megabytes,
  nativeProfile,
  number,
  range,
  requiredUrl,
  text,
  toggle,
  url,
  urls,
  withOptional,
  words,
} from "./profileParts";
import type { ModelCall, ReplicateModelDefinition } from "./types";

const MINUTE = 60_000;

/** Vidra's house wording for Wan quality, kept editable on Wan 3. */
const WAN_NEGATIVE =
  "morphing, distorted, disfigured, text, watermark, low quality, blurry, static, extra limbs, fused fingers";

/**
 * Wan 3 — alibaba/wan-3. Text or a first frame, 2–30 s, 480p–1080p, adaptive
 * or explicit shape, prompt expansion, negative wording and seed.
 * The model page's readme prices 1080p at $0.20/s (billing lists $0.10/s);
 * the higher figure bounds 1080p to 20 s inside the daily free-testing cap.
 */
const wanParameters = {
  durationSeconds: range(2, 30, 1, 5),
  resolution: choice(["480p", "720p", "1080p"], "720p"),
  promptExpansion: toggle(true),
  negativePrompt: words(2000, WAN_NEGATIVE),
  seed: SEED,
};
const wanConstraints = [
  {
    parameter: "resolution",
    equals: "1080p",
    requires: {
      durationSeconds: Array.from({ length: 19 }, (_, index) => index + 2),
    },
    reason: "1080p clips can be up to 20 seconds during free testing.",
  },
];
function wanInput(call: ModelCall, start?: string): Record<string, unknown> {
  return withOptional(
    {
      prompt: call.sentInstructions,
      resolution: text(call, "resolution"),
      duration: number(call, "durationSeconds"),
      enable_prompt_expansion: flag(call, "promptExpansion"),
      ...(start
        ? { image: start }
        : { aspect_ratio: text(call, "aspectRatio") }),
    },
    { negative_prompt: text(call, "negativePrompt"), seed: call.seed },
  );
}

const wan3Text: ReplicateModelDefinition = {
  profile: nativeProfile({
    id: "wan-3-t2v",
    label: "Wan 3",
    action: "make-video",
    endpoint: "alibaba/wan-3",
    mode: "text-to-video",
    inputs: [],
    output: { kind: "video", maxCount: 1 },
    parameters: {
      aspectRatio: choice(
        ["16:9", "9:16", "1:1", "4:3", "3:4", "adaptive"],
        "16:9",
      ),
      ...wanParameters,
    },
    constraints: wanConstraints,
    generatedAudio: "unknown",
    deadlineSeconds: 1800,
  }),
  timeoutMs: 25 * MINUTE,
  pollIntervalMs: 4000,
  input: (call) => wanInput(call),
};

const wan3Image: ReplicateModelDefinition = {
  profile: nativeProfile({
    id: "wan-3-i2v",
    label: "Wan 3",
    action: "animate-image",
    endpoint: "alibaba/wan-3",
    mode: "image-to-video",
    inputs: [
      {
        role: "start-frame",
        kinds: ["image"],
        minCount: 1,
        maxCount: 1,
        maxBytes: megabytes(10),
      },
    ],
    output: { kind: "video", maxCount: 1 },
    parameters: {
      aspectRatio: {
        policy: "derived",
        from: "input-aspect",
        role: "start-frame",
      },
      ...wanParameters,
    },
    constraints: wanConstraints,
    generatedAudio: "unknown",
    deadlineSeconds: 1800,
  }),
  timeoutMs: 25 * MINUTE,
  pollIntervalMs: 4000,
  input: (call) => wanInput(call, requiredUrl(call, "start-frame")),
};

/**
 * Gemini Omni 1.1 Flash — google/gemini-omni-1.1. Text, a first frame, start
 * and end keyframes, subject references, or an existing clip to edit; always
 * with synchronized sound; 360p draft to 4K, 16:9 or 9:16. The model chooses
 * the clip length (about 10 s observed); edits keep the source length.
 */
const GEMINI_RESOLUTIONS = ["360p", "720p", "1080p", "4k"] as const;
const GEMINI_SHAPES = ["16:9", "9:16"] as const;

const geminiText: ReplicateModelDefinition = {
  profile: nativeProfile({
    id: "gemini-omni-1.1-t2v",
    label: "Gemini Omni 1.1",
    action: "make-video",
    endpoint: "google/gemini-omni-1.1",
    mode: "text-to-video",
    inputs: [{ role: "reference", kinds: ["image"], minCount: 0, maxCount: 3 }],
    output: { kind: "video", maxCount: 1 },
    parameters: {
      aspectRatio: choice(GEMINI_SHAPES, "16:9"),
      resolution: choice(GEMINI_RESOLUTIONS, "720p"),
    },
    generatedAudio: "always",
    deadlineSeconds: 1800,
  }),
  timeoutMs: 25 * MINUTE,
  pollIntervalMs: 4000,
  input: (call) =>
    withOptional(
      {
        prompt: call.sentInstructions,
        aspect_ratio: text(call, "aspectRatio"),
        resolution: text(call, "resolution"),
      },
      { reference_images: urls(call, "reference") },
    ),
};

const geminiImage: ReplicateModelDefinition = {
  profile: nativeProfile({
    id: "gemini-omni-1.1-i2v",
    label: "Gemini Omni 1.1",
    action: "animate-image",
    endpoint: "google/gemini-omni-1.1",
    mode: "image-to-video",
    inputs: [
      { role: "start-frame", kinds: ["image"], minCount: 1, maxCount: 1 },
      { role: "end-frame", kinds: ["image"], minCount: 0, maxCount: 1 },
    ],
    output: { kind: "video", maxCount: 1 },
    parameters: {
      aspectRatio: choice(GEMINI_SHAPES, "16:9"),
      resolution: choice(GEMINI_RESOLUTIONS, "720p"),
    },
    generatedAudio: "always",
    deadlineSeconds: 1800,
  }),
  timeoutMs: 25 * MINUTE,
  pollIntervalMs: 4000,
  input: (call) =>
    withOptional(
      {
        prompt: call.sentInstructions,
        image: requiredUrl(call, "start-frame"),
        aspect_ratio: text(call, "aspectRatio"),
        resolution: text(call, "resolution"),
      },
      { last_frame: url(call, "end-frame") },
    ),
};

const geminiEdit: ReplicateModelDefinition = {
  profile: nativeProfile({
    id: "gemini-omni-1.1-edit",
    label: "Gemini Omni 1.1",
    action: "edit-video",
    endpoint: "google/gemini-omni-1.1",
    mode: "video-edit",
    inputs: [
      {
        role: "clip",
        kinds: ["video"],
        minCount: 1,
        maxCount: 1,
        maxDurationSeconds: 10,
      },
    ],
    output: { kind: "video", maxCount: 1 },
    parameters: { resolution: choice(GEMINI_RESOLUTIONS, "720p") },
    generatedAudio: "always",
    deadlineSeconds: 1800,
  }),
  timeoutMs: 25 * MINUTE,
  pollIntervalMs: 4000,
  input: (call) => ({
    prompt: call.sentInstructions,
    video: requiredUrl(call, "clip"),
    resolution: text(call, "resolution"),
  }),
};

/**
 * Grok Imagine Video Extension — xai/grok-imagine-video-extension. Continues
 * an MP4 clip of 2–15 s by 2–10 s from its last frame and returns the original
 * plus the continuation as one clip.
 */
const grokExtension: ReplicateModelDefinition = {
  profile: nativeProfile({
    id: "grok-imagine-video-extension",
    label: "Grok Imagine Extend",
    action: "extend-video",
    endpoint: "xai/grok-imagine-video-extension",
    mode: "video-extension",
    inputs: [
      {
        role: "clip",
        kinds: ["video"],
        minCount: 1,
        maxCount: 1,
        minDurationSeconds: 2,
        maxDurationSeconds: 15,
      },
    ],
    output: { kind: "video", maxCount: 1 },
    parameters: { durationSeconds: range(2, 10, 1, 6) },
    generatedAudio: "unknown",
    deadlineSeconds: 1200,
  }),
  timeoutMs: 18 * MINUTE,
  pollIntervalMs: 3000,
  preflight: (call) => {
    const clip = call.inputs.clip?.[0]?.version;
    return clip?.metadata.state === "verified" &&
      clip.metadata.contentType !== undefined &&
      clip.metadata.contentType !== "video/mp4"
      ? "Grok Imagine extends MP4 clips. Choose an MP4 clip."
      : undefined;
  },
  input: (call) => ({
    prompt: call.sentInstructions,
    video: requiredUrl(call, "clip"),
    duration: number(call, "durationSeconds"),
  }),
};

/**
 * Topaz Video Upscale — topazlabs/video-upscale. 720p, 1080p or 4K at 15–60 fps.
 * Billing is in credits; the published per-5 s guide is scaled by the current
 * $0.08 unit price, which bounds clips to 20 s inside the daily cap.
 */
const topazVideo: ReplicateModelDefinition = {
  profile: nativeProfile({
    id: "topaz-video-upscale",
    label: "Topaz Video Upscale",
    action: "upscale-video",
    endpoint: "topazlabs/video-upscale",
    mode: "video-upscale",
    inputs: [
      {
        role: "clip",
        kinds: ["video"],
        minCount: 1,
        maxCount: 1,
        maxDurationSeconds: 20,
      },
    ],
    output: { kind: "video", maxCount: 1 },
    parameters: {
      resolution: choice(["720p", "1080p", "4k"], "1080p"),
      framesPerSecond: range(15, 60, 1, 30),
    },
    generatedAudio: "unsupported",
    deadlineSeconds: 3600,
  }),
  timeoutMs: 55 * MINUTE,
  pollIntervalMs: 5000,
  input: (call) => ({
    video: requiredUrl(call, "clip"),
    target_resolution: text(call, "resolution"),
    target_fps: number(call, "framesPerSecond"),
  }),
};

/**
 * Luma Reframe Video — luma/reframe-video. Changes a clip of up to 10 s to any
 * of seven shapes at 720p, with optional guidance and optional placement of
 * the source inside the new frame (crop bounds and grid position, in pixels).
 */
const lumaReframe: ReplicateModelDefinition = {
  profile: nativeProfile({
    id: "luma-reframe-video",
    label: "Luma Reframe",
    action: "reframe-video",
    endpoint: "luma/reframe-video",
    mode: "video-reframe",
    inputs: [
      {
        role: "clip",
        kinds: ["video"],
        minCount: 1,
        maxCount: 1,
        maxBytes: megabytes(100),
        maxDurationSeconds: 10,
      },
    ],
    output: { kind: "video", maxCount: 1 },
    parameters: {
      aspectRatio: choice(
        ["9:16", "16:9", "1:1", "3:4", "4:3", "9:21", "21:9"],
        "9:16",
      ),
      cropXStart: AUTO_COORDINATE,
      cropXEnd: AUTO_COORDINATE,
      cropYStart: AUTO_COORDINATE,
      cropYEnd: AUTO_COORDINATE,
      gridPositionX: AUTO_COORDINATE,
      gridPositionY: AUTO_COORDINATE,
    },
    generatedAudio: "unsupported",
    deadlineSeconds: 1200,
  }),
  timeoutMs: 18 * MINUTE,
  pollIntervalMs: 3000,
  input: (call) =>
    withOptional(
      {
        video: requiredUrl(call, "clip"),
        aspect_ratio: text(call, "aspectRatio"),
      },
      {
        prompt: call.instructions.trim(),
        x_start: number(call, "cropXStart"),
        x_end: number(call, "cropXEnd"),
        y_start: number(call, "cropYStart"),
        y_end: number(call, "cropYEnd"),
        grid_position_x: number(call, "gridPositionX"),
        grid_position_y: number(call, "gridPositionY"),
      },
    ),
};

export const VIDEO_MODEL_DEFINITIONS: readonly ReplicateModelDefinition[] = [
  wan3Text,
  wan3Image,
  geminiText,
  geminiImage,
  geminiEdit,
  grokExtension,
  topazVideo,
  lumaReframe,
];
