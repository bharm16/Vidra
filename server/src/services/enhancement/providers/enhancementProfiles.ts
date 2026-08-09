/**
 * Which suggestion schema each provider is sent.
 *
 * Replaces two if-chains (`getEnhancementSchema`, `getCustomSuggestionSchema`)
 * that each asked the capability table whether the provider supports strict
 * JSON schema, plus an allowlist in `EnhancementV2Engine` that discarded any
 * provider it didn't recognise.
 *
 * That allowlist re-opened the very gap its own comment warned about: on a
 * provider outside {openai, groq, qwen} the engine passed no provider at all,
 * so schema selection fell back to resolving from `ModelConfig` — the
 * configured client, not the executing one. Those diverge exactly when a
 * client is unregistered or its circuit is open.
 *
 * This table is TOTAL over `ProviderType`, so there is no "provider I don't
 * recognise" branch left to get wrong.
 *
 * Only two shapes exist — a strict, grammar-constrained one and a loose
 * `json_object` one — so this is a table rather than a module per provider.
 * A profile module each would be four files saying "strict" or "loose".
 */

import type { ProviderType } from "@utils/provider/ProviderDetector";
import type { JSONSchema } from "@utils/provider/schemas/types";

const SUGGESTION_CATEGORIES = [
  "subject",
  "action",
  "camera",
  "lighting",
  "style",
  "technical",
  "shot",
  "environment",
  "audio",
  "mood",
] as const;

/**
 * Strict shape: grammar-constrained decoding guarantees the format at
 * generation time, so rich descriptions carry the rules and every property
 * must appear in `required`.
 */
function strictEnhancementSchema(isPlaceholder: boolean): JSONSchema {
  const required = ["text", "explanation"];
  if (isPlaceholder) {
    required.push("category");
  }

  return {
    name: "enhancement_suggestions",
    strict: true,
    type: "object",
    required: ["scene_summary", "suggestions"],
    additionalProperties: false,
    properties: {
      scene_summary: {
        type: "string",
        description:
          "ONE sentence identifying the scene's setting, tone, and constraints visible in the full prompt (e.g., 'aerial drone shot over urban skyline at sunset — suggestions must be airborne; ground-based movements are invalid'). Emit BEFORE the suggestions array. The constraints stated here apply to every suggestion that follows.",
      },
      suggestions: {
        type: "array",
        items: {
          type: "object",
          required,
          additionalProperties: false,
          properties: {
            text: {
              type: "string",
              description:
                "Replacement phrase (2-20 words). Must fit grammatically in surrounding context. No leading/trailing punctuation unless part of the phrase.",
            },
            category: {
              type: "string",
              description:
                "Taxonomy category for the suggestion. Valid values: subject, action, camera, lighting, style, technical, shot, environment, audio, mood.",
              enum: [...SUGGESTION_CATEGORIES],
            },
            explanation: {
              type: "string",
              description:
                "Brief explanation of visual effect or why this replacement works (under 15 words).",
            },
            slot: {
              type: "string",
              description:
                "Optional: Specific slot within category (e.g., subject.appearance, camera.movement).",
            },
            visual_focus: {
              type: "string",
              description:
                "Optional: What the camera should focus on with this suggestion.",
            },
          },
        },
      },
    },
  };
}

/**
 * Loose shape for `json_object` mode: a top-level object wrapper (Groq
 * rejects a bare array), minimal descriptions to save tokens on an 8B model,
 * and category as a free string rather than an enum.
 *
 * `scene_summary` is declared in `properties` — so the prompt's instruction is
 * reinforced by the documented shape — but deliberately NOT in `required`:
 * Groq's json_object mode does not honor required-arrays the way OpenAI
 * strict mode does, and Qwen drops the field on ~30% of responses. Requiring
 * it here would reject otherwise valid suggestion arrays. The prompt drives
 * emission; the engine tolerates absence (sceneSummary = null).
 */
function looseEnhancementSchema(isPlaceholder: boolean): JSONSchema {
  const required = ["text", "explanation"];
  if (isPlaceholder) {
    required.push("category");
  }

  return {
    type: "object",
    required: ["suggestions"],
    properties: {
      scene_summary: { type: "string" },
      suggestions: {
        type: "array",
        items: {
          type: "object",
          required,
          properties: {
            text: { type: "string" },
            category: { type: "string" },
            explanation: { type: "string" },
            slot: { type: "string" },
            visual_focus: { type: "string" },
          },
        },
      },
    },
  };
}

function strictCustomSuggestionSchema(): JSONSchema {
  return {
    name: "custom_suggestions",
    strict: true,
    type: "object",
    // scene_summary is required because OpenAI strict mode demands every
    // property appear in `required`; nullability is expressed in the type.
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

function looseCustomSuggestionSchema(): JSONSchema {
  // Same scene_summary reasoning as the loose enhancement schema; Qwen drops
  // the field ~60% of the time on this path.
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

export interface EnhancementProviderProfile {
  /** Whether the provider is sent grammar-constrained (strict) schemas. */
  strictSchema: boolean;
  enhancementSchema(isPlaceholder: boolean): JSONSchema;
  customSuggestionSchema(): JSONSchema;
}

const STRICT_PROFILE: EnhancementProviderProfile = {
  strictSchema: true,
  enhancementSchema: strictEnhancementSchema,
  customSuggestionSchema: strictCustomSuggestionSchema,
};

const LOOSE_PROFILE: EnhancementProviderProfile = {
  strictSchema: false,
  enhancementSchema: looseEnhancementSchema,
  customSuggestionSchema: looseCustomSuggestionSchema,
};

/**
 * Total over `ProviderType`. The values reproduce exactly what the capability
 * if-chains produced: strict for the grammar-constrained providers (OpenAI,
 * Gemini), loose for everything else.
 */
export const ENHANCEMENT_PROVIDER_PROFILES: Record<
  ProviderType,
  EnhancementProviderProfile
> = {
  openai: STRICT_PROFILE,
  gemini: STRICT_PROFILE,
  groq: LOOSE_PROFILE,
  qwen: LOOSE_PROFILE,
  anthropic: LOOSE_PROFILE,
  unknown: LOOSE_PROFILE,
};

export function resolveEnhancementProfile(
  provider: ProviderType,
): EnhancementProviderProfile {
  return ENHANCEMENT_PROVIDER_PROFILES[provider];
}
