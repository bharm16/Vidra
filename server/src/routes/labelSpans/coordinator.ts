import { logger } from "@infrastructure/Logger";
import { labelSpans } from "@llm/span-labeling/SpanLabelingService";
import type { AIModelService } from "@services/ai-model/AIModelService";
import type { SpanLabelingCacheService } from "@services/cache/SpanLabelingCacheService";
import type {
  LabelSpansParams,
  LabelSpansResult,
  ValidationPolicy,
} from "@llm/span-labeling/types";

interface LabelSpansCoordinatorInput {
  payload: LabelSpansParams;
  text: string;
  policy?: ValidationPolicy | null;
  templateVersion?: string | null;
  requestId?: string;
  userId?: string;
  startTimeMs: number;
}

export interface LabelSpansCoordinatorResult {
  result: LabelSpansResult | null;
  headers: Record<string, string>;
}

export function createLabelSpansCoordinator(
  aiService: AIModelService,
  spanLabelingCache: SpanLabelingCacheService | null = null,
): {
  resolve: (
    input: LabelSpansCoordinatorInput,
  ) => Promise<LabelSpansCoordinatorResult>;
} {
  return {
    async resolve({
      payload,
      text,
      policy,
      templateVersion,
      requestId,
      userId,
      startTimeMs,
    }: LabelSpansCoordinatorInput): Promise<LabelSpansCoordinatorResult> {
      const headers: Record<string, string> = {};
      const operation = "labelSpans";
      const cachePolicy = policy ?? null;
      const cacheTemplateVersion = templateVersion ?? null;

      // When no cache is configured, fall through to a direct compute.
      // Coalescing lives in the cache layer, so the no-cache path intentionally
      // has no single-flight — each caller issues its own LLM request.
      if (!spanLabelingCache) {
        const apiStartTime = performance.now();
        const result = await labelSpans(payload, aiService);
        const apiTime = Math.round(performance.now() - apiStartTime);

        logger.info("Operation completed.", {
          operation,
          requestId,
          userId,
          duration: Math.round(performance.now() - startTimeMs),
          apiTime,
          textLength: text.length,
          spanCount: result.spans?.length || 0,
          cacheHit: false,
          coalesced: false,
        });

        headers["X-Cache"] = "MISS";
        headers["X-API-Time"] = `${apiTime}ms`;
        return { result, headers };
      }

      // The key must exist before the value does, so this is the router's
      // pre-flight answer. It replaces a static ModelConfig read that could
      // not see client availability or circuit state, which let a fallback
      // provider's labels be stored under the primary's key.
      const cacheProvider =
        aiService.resolveExecution("span_labeling").provider;
      const ttl = text.length > 2000 ? 300 : 3600;
      const operationStart = performance.now();

      const { value: result, source } = await spanLabelingCache.getOrCompute(
        text,
        cachePolicy,
        cacheTemplateVersion,
        () => labelSpans(payload, aiService),
        { ttl, provider: cacheProvider },
      );

      const elapsed = Math.round(performance.now() - operationStart);

      if (source === "cache") {
        logger.debug("Span labeling cache hit", {
          operation,
          requestId,
          userId,
          cacheTime: elapsed,
          textLength: text.length,
          spanCount: result.spans.length,
          duration: Math.round(performance.now() - startTimeMs),
        });
        headers["X-Cache"] = "HIT";
        headers["X-Cache-Time"] = `${elapsed}ms`;
      } else if (source === "coalesced") {
        logger.debug("Span labeling request coalesced", {
          operation,
          requestId,
          userId,
          coalescedTime: elapsed,
          textLength: text.length,
        });
        headers["X-Cache"] = "COALESCED";
        headers["X-Coalesced"] = "1";
        headers["X-Coalesced-Time"] = `${elapsed}ms`;
      } else {
        // Cache-miss path runs on every uncached labeling request — log at
        // DEBUG to keep INFO-level streams free for higher-signal events.
        // Aggregate metrics live in MetricsService; this log is for ad-hoc
        // request tracing only.
        logger.debug("Span labeling cache miss", {
          operation,
          requestId,
          userId,
          duration: Math.round(performance.now() - startTimeMs),
          apiTime: elapsed,
          textLength: text.length,
          spanCount: result.spans?.length || 0,
          cacheHit: false,
          coalesced: false,
        });
        headers["X-Cache"] = "MISS";
        headers["X-API-Time"] = `${elapsed}ms`;
      }

      return { result, headers };
    },
  };
}
