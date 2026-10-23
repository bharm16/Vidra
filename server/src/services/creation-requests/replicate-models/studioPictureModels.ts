import { matchNeedsPicture } from "./pictureModels";
import {
  choice,
  flag,
  megabytes,
  nativeProfile,
  number,
  range,
  requiredUrl,
  shown,
  text,
  toggle,
  urls,
  withOptional,
} from "./profileParts";
import type {
  ModelCall,
  ModelProfile,
  ReplicateModelDefinition,
} from "./types";

/**
 * The picture models Studio offered (ADR-0019), as exact workflow profiles
 * with every input their public Replicate API schema documents (read
 * 2026-10-22). Studio pinned resolution and quality; these offer them.
 * Each action lists its models cheapest first, the order Studio's Auto chose.
 */

const MINUTE = 60_000;

/** Vidra stores and verifies PNG, JPEG and WebP pictures only. */
const NO_VECTOR_STORAGE =
  "Vector (SVG) pictures can't be kept yet. Choose another model; your words and inputs are retained.";

/**
 * Recraft V4.1 — recraft-ai/recraft-v4.1[-pro][-svg]. Words up to 10,000
 * characters, and either an aspect ratio or, with the ratio unset, an exact
 * size. The size is ignored once a ratio is set, so one Shape setting offers
 * both: a ratio is sent as `aspect_ratio`, a size as `size`.
 */
const RECRAFT_RATIOS = [
  "1:1",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
  "16:9",
  "9:16",
  "1:2",
  "2:1",
  "14:10",
  "10:14",
  "4:5",
  "5:4",
  "6:10",
] as const;
const RECRAFT_SIZES = [
  "1024x1024",
  "1536x768",
  "768x1536",
  "1280x832",
  "832x1280",
  "1216x896",
  "896x1216",
  "1152x896",
  "896x1152",
  "832x1344",
  "1280x896",
  "896x1280",
  "1344x768",
  "768x1344",
] as const;
const RECRAFT_PRO_SIZES = [
  "2048x2048",
  "3072x1536",
  "1536x3072",
  "2560x1664",
  "1664x2560",
  "2432x1792",
  "1792x2432",
  "2304x1792",
  "1792x2304",
  "1664x2688",
  "2560x1792",
  "1792x2560",
  "2688x1536",
  "1536x2688",
] as const;
const sizeNames = (sizes: readonly string[]): Record<string, string> =>
  Object.fromEntries(sizes.map((size) => [size, size.replace("x", " × ")]));

function recraft(options: {
  id: string;
  label: string;
  endpoint: string;
  vector: boolean;
  sizes: readonly string[];
}): ReplicateModelDefinition {
  return {
    profile: nativeProfile({
      id: options.id,
      label: options.label,
      action: "make-image",
      endpoint: options.endpoint,
      mode: options.vector ? "text-to-vector" : "text-to-image",
      inputs: [],
      output: { kind: "image", maxCount: 8 },
      maxContextCharacters: 10000,
      parameters: {
        aspectRatio: choice([...RECRAFT_RATIOS, ...options.sizes], "1:1"),
      },
      presentation: {
        words: "required",
        parameters: {
          aspectRatio: shown("Shape", {
            role: "shape",
            values: sizeNames(options.sizes),
          }),
        },
      },
      generatedAudio: "unsupported",
      deadlineSeconds: 600,
    }),
    timeoutMs: 8 * MINUTE,
    pollIntervalMs: 1000,
    ...(options.vector ? { unavailableReason: NO_VECTOR_STORAGE } : {}),
    input: (call) => {
      const shape = text(call, "aspectRatio");
      return {
        prompt: call.sentInstructions,
        ...(shape.includes("x") ? { size: shape } : { aspect_ratio: shape }),
      };
    },
  };
}

