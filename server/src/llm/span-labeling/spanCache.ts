import { canonicalJson } from "@shared/workflow/canonicalJson";
import { sanitizeOptions, sanitizePolicy } from "./utils/policyUtils";
import type { ResolvedExecution } from "@services/ai-model/types";
import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";
import type { SpanLabelingCacheService } from "@services/cache/SpanLabelingCacheService";
import type { LabelSpansParams, LabelSpansResult, ValidationPolicy } from "./types";

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

/** One identity for effective processing options and the selected execution. */
export function spanCacheIdentity(request: LabelSpansParams, execution: ResolvedExecution): string {
  return canonicalJson({ ownerId: request.ownerId, options: sanitizeOptions({ ...(request.maxSpans !== undefined ? { maxSpans: request.maxSpans } : {}), ...(request.minConfidence !== undefined ? { minConfidence: request.minConfidence } : {}), ...(request.templateVersion ? { templateVersion: request.templateVersion } : {}) }), policy: sanitizePolicy(request.policy ?? null), enableRepair: request.enableRepair === true, execution: { client: execution.client, provider: execution.provider, model: execution.model } });
}

export async function computeCachedSpans(params: {
  cache: SpanLabelingCacheService;
  request?: LabelSpansParams;
  aiService: AIExecutionPort;
  text: string;
  policy: ValidationPolicy | null;
  templateVersion: string | null;
  compute: (signal?: AbortSignal) => Promise<LabelSpansResult>;
}): Promise<CachedSpanResult> {
  const execution = params.aiService.resolveExecution("span_labeling");
  const provider = execution.provider;
  const request = params.request ?? { text: params.text, ...(params.policy ? { policy: params.policy } : {}), ...(params.templateVersion ? { templateVersion: params.templateVersion } : {}) };

  request.signal?.throwIfAborted();
  if (!request.ownerId) return { result: await params.compute(), source: "computed" };

  const { value, source } = await params.cache.getOrCompute(
    params.text,
    params.policy,
    params.templateVersion,
    params.compute,
    { ttl: spanCacheTtlSeconds(params.text.length), provider, ...(request.signal ? { signal: request.signal } : {}), identity: spanCacheIdentity(request, execution), shouldCache: value => value.meta.mixedExecutions !== true && (!value.meta.execution || spanCacheIdentity(request, value.meta.execution) === spanCacheIdentity(request, execution)) },
  );

  request.signal?.throwIfAborted();
  if (source !== "cache" && !request.signal?.aborted && value.meta.execution && spanCacheIdentity(request, value.meta.execution) !== spanCacheIdentity(request, execution)) {
    await params.cache.set(params.text, params.policy, params.templateVersion, value, { ttl: spanCacheTtlSeconds(params.text.length), provider: value.meta.execution.provider, identity: spanCacheIdentity(request, value.meta.execution) });
  }
  return { result: value, source };
}
