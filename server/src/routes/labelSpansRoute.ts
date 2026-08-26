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
import { createTracedLabelSpansCoordinator } from "./labelSpans/tracedCoordinator";
import { parseLabelSpansRequest } from "./labelSpans/requestParser";
import { handleLabelSpansStreamRequest } from "./labelSpans/streamingHandler";
import { toPublicLabelSpansResult } from "./labelSpans/transform";
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
  const coordinator = createTracedLabelSpansCoordinator(
    createLabelSpansCoordinator(aiService, spanLabelingCache),
    telemetryService,
  );

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
          return res.status(502).json({
            success: false,
            error: "Span labeling failed to produce a result",
          } satisfies ApiResponse<never>);
        }

        return res.json({
          success: true,
          data: toPublicLabelSpansResult(result),
        } satisfies ApiResponse<PublicLabelSpansResult>);
      } catch (error) {
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