/**
 * Nano Banana 2, 2 Lite and Pro — google/nano-banana-2[-lite], -pro. Up to 14
 * pictures in `image_input`, JPG or PNG. Nano Banana 2 adds 1K/2K/4K and Google
 * web and image search; 2 Lite has neither; Pro has 1K/2K/4K, three safety
 * levels and an optional fallback to bytedance/seedream-5 when it is busy.
 */
const NANO_2_SHAPES = [
  "1:1",
  "1:4",
  "1:8",
  "2:3",
  "3:2",
  "3:4",
  "4:1",
  "4:3",
  "4:5",
  "5:4",
  "8:1",
  "9:16",
  "16:9",
  "21:9",
  "match_input_image",
] as const;
const NANO_PRO_SHAPES = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
  "match_input_image",
] as const;
const SAME_AS_PICTURE = { match_input_image: "Same as picture" };
const FORMAT = shown("Format", { values: { jpg: "JPG", png: "PNG" } });

type NanoTier = "nano-banana-2" | "nano-banana-2-lite" | "nano-banana-pro";
const NANO_TIERS: Record<
  NanoTier,
  {
    label: string;
    shapes: readonly string[];
    parameters: ModelProfile["parameters"];
    presentation: NonNullable<ModelProfile["presentation"]>["parameters"];
    input(call: ModelCall): Record<string, unknown>;
  }
> = {
  "nano-banana-2": {
    label: "Nano Banana 2",
    shapes: NANO_2_SHAPES,
    parameters: {
      resolution: choice(["1K", "2K", "4K"], "1K"),
      googleSearch: toggle(false),
      imageSearch: toggle(false),
      outputFormat: choice(["jpg", "png"], "jpg"),
    },
    presentation: {
      resolution: shown("Resolution", { role: "resolution" }),
      googleSearch: shown("Web search"),
      imageSearch: shown("Image search"),
      outputFormat: FORMAT,
    },
    input: (call) => ({
      resolution: text(call, "resolution"),
      google_search: flag(call, "googleSearch"),
      image_search: flag(call, "imageSearch"),
      output_format: text(call, "outputFormat"),
    }),
  },
  "nano-banana-2-lite": {
    label: "Nano Banana 2 Lite",
    shapes: NANO_2_SHAPES,
    parameters: { outputFormat: choice(["jpg", "png"], "jpg") },
    presentation: { outputFormat: FORMAT },
    input: (call) => ({ output_format: text(call, "outputFormat") }),
  },
  "nano-banana-pro": {
    label: "Nano Banana Pro",
    shapes: NANO_PRO_SHAPES,
    parameters: {
      resolution: choice(["1K", "2K", "4K"], "2K"),
      outputFormat: choice(["jpg", "png"], "jpg"),
      safetyFilterLevel: choice(
        ["block_low_and_above", "block_medium_and_above", "block_only_high"],
        "block_only_high",
      ),
      allowFallbackModel: toggle(false),
    },
    presentation: {
      resolution: shown("Resolution", { role: "resolution" }),
      outputFormat: FORMAT,
      safetyFilterLevel: shown("Safety filter", {
        values: {
          block_low_and_above: "Strict",
          block_medium_and_above: "Medium",
          block_only_high: "Lenient",
        },
      }),
      allowFallbackModel: shown("Use Seedream 5 when busy"),
    },
    input: (call) => ({
      resolution: text(call, "resolution"),
      output_format: text(call, "outputFormat"),
      safety_filter_level: text(call, "safetyFilterLevel"),
      allow_fallback_model: flag(call, "allowFallbackModel"),
    }),
  },
};

