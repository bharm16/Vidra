import { detectAndGetCapabilities } from "@utils/provider/ProviderDetector";
import {
  buildCapabilityOptions,
  type JSONSchema,
  type SchemaOptions,
} from "./types";

/**
 * Custom Suggestion Schema Factory
 */
export function getCustomSuggestionSchema(
  options: SchemaOptions = {},
): JSONSchema {
  const { capabilities } = detectAndGetCapabilities(
    buildCapabilityOptions(options, "custom_suggestions"),
  );

  if (capabilities.strictJsonSchema) {
    return {
      name: "custom_suggestions",
      strict: true,
      type: "object",
      // Sub-project B2: scene_summary now part of the strict shape on the
      // custom-request path. Required because OpenAI strict mode demands all
      // properties be in required; nullable handled via type union.
      required: ["scene_summary", "suggestions"],
      additionalProperties: false,
      properties: {
        scene_summary: {
          type: ["string", "null"],
          description:
            "ONE sentence identifying the scene's setting, tone, and constraints visible in the full prompt. Emit BEFORE the suggestions array. The constraints stated here apply to every suggestion that follows.",
        },
        suggestions: {
          type: "array",
          items: {
            type: "object",
            required: ["text"],
            additionalProperties: false,
            properties: {
              text: {
                type: "string",
                description:
                  "Replacement phrase that fulfills the custom request.",
              },
              category: {
                type: "string",
                description: "Category of the suggestion.",
              },
              explanation: {
                type: "string",
                description: "Why this suggestion fulfills the request.",
              },
            },
          },
        },
      },
    };
  }

  // Groq/Llama - object wrapper for json_object mode.
  // Sub-project B2: scene_summary declared in properties (so the prompt's
  // instruction is reinforced by schema shape) but NOT in required — Groq
  // json_object treats required as advisory, and Qwen drops the field
  // ~60% of the time. Mirrors the enhancement schema convention.
  return {
    type: "object",
    required: ["suggestions"],
    properties: {
      scene_summary: { type: "string" },
      suggestions: {
        type: "array",
        items: {
          type: "object",
          required: ["text"],
          properties: {
            text: { type: "string" },
            category: { type: "string" },
            explanation: { type: "string" },
          },
        },
      },
    },
  };
}
