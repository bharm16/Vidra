/**
 * Shared JSON-schema normalization for the LLM adapters.
 *
 * The caller-side contract is the shared part: a caller's `schema` option may
 * be a bare JSON Schema or a `{name, strict, schema}` wrapper, and the
 * recursive walk that strips provider-unsupported keys is the same everywhere.
 * Each adapter keeps only its delta — which keys it drops and what it stamps
 * on object nodes.
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonRecord = { [key: string]: JsonValue };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looksLikeWrapperSchema(schema: Record<string, unknown>): boolean {
  if (!isRecord(schema.schema)) {
    return false;
  }

  if ("name" in schema || "strict" in schema) {
    return true;
  }

  return !(
    "type" in schema ||
    "properties" in schema ||
    "items" in schema ||
    "anyOf" in schema ||
    "oneOf" in schema ||
    "allOf" in schema ||
    "required" in schema
  );
}

/** Unwrap a `{name, strict, schema}` wrapper to its schema body (or pass through). */
export function unwrapSchemaBody(
  schemaInput: Record<string, unknown>,
): Record<string, unknown> {
  return looksLikeWrapperSchema(schemaInput)
    ? (schemaInput.schema as Record<string, unknown>)
    : schemaInput;
}

export interface WalkSchemaOptions {
  /** Keys removed at every node. */
  drop: ReadonlySet<string>;
  /** Called on every object-typed schema node after its keys are walked. */
  onObjectNode?: (node: Record<string, JsonValue>) => void;
}

function isObjectSchemaNode(schema: Record<string, JsonValue>): boolean {
  if ("properties" in schema) {
    return true;
  }

  const nodeType = schema.type;
  if (typeof nodeType === "string") {
    return nodeType === "object";
  }

  if (Array.isArray(nodeType)) {
    return nodeType.includes("object");
  }

  return false;
}

export function walkSchema(
  value: unknown,
  options: WalkSchemaOptions,
): JsonValue {
  if (Array.isArray(value)) {
    return value.map((entry) => walkSchema(entry, options));
  }

  if (!isRecord(value)) {
    return value as JsonValue;
  }

  const normalized: Record<string, JsonValue> = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    if (options.drop.has(key)) {
      continue;
    }
    normalized[key] = walkSchema(nestedValue, options);
  }

  if (options.onObjectNode && isObjectSchemaNode(normalized)) {
    options.onObjectNode(normalized);
  }

  return normalized;
}
