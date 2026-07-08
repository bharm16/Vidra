import { createHash } from "node:crypto";
import type {
  ReplayAiModelRequest,
  ReplayImagePreviewRequest,
} from "@shared/schemas/replay.schemas";

/**
 * Deterministic JSON serialization: object keys are sorted recursively so the
 * same logical request always hashes to the same cassette key.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const parts = Object.keys(record)
    .sort()
    .filter((k) => record[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`);
  return `{${parts.join(",")}}`;
}

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Cassette key for an aiService call. Keyed on the semantic request (operation
 * + prompts), NOT on tuning params (model, temperature, timeout) — those vary
 * by env without changing what was asked.
 */
export function aiModelRequestKey(request: ReplayAiModelRequest): string {
  return `ai-model:${sha256(stableStringify(request))}`;
}

/** Cassette key for an image preview provider call. userId is excluded. */
export function imagePreviewRequestKey(
  request: ReplayImagePreviewRequest,
): string {
  return `image-preview:${sha256(stableStringify(request))}`;
}
