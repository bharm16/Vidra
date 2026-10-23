import {
  HIDDEN_SEED,
  SEED,
  choice,
  flag,
  nativeProfile,
  number,
  range,
  requiredUrl,
  shown,
  text,
  toggle,
  url,
  urls,
  withOptional,
} from "./profileParts";
import type { ModelCall, ReplicateModelDefinition } from "./types";

const MINUTE = 60_000;

/**
 * Nano Banana 2.1 — google/nano-banana-2.1. Makes or edits with up to 14
 * pictures, 15 shapes, 1K/2K/4K, Google web and image search grounding,
 * JPG or PNG.
 */
const NANO_SHAPES = [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
  "5:4",
  "4:5",
  "21:9",
  "4:1",
  "1:4",
  "8:1",
  "1:8",
  "match_input_image",
] as const;
const nanoParameters = {
  resolution: choice(["1K", "2K", "4K"], "1K"),
  googleSearch: toggle(false),
  imageSearch: toggle(false),
  outputFormat: choice(["jpg", "png"], "jpg"),
};
const NANO_PRESENTATION = {
  aspectRatio: shown("Shape", { role: "shape", values: { match_input_image: "Same as picture" } }),
  resolution: shown("Resolution", { role: "resolution" }),
  googleSearch: shown("Web search"),
  imageSearch: shown("Image search"),
  outputFormat: shown("Format", { values: { jpg: "JPG", png: "PNG" } }),
};
function nanoInput(
  call: ModelCall,
  pictures: string[],
): Record<string, unknown> {
  return withOptional(
    {
      prompt: call.sentInstructions,
      aspect_ratio: text(call, "aspectRatio"),
      resolution: text(call, "resolution"),
      google_search: flag(call, "googleSearch"),
      image_search: flag(call, "imageSearch"),
      output_format: text(call, "outputFormat"),
    },
    { image_input: pictures },
  );
}
export const matchNeedsPicture = (call: ModelCall): string | undefined =>
  call.parameters.aspectRatio === "match_input_image" &&
  !call.inputs.reference?.length &&
  !call.inputs.primary?.length
    ? "Choose a picture to match its shape, or choose a shape."
    : undefined;

const nanoMake: ReplicateModelDefinition = {
  profile: nativeProfile({
    id: "nano-banana-2.1",
    label: "Nano Banana 2.1",
    action: "make-image",
    endpoint: "google/nano-banana-2.1",
    mode: "text-to-image",
    inputs: [
      { role: "reference", kinds: ["image"], minCount: 0, maxCount: 14 },
    ],
    output: { kind: "image", maxCount: 8 },
    parameters: { aspectRatio: choice(NANO_SHAPES, "1:1"), ...nanoParameters },
    presentation: { words: "required", parameters: NANO_PRESENTATION },
    generatedAudio: "unsupported",
    deadlineSeconds: 600,
  }),
  timeoutMs: 8 * MINUTE,
  pollIntervalMs: 1000,
  preflight: matchNeedsPicture,
  input: (call) => nanoInput(call, urls(call, "reference")),
};

const nanoEdit: ReplicateModelDefinition = {
  profile: nativeProfile({
    id: "nano-banana-2.1-edit",
    label: "Nano Banana 2.1",
    action: "edit-image",
    endpoint: "google/nano-banana-2.1",
    mode: "image-edit",
    inputs: [
      { role: "primary", kinds: ["image"], minCount: 1, maxCount: 1 },
      { role: "reference", kinds: ["image"], minCount: 0, maxCount: 13 },
    ],
    output: { kind: "image", maxCount: 8 },
    parameters: {
      aspectRatio: choice(NANO_SHAPES, "match_input_image"),
      ...nanoParameters,
    },
    presentation: { words: "required", parameters: NANO_PRESENTATION },
    generatedAudio: "unsupported",
    deadlineSeconds: 600,
  }),
  timeoutMs: 8 * MINUTE,
  pollIntervalMs: 1000,
  input: (call) =>
    nanoInput(call, [requiredUrl(call, "primary"), ...urls(call, "reference")]),
};

/**
 * GPT Image 2.5 Sunburst — openai/gpt-image-2.5-sunburst. Makes or edits with
 * input pictures, 18 shapes and sizes up to 3840×2160, six quality levels,
 * transparent or opaque backgrounds, compression, three formats and the
 * lower moderation level. One picture per call; more come from more slots.
 * Vidra pays through Replicate, so no OpenAI key or end-user id is sent.
 */
