import type { Router, Request, Response } from "express";
import { Router as ExpressRouter } from "express";
import { logger } from "@infrastructure/Logger";
import { extractUserId } from "@utils/requestHelpers";
import { requestCoalescing } from "@middleware/requestCoalescing";
import type { AIModelService } from "@services/ai-model/AIModelService";
import type { SpanLabelingCacheService } from "@services/cache/SpanLabelingCacheService";
import type { SpanLabelingTelemetryService } from "@services/observability/SpanLabelingTelemetryService";
import type { ApiResponse } from "@shared/types/api";
import { createLabelSpansCoordinator } from "./labelSpans/coordinator";
import { parseLabelSpansRequest } from "./labelSpans/requestParser";
import { handleLabelSpansStreamRequest } from "./labelSpans/streamingHandler";
import { toPublicLabelSpansResult, toPublicSpan } from "./labelSpans/transform";
import type { PublicLabelSpansResult } from "./labelSpans/transform";

/**
 * Create label spans route with dependency injection
 */
export function createLabelSpansRoute(
  aiService: AIModelService,
  spanLabelingCache: SpanLabelingCacheService | null = null,
  telemetryService: SpanLabelingTelemetryService | null = null,
): Router {
  const router = ExpressRouter();
  const coordinator = createLabelSpansCoordinator(aiService, spanLabelingCache);

  router.post("/stream", async (req: Request, res: Response) => {
    const parsed = parseLabelSpansRequest(req.body);
    if (!parsed.ok) {
      return res.status(parsed.status).json({
        success: false,
        error: parsed.error,
      } satisfies ApiResponse<never>);
    }

    const { payload, text, policy, templateVersion } = parsed.data;
    const requestId = (req as Request & { id?: string }).id;
    const userId = extractUserId(req);
    const operation = "labelSpansStream";

    logger.debug("Starting operation.", {
      operation,
      requestId,
      userId,
      textLength: text.length,
    });

    await handleLabelSpansStreamRequest({
      res,
      payload,
      aiService,
      requestId,
      userId,
      spanLabelingCache,
      text,
      policy: policy ?? null,
      templateVersion: templateVersion ?? null,
    });

    return;
  });

  router.post(
    "/",
    requestCoalescing.middleware({ keyScope: "/api/llm/label-spans" }),
    async (req: Request, res: Response) => {
      const parsed = parseLabelSpansRequest(req.body);
      if (!parsed.ok) {
        return res.status(parsed.status).json({
          success: false,
          error: parsed.error,
        } satisfies ApiResponse<never>);
      }

      const {
        payload,
        text,
        maxSpans,
        minConfidence,
        policy,
        templateVersion,
      } = parsed.data;

      const startTime = performance.now();
      const operation = "labelSpans";
      const requestId = (req as Request & { id?: string }).id ?? "unknown";
      const userId = extractUserId(req);

      const trace = telemetryService?.startSpanLabelingTrace(requestId, userId);

      logger.debug("Starting operation.", {
        operation,
        requestId,
        userId,
        textLength: text.length,
        maxSpans,
        minConfidence,
        policy,
        templateVersion,
      });

      try {
        const { result, headers } = await coordinator.resolve({
          payload,
          text,
          policy: policy ?? null,
          templateVersion: templateVersion ?? null,
          requestId,
          userId,
          startTimeMs: startTime,
        });

        Object.entries(headers).forEach(([key, value]) => {
          res.setHeader(key, value);
        });

        if (!result) {
          trace?.recordError("post_processing", new Error("no result"));
          trace?.complete({
            outcome: "error",
            promptLength: text.length,
            spanCount: 0,
            provider: null,
            model: null,
            inputText: text,
            spans: [],
          });
          return res.status(502).json({
            success: false,
            error: "Span labeling failed to produce a result",
          } satisfies ApiResponse<never>);
        }

        // Only TTL cache hits count toward cacheHit. Coordinator may also return
        // X-Cache: COALESCED (request-coalescing single-flight) or MISS — those
        // represent distinct mechanisms and intentionally don't count here.
        if (headers["X-Cache"] === "HIT") {
          trace?.recordCacheHit();
        }

        // Project each returned span to {text, category} for the telemetry
        // payload. Reuses the public-span transform so the telemetry shape
        // matches what the client sees (role → category mapping included).
        // Confidence / start / end indices are not surfaced — keep the event
        // content focused on what's needed for quality review.
        const spanContent = (result.spans ?? []).map((s) => {
          const pub = toPublicSpan(s);
          return { text: pub.text, category: pub.category };
        });

        trace?.complete({
          outcome: "success",
          promptLength: text.length,
          spanCount: result.spans?.length ?? 0,
          provider: (result.meta?.["provider"] as string | undefined) ?? null,
          model: (result.meta?.["model"] as string | undefined) ?? null,
          inputText: text,
          spans: spanContent,
        });

        return res.json({
          success: true,
          data: toPublicLabelSpansResult(result),
        } satisfies ApiResponse<PublicLabelSpansResult>);
      } catch (error) {
        trace?.recordError(
          "llm_call",
          error instanceof Error ? error : new Error(String(error)),
        );
        trace?.complete({
          outcome: "error",
          promptLength: text.length,
          spanCount: 0,
          provider: null,
          model: null,
          inputText: text,
          spans: [],
        });
        logger.error("Operation failed.", error as Error, {
          operation,
          requestId,
          userId,
          duration: Math.round(performance.now() - startTime),
          error: (error as { message?: string })?.message,
          stack: (error as { stack?: string })?.stack,
          textLength: text?.length,
        });
        return res.status(502).json({
          success: false,
          error: "LLM span labeling failed",
          details: (error as { message?: string })?.message || "Unknown error",
        } satisfies ApiResponse<never>);
      }
    },
  );

  return router;
}
