import {
  isRecord,
  unwrapSchemaBody,
  walkSchema,
  type JsonRecord,
} from "../schemaNormalization";

interface NormalizedOpenAiSchema {
  name: string;
  schema: JsonRecord;
}

// OpenAI structured-output delta: strip wrapper metadata at every node and
// stamp additionalProperties: false on object nodes (strict-mode idiom).
const SCHEMA_METADATA_KEYS = new Set(["name", "strict", "$schema", "$id"]);
const OPENAI_FALLBACK_SCHEMA_NAME = "structured_response";

function toSchemaName(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeOpenAiSchema(
  schemaInput: Record<string, unknown>,
): NormalizedOpenAiSchema {
  const schemaBody = unwrapSchemaBody(schemaInput);

  const schemaName =
    toSchemaName(schemaInput.name) ??
    toSchemaName((schemaBody as Record<string, unknown>).name) ??
    OPENAI_FALLBACK_SCHEMA_NAME;

  const normalizedBody = walkSchema(schemaBody, {
    drop: SCHEMA_METADATA_KEYS,
    onObjectNode: (node) => {
      node.additionalProperties = false;
    },
  });
  if (!isRecord(normalizedBody)) {
    throw new Error("Schema normalization failed: expected an object schema.");
  }

  return {
    name: schemaName,
    schema: normalizedBody as JsonRecord,
  };
}