function nano(tier: NanoTier, edit: boolean): ReplicateModelDefinition {
  const model = NANO_TIERS[tier];
  const inputs: ModelProfile["inputs"] = edit
    ? [
        { role: "primary", kinds: ["image"], minCount: 1, maxCount: 1 },
        { role: "reference", kinds: ["image"], minCount: 0, maxCount: 13 },
      ]
    : [{ role: "reference", kinds: ["image"], minCount: 0, maxCount: 14 }];
  return {
    profile: nativeProfile({
      id: edit ? `${tier}-edit` : tier,
      label: model.label,
      action: edit ? "edit-image" : "make-image",
      endpoint: `google/${tier}`,
      mode: edit ? "image-edit" : "text-to-image",
      inputs,
      output: { kind: "image", maxCount: 8 },
      parameters: {
        aspectRatio: choice(model.shapes, edit ? "match_input_image" : "1:1"),
        ...model.parameters,
      },
      presentation: {
        words: "required",
        parameters: {
          aspectRatio: shown("Shape", { role: "shape", values: SAME_AS_PICTURE }),
          ...model.presentation,
        },
      },
      generatedAudio: "unsupported",
      deadlineSeconds: 600,
    }),
    timeoutMs: 8 * MINUTE,
    pollIntervalMs: 1000,
    ...(edit ? {} : { preflight: matchNeedsPicture }),
    input: (call) =>
      withOptional(
        {
          prompt: call.sentInstructions,
          aspect_ratio: text(call, "aspectRatio"),
          ...model.input(call),
        },
        {
          image_input: edit
            ? [requiredUrl(call, "primary"), ...urls(call, "reference")]
            : urls(call, "reference"),
        },
      ),
  };
}

/**
 * GPT Image 2 — openai/gpt-image-2. Makes or edits with `input_images`, 18
 * shapes and sizes up to 3840×2160, four quality levels, transparent or opaque
 * backgrounds, compression, three formats and the lower moderation level. One
 * picture per call; more come from more slots. Vidra pays through Replicate,
 * so no OpenAI key or end-user id is sent.
 */
