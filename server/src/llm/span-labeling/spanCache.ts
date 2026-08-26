import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";
import type { SpanLabelingCacheService } from "@services/cache/SpanLabelingCacheService";
import type { LabelSpansResult, ValidationPolicy } from "./types";

/**
 * Cache TTL (seconds) for a labeled prompt.
 *
 * Long prompts churn more and are likelier to be one-offs, so they cache
 * briefly; short prompts are stable and cache for the hour. This heuristic is
 * the single source of truth — the port adapter, the blocking route
 * coordinator, and the streaming handler all read it here.
 */
export function spanCacheTtlSeconds(textLength: number): number {
  return textLength > 2000 ? 300 : 3600;
}

export interface CachedSpanResult {
  result: LabelSpansResult;
  source: "cache" | "computed" | "coalesced";
}

/**
 * Run `compute` behind `SpanLabelingCacheService.getOrCompute` with the shared
 * TTL heuristic and provider-keying, returning both the result and the cache
 * source. This is the one place that owns "how span labeling is cached": the
 * port adapter uses it and drops `source`; the blocking route coordinator uses
 * it and maps `source` onto its X-Cache headers.
 *
 * The provider is the router's pre-flight answer (the cache key must exist
 * before the value does); it is accurate unless a circuit trips mid-call, and
 * the post-compute paths that CAN key on the produced provider (the streaming
 * handler's backfill) do so themselves.
 */
export async function computeCachedSpans(params: {
  cache: SpanLabelingCacheService;
  aiService: AIExecutionPort;
  text: string;
  policy: ValidationPolicy | null;
  templateVersion: string | null;
  compute: () => Promise<LabelSpansResult>;
}): Promise<CachedSpanResult> {
  const provider = params.aiService.resolveExecution("span_labeling").provider;

  const { value, source } = await params.cache.getOrCompute(
    params.text,
    params.policy,
    params.templateVersion,
    params.compute,
    { ttl: spanCacheTtlSeconds(params.text.length), provider },
  );

  return { result: value as LabelSpansResult, source };
}
