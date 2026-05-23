import { detectAndGetCapabilities } from "@utils/provider/ProviderDetector";
import {
  buildCapabilityOptions,
  type JSONSchema,
  type SchemaOptions,
} from "./types";

/**
 * Video Optimization Schema Factory
 */
export function getVideoOptimizationSchema(
  options: SchemaOptions = {},
): JSONSchema {
  const { capabilities } = detectAndGetCapabilities(
    buildCapabilityOptions(options, "optimize_standard"),
  );

  if (capabilities.strictJsonSchema) {
    return getOpenAIVideoOptimizationSchema();
  }

  return getGroqVideoOptimizationSchema();
}

/**
 * OpenAI Video Optimization Schema
 *
 * Strict mode with descriptions that guide output
 */
function getOpenAIVideoOptimizationSchema(): JSONSchema {
  const SHOT_FRAMINGS = [
    "Extreme Close-Up",
    "Close-Up",
    "Medium Close-Up",
    "Medium Shot",
    "Medium Long Shot",
    "Cowboy Shot",
    "Full Shot",
    "Wide Shot",
    "Extreme Wide Shot",
    "Establishing Shot",
    "Master Shot",
    "Two-Shot",
    "Insert Shot",
    "Cutaway",
  ] as const;

  const CAMERA_ANGLES = [
    "Eye-Level Shot",
    "Low-Angle Shot",
    "High-Angle Shot",
    "Bird's-Eye View",
    "Worm's-Eye View",
    "Dutch Angle",
    "POV Shot",
    "Over-the-Shoulder",
  ] as const;

  return {
    name: "video_prompt_optimization",
    strict: true,
    type: "object",
    required: [
      "_creative_strategy",
      "shot_framing",
      "camera_angle",
      "camera_move",
      "camera_lens",
      "subject",
      "subject_details",
      "action",
      "setting",
      "time",
      "lighting",
      "style",
      "technical_specs",
      "variations",
    ],
    additionalProperties: false,
    properties: {
      _creative_strategy: {
        type: "string",
        description:
          "Explain WHY you chose this specific Angle, DOF (aperture), and FPS to serve the creative intent.",
      },
      shot_framing: {
        type: "string",
        description:
          "Categorical framing label. Must be exactly one of the enum values — do not add prefixes, suffixes, or prose.",
        enum: [...SHOT_FRAMINGS],
      },
      camera_angle: {
        type: "string",
        description:
          "Categorical camera-angle label. Must be exactly one of the enum values — do not add prefixes, suffixes, or prose.",
        enum: [...CAMERA_ANGLES],
      },
      camera_move: {
        type: ["string", "null"],
        description:
          'Camera movement only (e.g., "handheld tracking", "slow dolly in", "static tripod"). Do NOT include lens or aperture here — those go in camera_lens.',
      },
      camera_lens: {
        type: ["string", "null"],
        description:
          "Focal length plus aperture (e.g., '28mm at f/11', 'anamorphic 50mm at f/2.8', '85mm prime at f/1.8'). Match aperture to shot type: Wide=f/8-f/11, Medium=f/2.8-f/4, Close-up=f/1.4-f/2.0. May be null when no specific lens preference.",
      },
      subject: {
        type: ["string", "null"],
        description: "Main subject if present; otherwise null.",
      },
      subject_details: {
        type: ["array", "null"],
        description:
          "2-3 specific, visible subject identifiers for consistency (clothing/breed/color/accessories). Each item must be 1-6 words (short noun phrase), no verbs.",
        minItems: 2,
        maxItems: 3,
        items: { type: "string" },
      },
      action: {
        type: ["string", "null"],
        description:
          "ONE continuous, physically plausible action as a single present-participle (-ing) verb phrase (4-12 words; no second verb).",
      },
      setting: {
        type: ["string", "null"],
        description:
          "Specific location/environment grounding the action (camera-visible).",
      },
      time: {
        type: ["string", "null"],
        description:
          'Time-of-day or era if relevant (e.g., "golden hour", "midnight").',
      },
      lighting: {
        type: ["string", "null"],
        description:
          "Lighting described with source, direction, quality, and color temperature if possible.",
      },
      style: {
        type: ["string", "null"],
        description:
          'Specific aesthetic reference (film stock/genre/director). Avoid generic "cinematic".',
      },
      technical_specs: {
        type: "object",
        required: [
          "lighting",
          "camera",
          "style",
          "aspect_ratio",
          "frame_rate",
          "duration",
          "audio",
        ],
        additionalProperties: false,
        properties: {
          lighting: {
            type: "string",
            description:
              "Precise lighting setup with source, direction, quality, and color temperature.",
          },
          camera: {
            type: "string",
            description:
              "Camera behavior + angle + lens + aperture. Match aperture to shot type: Wide=f/11, Close-up=f/1.8.",
          },
          style: {
            type: "string",
            description:
              'Film stock/genre/medium reference (e.g., "Shot on 35mm, film noir aesthetic").',
          },
          aspect_ratio: {
            type: "string",
            enum: ["16:9", "9:16", "4:3", "2.35:1", "2.39:1", "1:1"],
          },
          frame_rate: {
            type: "string",
            description:
              "24fps for cinematic, 30fps for broadcast, 60fps for action.",
            enum: ["24fps", "30fps", "60fps"],
          },
          duration: {
            type: "string",
            description: "Video duration, typically 4-8s.",
          },
          audio: {
            type: "string",
            description: "Audio note if relevant.",
          },
        },
      },
      variations: {
        type: "array",
        description:
          "Two variations: one with different angle, one with different lighting.",
        items: {
          type: "object",
          required: ["label", "prompt"],
          additionalProperties: false,
          properties: {
            label: { type: "string" },
            prompt: { type: "string" },
          },
        },
      },
      // NOTE: shot_plan is intentionally excluded from OpenAI strict schema.
      // It's passthrough data from the shot interpreter, not generated by the LLM.
      // Including it with type: ['object', 'null'] breaks strict mode validation.
    },
  };
}

/**
 * Groq/Llama Video Optimization Schema
 *
 * Simplified structure
 */
function getGroqVideoOptimizationSchema(): JSONSchema {
  return {
    type: "object",
    required: [
      "_creative_strategy",
      "shot_framing",
      "camera_angle",
      "camera_move",
      "subject",
      "subject_details",
      "action",
      "setting",
      "time",
      "lighting",
      "style",
      "technical_specs",
    ],
    properties: {
      _creative_strategy: { type: "string" },
      shot_framing: { type: "string" },
      camera_angle: { type: "string" },
      camera_move: { type: ["string", "null"] },
      camera_lens: { type: ["string", "null"] },
      subject: { type: ["string", "null"] },
      subject_details: { type: ["array", "null"], items: { type: "string" } },
      action: { type: ["string", "null"] },
      setting: { type: ["string", "null"] },
      time: { type: ["string", "null"] },
      lighting: { type: ["string", "null"] },
      style: { type: ["string", "null"] },
      technical_specs: {
        type: "object",
        properties: {
          lighting: { type: "string" },
          camera: { type: "string" },
          style: { type: "string" },
          aspect_ratio: { type: "string" },
          frame_rate: { type: "string" },
          duration: { type: "string" },
          audio: { type: "string" },
        },
      },
      variations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            prompt: { type: "string" },
          },
        },
      },
      // NOTE: shot_plan excluded - passthrough data from shot interpreter
    },
  };
}
