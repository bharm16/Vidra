import express, { type Request, type Response, type Router } from "express";
import { logger } from "@infrastructure/Logger";
import { asyncHandler } from "@middleware/asyncHandler";
import { requireBody } from "@middleware/intake";
import type { ModelIntelligenceService } from "@services/model-intelligence/ModelIntelligenceService";
import type { PromptSpan } from "@services/model-intelligence/types";
import {
  ModelRecommendationRequestSchema,
  ModelRecommendationEventSchema,
} from "@services/model-intelligence/schemas/requests";
import type { ApiResponse } from "@shared/types/api";
/** Narrow metrics interface — avoids importing the concrete MetricsService class. */
export interface ModelIntelligenceRouteMetrics {
  recordModelRecommendationEvent(
    event: string,
    mode: string,
    followed: boolean,
  ): void;
  recordModelRecommendationTimeToGeneration(
    timeMs: number,
    followed: boolean,
  ): void;
}

interface RequestWithUser extends Request {
  user?: { uid?: string };
}

type IncomingRecommendationSpan = {
  text: string;
  role?: string | undefined;
  category?: string | undefined;
  start?: number | undefined;
  end?: number | undefined;
  confidence?: number | undefined;
};

const normalizeRecommendationSpans = (
  spans: IncomingRecommendationSpan[] | undefined,
): PromptSpan[] | undefined =>
  spans?.map((span) => ({
    text: span.text,
    ...(span.role !== undefined ? { role: span.role } : {}),
    ...(span.category !== undefined ? { category: span.category } : {}),
    ...(span.start !== undefined ? { start: span.start } : {}),
    ...(span.end !== undefined ? { end: span.end } : {}),
    ...(span.confidence !== undefined ? { confidence: span.confidence } : {}),
  }));

const log = logger.child({ routes: "model-intelligence" });

export function createModelIntelligenceRoutes(
  modelIntelligenceService: ModelIntelligenceService | null,
  metricsService?: ModelIntelligenceRouteMetrics,
): Router {
  const router = express.Router();

  router.post(
    "/model-intelligence/recommend",
    asyncHandler(
      async (req: RequestWithUser, res: Response): Promise<Response | void> => {
        if (!modelIntelligenceService) {
          return res.status(503).json({
            success: false,
            error: "Model intelligence service unavailable",
          } satisfies ApiResponse<never>);
        }

        const parsed = requireBody(ModelRecommendationRequestSchema, req, res);
        if (!parsed.ok) return;

        const { prompt, mode, spans, durationSeconds } = parsed.value;
        const userId = req.user?.uid ?? null;
        const normalizedSpans = normalizeRecommendationSpans(spans);

        try {
          const recommendation =
            await modelIntelligenceService.getRecommendation(prompt, {
              ...(mode !== undefined ? { mode } : {}),
              ...(normalizedSpans !== undefined
                ? { spans: normalizedSpans }
                : {}),
              ...(durationSeconds !== undefined ? { durationSeconds } : {}),
              userId,
            });

          return res.json({
            success: true,
            data: recommendation,
          } satisfies ApiResponse<typeof recommendation>);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const safeDetails =
            process.env.NODE_ENV === "development" ||
            process.env.NODE_ENV === "test"
              ? errorMessage
              : undefined;
          log.error(
            "Model recommendation failed",
            error instanceof Error ? error : new Error(errorMessage),
            {
              error: errorMessage,
            },
          );
          return res.status(500).json({
            success: false,
            error: "Failed to generate recommendation",
            ...(safeDetails ? { details: safeDetails } : {}),
          } satisfies ApiResponse<never>);
        }
      },
    ),
  );

  router.post(
    "/model-intelligence/track",
    asyncHandler(
      async (req: RequestWithUser, res: Response): Promise<Response | void> => {
        const parsed = requireBody(ModelRecommendationEventSchema, req, res);
        if (!parsed.ok) return;

        const {
          event,
          recommendationId,
          promptId,
          recommendedModelId,
          selectedModelId,
          mode = "t2v",
          durationSeconds,
          timeSinceRecommendationMs,
        } = parsed.value;

        const followed =
          Boolean(recommendedModelId) &&
          Boolean(selectedModelId) &&
          recommendedModelId === selectedModelId;

        metricsService?.recordModelRecommendationEvent(event, mode, followed);
        if (
          event === "generation_started" &&
          typeof timeSinceRecommendationMs === "number"
        ) {
          metricsService?.recordModelRecommendationTimeToGeneration(
            timeSinceRecommendationMs,
            followed,
          );
        }

        log.info("Model intelligence telemetry event", {
          event,
          recommendationId: recommendationId ?? null,
          promptId: promptId ?? null,
          recommendedModelId: recommendedModelId ?? null,
          selectedModelId: selectedModelId ?? null,
          followed,
          mode,
          durationSeconds: durationSeconds ?? null,
          timeSinceRecommendationMs: timeSinceRecommendationMs ?? null,
          userId: req.user?.uid ?? null,
        });

        return res.json({
          success: true,
          data: { tracked: true },
        } satisfies ApiResponse<{ tracked: true }>);
      },
    ),
  );

  return router;
}

export default createModelIntelligenceRoutes;
