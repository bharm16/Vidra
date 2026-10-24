import { sha256Hex } from "@utils/hash";
import type { SpanLabelingPolicy } from "../types";

// Bump this to invalidate old cached span results when the NLP/LLM pipeline changes.
// v4: Fixed role to category transformation for Gemini provider (2024-12-28)
const SPAN_LABELING_CACHE_KEY_VERSION = "5";

export function generateCacheKey(
  text: string,
  policy: SpanLabelingPolicy | null,
  templateVersion: string | null,
  provider: string | null = null,
  identity = "",
): string {
  const textHash = buildTextHash(text);

  const policyString = JSON.stringify({
    v: SPAN_LABELING_CACHE_KEY_VERSION,
    policy: policy || {},
    templateVersion: templateVersion || "v1",
    provider: provider || "unknown",
    identity,
  });

  const policyHash = sha256Hex(policyString, 32);

  return `span:${textHash}:${policyHash}`;
}

export function buildTextPattern(text: string): string {
  return `${buildTextPrefix(text)}*`;
}

export function buildTextPrefix(text: string): string {
  return `span:${buildTextHash(text)}:`;
}

function buildTextHash(text: string): string {
  return sha256Hex(text, 16);
}