const GPT_SHAPES = [
  "1:1",
  "3:2",
  "2:3",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "auto",
  "1024x1024",
  "1536x1024",
  "1024x1536",
  "1536x1152",
  "1152x1536",
  "2048x2048",
  "2048x1152",
  "1152x2048",
  "3840x2160",
  "2160x3840",
] as const;
const gptParameters = {
  quality: choice(["low", "medium", "high", "xhigh", "max", "auto"], "high"),
  background: choice(["auto", "transparent", "opaque"], "auto"),
  outputCompression: range(0, 100, 1, 90),
  outputFormat: choice(["webp", "png", "jpeg"], "webp"),
  moderation: choice(["auto", "low"], "auto"),
};
const GPT_PRESENTATION = {
  aspectRatio: shown("Shape", { role: "shape", values: { auto: "Auto" } }),
  quality: shown("Quality", { values: { low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max", auto: "Auto" } }),
  background: shown("Background", { values: { auto: "Auto", transparent: "Transparent", opaque: "Opaque" } }),
  outputCompression: shown("Compression", { format: "percent" }),
  outputFormat: shown("Format", { values: { webp: "WebP", png: "PNG", jpeg: "JPEG" } }),
  moderation: shown("Moderation", { values: { auto: "Standard", low: "Low" } }),
};
const gptConstraints = [
  {
    parameter: "background",
    equals: "transparent",
    requires: { outputFormat: ["png", "webp"] },
    reason: "A transparent background needs PNG or WebP.",
  },
];
function gptInput(
  call: ModelCall,
  pictures: string[],
): Record<string, unknown> {
  return withOptional(
    {
      prompt: call.sentInstructions,
      aspect_ratio: text(call, "aspectRatio"),
      number_of_images: 1,
      quality: text(call, "quality"),
      background: text(call, "background"),
      output_compression: number(call, "outputCompression"),
      output_format: text(call, "outputFormat"),
      moderation: text(call, "moderation"),
    },
    { input_images: pictures },
  );
}

const gptMake: ReplicateModelDefinition = {
  profile: nativeProfile({
    id: "gpt-image-2.5-sunburst",
    label: "GPT Image 2.5 Sunburst",
    action: "make-image",
    endpoint: "openai/gpt-image-2.5-sunburst",
    mode: "text-to-image",
    inputs: [
      { role: "reference", kinds: ["image"], minCount: 0, maxCount: 16 },
    ],
    output: { kind: "image", maxCount: 8 },
    parameters: { aspectRatio: choice(GPT_SHAPES, "1:1"), ...gptParameters },
    constraints: gptConstraints,
    presentation: { words: "required", parameters: GPT_PRESENTATION },
    generatedAudio: "unsupported",
    deadlineSeconds: 900,
  }),
  timeoutMs: 12 * MINUTE,
  pollIntervalMs: 2000,
  input: (call) => gptInput(call, urls(call, "reference")),
};

const gptEdit: ReplicateModelDefinition = {
  profile: nativeProfile({
    id: "gpt-image-2.5-sunburst-edit",
    label: "GPT Image 2.5 Sunburst",
    action: "edit-image",
    endpoint: "openai/gpt-image-2.5-sunburst",
    mode: "image-edit",
    inputs: [
      { role: "primary", kinds: ["image"], minCount: 1, maxCount: 1 },
      { role: "reference", kinds: ["image"], minCount: 0, maxCount: 15 },
    ],
    output: { kind: "image", maxCount: 8 },
    parameters: { aspectRatio: choice(GPT_SHAPES, "auto"), ...gptParameters },
    constraints: gptConstraints,
    presentation: { words: "required", parameters: GPT_PRESENTATION },
    generatedAudio: "unsupported",
    deadlineSeconds: 900,
  }),
  timeoutMs: 12 * MINUTE,
  pollIntervalMs: 2000,
  input: (call) =>
    gptInput(call, [requiredUrl(call, "primary"), ...urls(call, "reference")]),
};

/**
 * Ideogram 4.5 Precise Edit — ideogram-ai/ideogram-4-5-precise-edit. Edits by
 * instruction, optionally only inside a painted area, with up to 4 reference
 * pictures (3 alongside an area), four quality levels and a seed.
 */
const ideogramEdit: ReplicateModelDefinition = {
  profile: nativeProfile({
    id: "ideogram-4.5-precise-edit",
    label: "Ideogram 4.5 Precise Edit",
    action: "edit-image",
    endpoint: "ideogram-ai/ideogram-4-5-precise-edit",
    mode: "image-edit",
    inputs: [
      { role: "primary", kinds: ["image"], minCount: 1, maxCount: 1 },
      { role: "mask", kinds: ["image"], minCount: 0, maxCount: 1 },
      { role: "reference", kinds: ["image"], minCount: 0, maxCount: 4 },
    ],
    output: { kind: "image", maxCount: 8 },
    parameters: {
      quality: choice(["very_low", "low", "medium", "high"], "medium"),
      seed: SEED,
    },
    presentation: {
      words: "required",
      parameters: {
        quality: shown("Quality", { values: { very_low: "Very low", low: "Low", medium: "Medium", high: "High" } }),
        seed: HIDDEN_SEED,
      },
    },
    generatedAudio: "unsupported",
    deadlineSeconds: 600,
  }),
  timeoutMs: 8 * MINUTE,
  pollIntervalMs: 1000,
  preflight: (call) =>
    call.inputs.mask?.length && (call.inputs.reference?.length ?? 0) > 3
      ? "An area edit can use up to 3 reference pictures."
      : undefined,
  input: async (call, tools) => {
    const mask = url(call, "mask");
    return withOptional(
      {
        prompt: call.sentInstructions,
        image: requiredUrl(call, "primary"),
        quality: text(call, "quality"),
        num_images: 1,
      },
      {
        mask: mask ? await tools.blackEditMask(mask) : undefined,
        reference_images: urls(call, "reference"),
        seed: call.seed,
      },
    );
  },
};

/**
 * Topaz Image Upscale — topazlabs/image-upscale. Five enhancement models,
 * no/2x/4x/6x scale, subject detection, face enhancement with creativity and
 * strength, JPG or PNG. Results above 40 megapixels exceed Vidra's picture
 * limit, so they are refused before any spend.
 */
const UPSCALE_FACTORS: Record<string, number> = {
  None: 1,
  "2x": 2,
  "4x": 4,
  "6x": 6,
};
export const MAX_PICTURE_PIXELS = 40_000_000;

const topazImage: ReplicateModelDefinition = {
  profile: nativeProfile({
    id: "topaz-image-upscale",
    label: "Topaz Upscale",
    action: "upscale-image",
    endpoint: "topazlabs/image-upscale",
    mode: "image-upscale",
    inputs: [{ role: "primary", kinds: ["image"], minCount: 1, maxCount: 1 }],
    output: { kind: "image", maxCount: 1 },
    parameters: {
      enhanceModel: choice(
        [
          "Standard V2",
          "Low Resolution V2",
          "CGI",
          "High Fidelity V2",
          "Text Refine",
        ],
        "Standard V2",
      ),
      upscaleFactor: choice(["None", "2x", "4x", "6x"], "2x"),
      subjectDetection: choice(
        ["None", "All", "Foreground", "Background"],
        "None",
      ),
      faceEnhancement: toggle(false),
      faceEnhancementCreativity: range(0, 1, 0.01, 0),
      faceEnhancementStrength: range(0, 1, 0.01, 0.8),
      outputFormat: choice(["jpg", "png"], "jpg"),
      sourceSize: { policy: "derived", from: "input-aspect", role: "primary" },
    },
    presentation: {
      words: "none",
      parameters: {
        enhanceModel: shown("Enhancement", { values: { "Standard V2": "Standard", "Low Resolution V2": "Low resolution", CGI: "CGI", "High Fidelity V2": "High fidelity", "Text Refine": "Text" } }),
        upscaleFactor: shown("Scale", { role: "scale", values: { None: "1x" } }),
        subjectDetection: shown("Subjects", { values: { None: "Off" } }),
        faceEnhancement: shown("Enhance faces"),
        faceEnhancementCreativity: shown("Creativity", { format: "fraction" }),
        faceEnhancementStrength: shown("Strength", { format: "fraction" }),
        outputFormat: shown("Format", { values: { jpg: "JPG", png: "PNG" } }),
        sourceSize: shown("Size", { hidden: true }),
      },
    },
    generatedAudio: "unsupported",
    deadlineSeconds: 900,
  }),
  timeoutMs: 12 * MINUTE,
  pollIntervalMs: 2000,
  preflight: (call) => {
    const [width, height] = String(call.parameters.sourceSize ?? "")
      .split(":")
      .map(Number);
    const factor = UPSCALE_FACTORS[String(call.parameters.upscaleFactor)] ?? 1;
    if (!width || !height)
      return "This picture's size must be checked before upscaling.";
    return width * height * factor * factor > MAX_PICTURE_PIXELS
      ? "This upscale would be larger than 40 megapixels. Choose a smaller scale."
      : undefined;
  },
  input: (call) => ({
    image: requiredUrl(call, "primary"),
    enhance_model: text(call, "enhanceModel"),
    upscale_factor: text(call, "upscaleFactor"),
    subject_detection: text(call, "subjectDetection"),
    face_enhancement: flag(call, "faceEnhancement"),
    face_enhancement_creativity: number(call, "faceEnhancementCreativity"),
    face_enhancement_strength: number(call, "faceEnhancementStrength"),
    output_format: text(call, "outputFormat"),
  }),
};

export const PICTURE_MODEL_DEFINITIONS: readonly ReplicateModelDefinition[] = [
  nanoMake,
  nanoEdit,
  gptMake,
  gptEdit,
  ideogramEdit,
  topazImage,
];
