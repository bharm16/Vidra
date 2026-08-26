import type { SpanLabelingTelemetryService } from "@services/observability/SpanLabelingTelemetryService";
import type {
  LabelSpansCoordinatorInput,
  LabelSpansCoordinatorResult,
} from "./coordinator";
import { toPublicSpan } from "./transform";

interface LabelSpansCoordinator {
  resolve: (
    input: LabelSpansCoordinatorInput,
  ) => Promise<LabelSpansCoordinatorResult>;
}

/**
 * Wraps a label-spans coordinator with the PostHog quality-telemetry trace
 * lifecycle. The trace's whole shape — start-before-resolve, cache-hit gating
 * on the coordinator's X-Cache header, and complete() on every exit path — is
 * span-labeling domain knowledge, so it belongs here rather than smeared across
 * the HTTP handler. When no telemetry service is configured the inner
 * coordinator is returned unwrapped (zero overhead).
 */
export function createTracedLabelSpansCoordinator(
  inner: LabelSpansCoordinator,
  telemetryService: SpanLabelingTelemetryService | null,
): LabelSpansCoordinator {
  if (!telemetryService) return inner;

  return {
    async resolve(input) {
      const trace = telemetryService.startSpanLabelingTrace(
        input.requestId ?? "unknown",
        input.userId ?? null,
      );

      try {
        const { result, headers } = await inner.resolve(input);

        if (!result) {
          trace.recordError("post_processing", new Error("no result"));
          trace.complete({
            outcome: "error",
            promptLength: input.text.length,
            spanCount: 0,
            provider: null,
            model: null,
            inputText: input.text,
            spans: [],
          });
          return { result, headers };
        }

        // Only TTL cache hits count toward cacheHit. The coordinator may also
        // return X-Cache: COALESCED (request-coalescing single-flight) or MISS —
        // those are distinct mechanisms and intentionally don't count here.
        if (headers["X-Cache"] === "HIT") {
          trace.recordCacheHit();
        }

        // Reuse the public-span transform so the telemetry span shape matches
        // what the client sees (role → category mapping included). Confidence /
        // start / end are intentionally not surfaced.
        const spans = (result.spans ?? []).map((span) => {
          const pub = toPublicSpan(span);
          return { text: pub.text, category: pub.category };
        });

        trace.complete({
          outcome: "success",
          promptLength: input.text.length,
          spanCount: result.spans?.length ?? 0,
          provider: (result.meta?.["provider"] as string | undefined) ?? null,
          model: (result.meta?.["model"] as string | undefined) ?? null,
          inputText: input.text,
          spans,
        });

        return { result, headers };
      } catch (error) {
        trace.recordError(
          "llm_call",
          error instanceof Error ? error : new Error(String(error)),
        );
        trace.complete({
          outcome: "error",
          promptLength: input.text.length,
          spanCount: 0,
          provider: null,
          model: null,
          inputText: input.text,
          spans: [],
        });
        throw error;
      }
    },
  };
}
