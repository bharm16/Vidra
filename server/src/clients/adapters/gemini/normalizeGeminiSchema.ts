import { isRecord, unwrapSchemaBody, walkSchema } from "../schemaNormalization";

// Gemini delta: responseSchema rejects these keys at any node.
const GEMINI_UNSUPPORTED_KEYS = new Set([
  "additionalProperties",
  "$schema",
  "$id",
]);

export function normalizeGeminiSchema(
  schemaInput: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = walkSchema(unwrapSchemaBody(schemaInput), {
    drop: GEMINI_UNSUPPORTED_KEYS,
  });
  if (!isRecord(normalized)) {
    throw new Error(
      "Gemini schema normalization failed: expected an object schema.",
    );
  }

  return normalized;
}
