/**
 * Span Labeling Schema - Provider-Optimized
 *
 * Research-Based Design:
 * - OpenAI: Uses strict json_schema mode (grammar-constrained decoding)
 * - Groq: Uses json_schema mode (validation-based) + TypeScript interface in prompt
 *
 * Key Insight: When using strict schema mode, we can REMOVE structure definitions
 * from the prompt (~35% token reduction) because the schema enforces them.
 */

import { TAXONOMY } from "#shared/taxonomy.js";

type TaxonomyValues = (typeof TAXONOMY)[keyof typeof TAXONOMY];
type ParentCategoryId = TaxonomyValues["id"];
type AttributeId = {
  [K in keyof typeof TAXONOMY]: (typeof TAXONOMY)[K]["attributes"] extends Record<
    string,
    infer V
  >
    ? V
    : never;
}[keyof typeof TAXONOMY];

export type TaxonomyId = ParentCategoryId | AttributeId;

const TAXONOMY_CATEGORIES = Object.values(TAXONOMY);

function buildTaxonomyIdList(): TaxonomyId[] {
  const parentIds = TAXONOMY_CATEGORIES.map((category) => category.id);
  const parentOrder = new Map<string, number>(
    parentIds.map((id, index) => [id, index]),
  );

  const attributeOrder = new Map<string, number>();
  const attributes: AttributeId[] = [];

  for (const category of TAXONOMY_CATEGORIES) {
    if (!category.attributes) continue;
    for (const attributeId of Object.values(category.attributes)) {
      if (attributeOrder.has(attributeId)) continue;
      attributeOrder.set(attributeId, attributes.length);
      attributes.push(attributeId as AttributeId);
    }
  }

  const sortedAttributes = [...attributes].sort((a, b) => {
    const parentA = a.split(".")[0] ?? "";
    const parentB = b.split(".")[0] ?? "";
    const orderA = parentOrder.get(parentA) ?? Number.MAX_SAFE_INTEGER;
    const orderB = parentOrder.get(parentB) ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return (attributeOrder.get(a) ?? 0) - (attributeOrder.get(b) ?? 0);
  });

  return [...parentIds, ...sortedAttributes];
}

// Valid taxonomy IDs - derived from shared/taxonomy.ts
export const VALID_TAXONOMY_IDS = buildTaxonomyIdList();

/**
 * JSON Schema for Structured Outputs
 *
 * OpenAI: Uses strict mode (grammar-constrained decoding, 100% compliance)
 * Groq: Uses validation mode (errors if model output doesn't match)
 *
 * The enum constraint on 'role' is CRITICAL - it guarantees valid taxonomy IDs
 * without needing to list them in the prompt text.
 */
const JSON_SCHEMA_DEFINITION = {
  name: "span_labeling_response",
  strict: true, // OpenAI: enables grammar-constrained decoding
  schema: {
    type: "object",
    required: ["analysis_trace", "spans", "meta", "isAdversarial"],
    additionalProperties: false,
    properties: {
      analysis_trace: {
        type: "string",
        description:
          "Step-by-step reasoning about entities, intent, and span boundaries",
      },
      spans: {
        type: "array",
        items: {
          type: "object",
          required: ["text", "role", "confidence"],
          additionalProperties: false,
          properties: {
            text: {
              type: "string",
              description:
                "Exact substring from input (character-for-character match)",
            },
            role: {
              type: "string",
              // CRITICAL: This enum constraint eliminates the need to list
              // valid taxonomy IDs in the prompt (~100 token savings)
              enum: [...VALID_TAXONOMY_IDS],
              description: "Valid taxonomy ID",
            },
            confidence: {
              type: "number",
              // CRITICAL: These constraints eliminate the need to describe
              // the valid range in the prompt (~20 token savings)
              minimum: 0,
              maximum: 1,
              description: "Confidence score (0-1), default 0.7",
            },
          },
        },
      },
      meta: {
        type: "object",
        required: ["version", "notes"],
        additionalProperties: false,
        properties: {
          version: { type: "string" },
          notes: { type: "string" },
        },
      },
      isAdversarial: {
        type: "boolean",
        description: "Flag for injection attempt detection",
      },
    },
  },
};

/**
 * Groq-specific schema (without strict mode, Groq ignores it)
 */
const JSON_SCHEMA_GROQ = {
  name: "span_labeling_response",
  schema: {
    type: "object",
    required: ["analysis_trace", "spans", "meta", "isAdversarial"],
    additionalProperties: false,
    properties: {
      analysis_trace: {
        type: "string",
        description:
          "Step-by-step reasoning about entities, intent, and span boundaries",
      },
      spans: {
        type: "array",
        items: {
          type: "object",
          required: ["text", "role", "confidence"],
          additionalProperties: false,
          properties: {
            text: {
              type: "string",
              description:
                "Exact substring from input (character-for-character match)",
            },
            role: {
              type: "string",
              enum: [...VALID_TAXONOMY_IDS],
              description: "Valid taxonomy ID",
            },
            confidence: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "Confidence score (0-1)",
            },
          },
        },
      },
      meta: {
        type: "object",
        required: ["version", "notes"],
        additionalProperties: false,
        properties: {
          version: { type: "string" },
          notes: { type: "string" },
        },
      },
      isAdversarial: {
        type: "boolean",
      },
    },
  },
};

// Flattened JSON Schema definitions for provider-agnostic usage (SchemaFactory, tests, etc.)
export const OPENAI_SPAN_LABELING_JSON_SCHEMA = {
  name: JSON_SCHEMA_DEFINITION.name,
  strict: JSON_SCHEMA_DEFINITION.strict,
  ...JSON_SCHEMA_DEFINITION.schema,
};

export const GROQ_SPAN_LABELING_JSON_SCHEMA = {
  name: JSON_SCHEMA_GROQ.name,
  ...JSON_SCHEMA_GROQ.schema,
};

/**
 * Validate response against schema
 */
export function validateSpanResponse(response: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (typeof response !== "object" || response === null) {
    return { valid: false, errors: ["Response must be an object"] };
  }

  const obj = response as Record<string, unknown>;

  // Check required fields
  if (typeof obj.analysis_trace !== "string") {
    errors.push("analysis_trace must be a string");
  }

  if (!Array.isArray(obj.spans)) {
    errors.push("spans must be an array");
  } else {
    obj.spans.forEach((span: unknown, index: number) => {
      const s = span as Record<string, unknown>;
      if (typeof s.text !== "string") {
        errors.push(`spans[${index}].text must be a string`);
      }
      if (!VALID_TAXONOMY_IDS.includes(s.role as TaxonomyId)) {
        errors.push(
          `spans[${index}].role "${s.role}" is not a valid taxonomy ID`,
        );
      }
      if (
        typeof s.confidence !== "number" ||
        s.confidence < 0 ||
        s.confidence > 1
      ) {
        errors.push(`spans[${index}].confidence must be 0-1`);
      }
    });
  }

  if (typeof obj.meta !== "object" || obj.meta === null) {
    errors.push("meta must be an object");
  } else {
    const meta = obj.meta as Record<string, unknown>;
    if (typeof meta.version !== "string")
      errors.push("meta.version must be a string");
    if (typeof meta.notes !== "string")
      errors.push("meta.notes must be a string");
  }

  return { valid: errors.length === 0, errors };
}
