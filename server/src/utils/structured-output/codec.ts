import { z } from "zod";
import type { StructuredOutputSchema } from "./types";

export interface StructuredOutputCodec<T> {
  schema: StructuredOutputSchema;
  parse(value: unknown): T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Strict provider mode requires closed objects with every property required. */
function isClosedSchema(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (Array.isArray(value.anyOf)) return value.anyOf.every(isClosedSchema);
  if (value.type === "array") return isClosedSchema(value.items);
  if (value.type !== "object") return typeof value.type === "string" || Array.isArray(value.type);
  if (!isRecord(value.properties) || value.additionalProperties !== false || !Array.isArray(value.required)) return false;
  const required: unknown[] = value.required;
  return Object.entries(value.properties).every(([key, schema]) => required.includes(key) && isClosedSchema(schema));
}

/** A runtime parser and its provider wire shape travel as one result contract. */
export function createStructuredOutputCodec<T>(parser: z.ZodType<T>, wireSchema?: Record<string, unknown>): StructuredOutputCodec<T> {
  const schema = wireSchema ?? z.toJSONSchema(parser, { io: "input" });
  const type = schema.type;
  if (type !== "object" && type !== "array") throw new Error("Structured output requires an object or array wire schema");
  return { schema: { ...schema, type, strict: isClosedSchema(schema) }, parse: value => parser.parse(value) };
}