const GPT_2_SHAPES = [
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

function gptImage2(edit: boolean): ReplicateModelDefinition {
  return {
    profile: nativeProfile({
      id: edit ? "gpt-image-2-edit" : "gpt-image-2",
      label: "GPT Image 2",
      action: edit ? "edit-image" : "make-image",
      endpoint: "openai/gpt-image-2",
      mode: edit ? "image-edit" : "text-to-image",
      inputs: edit
        ? [
            { role: "primary", kinds: ["image"], minCount: 1, maxCount: 1 },
            { role: "reference", kinds: ["image"], minCount: 0, maxCount: 15 },
          ]
        : [{ role: "reference", kinds: ["image"], minCount: 0, maxCount: 16 }],
      output: { kind: "image", maxCount: 8 },
      parameters: {
        aspectRatio: choice(GPT_2_SHAPES, edit ? "auto" : "1:1"),
        quality: choice(["low", "medium", "high", "auto"], "auto"),
        background: choice(["auto", "transparent", "opaque"], "auto"),
        outputCompression: range(0, 100, 1, 90),
        outputFormat: choice(["png", "jpeg", "webp"], "webp"),
        moderation: choice(["auto", "low"], "auto"),
      },
      constraints: [
        {
          parameter: "background",
          equals: "transparent",
          requires: { outputFormat: ["png", "webp"] },
          reason: "A transparent background needs PNG or WebP.",
        },
      ],
      presentation: {
        words: "required",
        parameters: {
          aspectRatio: shown("Shape", { role: "shape", values: { auto: "Auto" } }),
          quality: shown("Quality", {
            values: { low: "Low", medium: "Medium", high: "High", auto: "Auto" },
          }),
          background: shown("Background", {
            values: { auto: "Auto", transparent: "Transparent", opaque: "Opaque" },
          }),
          outputCompression: shown("Compression", { format: "percent" }),
          outputFormat: shown("Format", {
            values: { png: "PNG", jpeg: "JPEG", webp: "WebP" },
          }),
          moderation: shown("Moderation", {
            values: { auto: "Standard", low: "Low" },
          }),
        },
      },
      generatedAudio: "unsupported",
      deadlineSeconds: 900,
    }),
    timeoutMs: 12 * MINUTE,
    pollIntervalMs: 2000,
    input: (call) =>
      withOptional(
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
        {
          input_images: edit
            ? [requiredUrl(call, "primary"), ...urls(call, "reference")]
            : urls(call, "reference"),
        },
      ),
  };
}

/**
 * Recraft Remove Background and Vectorize — recraft-ai/recraft-remove-background,
 * recraft-ai/recraft-vectorize. One `image` and no other input. The picture
 * must be PNG, JPG or WebP, at most 5 MB and 16 MP, 256 to 4096 px a side;
 * the size is checked before any spend.
 */
const UTILITY_PIXELS = 16_000_000;
function utilityPreflight(call: ModelCall): string | undefined {
  const [width, height] = String(call.parameters.sourceSize ?? "")
    .split(":")
    .map(Number);
  if (!width || !height) return "This picture's size must be checked first.";
  if (Math.min(width, height) < 256)
    return "This picture is too small. Choose one at least 256 px on each side.";
  if (Math.max(width, height) > 4096 || width * height > UTILITY_PIXELS)
    return "This picture is too large. Choose one up to 4096 px a side and 16 megapixels.";
  return undefined;
}

function recraftUtility(options: {
  id: string;
  label: string;
  action: "remove-background" | "vectorize-image";
  endpoint: string;
  mode: string;
  vector: boolean;
}): ReplicateModelDefinition {
  return {
    profile: nativeProfile({
      id: options.id,
      label: options.label,
      action: options.action,
      endpoint: options.endpoint,
      mode: options.mode,
      inputs: [
        {
          role: "primary",
          kinds: ["image"],
          minCount: 1,
          maxCount: 1,
          maxBytes: megabytes(5),
        },
      ],
      output: { kind: "image", maxCount: 1 },
      parameters: {
        sourceSize: { policy: "derived", from: "input-aspect", role: "primary" },
      },
      presentation: {
        words: "none",
        parameters: { sourceSize: shown("Size", { hidden: true }) },
      },
      generatedAudio: "unsupported",
      deadlineSeconds: 300,
    }),
    timeoutMs: 4 * MINUTE,
    pollIntervalMs: 1000,
    ...(options.vector ? { unavailableReason: NO_VECTOR_STORAGE } : {}),
    preflight: utilityPreflight,
    input: (call) => ({ image: requiredUrl(call, "primary") }),
  };
}

export const STUDIO_PICTURE_MODEL_DEFINITIONS: readonly ReplicateModelDefinition[] =
  [
    nano("nano-banana-2-lite", false),
    recraft({ id: "recraft-v4.1", label: "Recraft V4.1", endpoint: "recraft-ai/recraft-v4.1", vector: false, sizes: RECRAFT_SIZES }),
    recraft({ id: "recraft-v4.1-svg", label: "Recraft V4.1 Vector", endpoint: "recraft-ai/recraft-v4.1-svg", vector: true, sizes: RECRAFT_SIZES }),
    gptImage2(false),
    nano("nano-banana-2", false),
    recraft({ id: "recraft-v4.1-pro", label: "Recraft V4.1 Pro", endpoint: "recraft-ai/recraft-v4.1-pro", vector: false, sizes: RECRAFT_PRO_SIZES }),
    recraft({ id: "recraft-v4.1-pro-svg", label: "Recraft V4.1 Pro Vector", endpoint: "recraft-ai/recraft-v4.1-pro-svg", vector: true, sizes: RECRAFT_PRO_SIZES }),
    nano("nano-banana-pro", false),
    nano("nano-banana-2-lite", true),
    gptImage2(true),
    nano("nano-banana-2", true),
    nano("nano-banana-pro", true),
    recraftUtility({ id: "recraft-remove-background", label: "Recraft Remove Background", action: "remove-background", endpoint: "recraft-ai/recraft-remove-background", mode: "background-removal", vector: false }),
    recraftUtility({ id: "recraft-vectorize", label: "Recraft Vectorize", action: "vectorize-image", endpoint: "recraft-ai/recraft-vectorize", mode: "vectorize", vector: true }),
  ];
