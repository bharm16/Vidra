import { randomUUID } from "node:crypto";
import express, { type Request, type Response, type Router } from "express";
import { asyncHandler } from "@middleware/asyncHandler";
import { sendApiError } from "@middleware/apiErrorResponse";
import { requireCreatorId } from "@middleware/intake";
import { GENERATION_ERROR_CODES } from "@routes/generationErrorCodes";
import { buildRefundKey, refundWithGuard } from "@services/credits/refundGuard";
import type { ConsistentVideoService } from "@services/video-generation/ConsistentVideoService";
import type { UserCreditService } from "@services/credits/UserCreditService";

const KEYFRAME_COST = 2;
const CONSISTENT_VIDEO_COST = 40;
const FROM_KEYFRAME_COST = 35;

function getStatusCode(error: unknown): number {
  if (!error || typeof error !== "object") {
    return 500;
  }
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  const status = (error as { status?: unknown }).status;
  if (typeof statusCode === "number" && Number.isFinite(statusCode)) {
    return statusCode;
  }
  if (typeof status === "number" && Number.isFinite(status)) {
    return status;
  }
  return 500;
}

export function createConsistentGenerationRoutes(
  consistentVideoService: ConsistentVideoService,
  userCreditService?: UserCreditService | null,
): Router {
  const router = express.Router();

  router.post(
    "/keyframe",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireCreatorId(req, res);
      if (!userId) return;

      if (!userCreditService) {
        sendApiError(res, req, 503, {
          error: "Credit service unavailable",
          code: GENERATION_ERROR_CODES.SERVICE_UNAVAILABLE,
        });
        return;
      }

      const { characterId, prompt, aspectRatio, count } = req.body || {};
      if (!characterId || !prompt) {
        sendApiError(res, req, 400, {
          error: "characterId and prompt are required",
          code: GENERATION_ERROR_CODES.INVALID_REQUEST,
        });
        return;
      }

      const reserved = await userCreditService.reserveCredits(
        userId,
        KEYFRAME_COST,
      );
      if (!reserved) {
        sendApiError(res, req, 402, {
          error: "Insufficient credits",
          code: GENERATION_ERROR_CODES.INSUFFICIENT_CREDITS,
          details: `This generation requires ${KEYFRAME_COST} credits.`,
        });
        return;
      }

      const requestId = (req as Request & { id?: string }).id;
      const operationToken =
        requestId ??
        buildRefundKey([
          "consistent-keyframe",
          userId,
          characterId,
          prompt,
          Date.now(),
          randomUUID().slice(0, 8),
        ]);
      const refundKey = buildRefundKey([
        "consistent-generation",
        operationToken,
        "keyframe",
      ]);

      try {
        const normalizedCount =
          typeof count === "number"
            ? Math.max(1, Math.min(5, Math.round(count)))
            : 1;

        const result = await consistentVideoService.generateKeyframeOnly({
          userId,
          characterId,
          prompt,
          aspectRatio,
          count: normalizedCount,
        });

        res.json(result);
      } catch (error) {
        const statusCode = getStatusCode(error);
        await refundWithGuard({
          userCreditService,
          userId,
          amount: KEYFRAME_COST,
          refundKey,
          reason: "consistent keyframe generation failed",
          metadata: {
            requestId,
            endpoint: "consistent:keyframe",
          },
        });
        sendApiError(res, req, statusCode, {
          error: "Generation failed",
          code:
            statusCode === 503
              ? GENERATION_ERROR_CODES.SERVICE_UNAVAILABLE
              : GENERATION_ERROR_CODES.GENERATION_FAILED,
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  router.post(
    "/video",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireCreatorId(req, res);
      if (!userId) return;

      if (!userCreditService) {
        sendApiError(res, req, 503, {
          error: "Credit service unavailable",
          code: GENERATION_ERROR_CODES.SERVICE_UNAVAILABLE,
        });
        return;
      }

      const { prompt, videoModel, aspectRatio, duration } = req.body || {};
      if (!prompt) {
        sendApiError(res, req, 400, {
          error: "prompt is required",
          code: GENERATION_ERROR_CODES.INVALID_REQUEST,
        });
        return;
      }

      const reserved = await userCreditService.reserveCredits(
        userId,
        CONSISTENT_VIDEO_COST,
      );
      if (!reserved) {
        sendApiError(res, req, 402, {
          error: "Insufficient credits",
          code: GENERATION_ERROR_CODES.INSUFFICIENT_CREDITS,
          details: `This generation requires ${CONSISTENT_VIDEO_COST} credits.`,
        });
        return;
      }

      const requestId = (req as Request & { id?: string }).id;
      const operationToken =
        requestId ??
        buildRefundKey([
          "consistent-video",
          userId,
          prompt,
          Date.now(),
          randomUUID().slice(0, 8),
        ]);
      const refundKey = buildRefundKey([
        "consistent-generation",
        operationToken,
        "video",
      ]);

      try {
        const result = await consistentVideoService.generateConsistentVideo({
          userId,
          prompt,
          videoModel,
          aspectRatio,
          duration,
        });

        res.json(result);
      } catch (error) {
        const statusCode = getStatusCode(error);
        await refundWithGuard({
          userCreditService,
          userId,
          amount: CONSISTENT_VIDEO_COST,
          refundKey,
          reason: "consistent video generation failed",
          metadata: {
            requestId,
            endpoint: "consistent:video",
          },
        });
        sendApiError(res, req, statusCode, {
          error: "Generation failed",
          code:
            statusCode === 503
              ? GENERATION_ERROR_CODES.SERVICE_UNAVAILABLE
              : GENERATION_ERROR_CODES.GENERATION_FAILED,
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  router.post(
    "/from-keyframe",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireCreatorId(req, res);
      if (!userId) return;

      if (!userCreditService) {
        sendApiError(res, req, 503, {
          error: "Credit service unavailable",
          code: GENERATION_ERROR_CODES.SERVICE_UNAVAILABLE,
        });
        return;
      }

      const { keyframeUrl, prompt, model, aspectRatio, duration } =
        req.body || {};
      if (!keyframeUrl || !prompt) {
        sendApiError(res, req, 400, {
          error: "keyframeUrl and prompt are required",
          code: GENERATION_ERROR_CODES.INVALID_REQUEST,
        });
        return;
      }

      const reserved = await userCreditService.reserveCredits(
        userId,
        FROM_KEYFRAME_COST,
      );
      if (!reserved) {
        sendApiError(res, req, 402, {
          error: "Insufficient credits",
          code: GENERATION_ERROR_CODES.INSUFFICIENT_CREDITS,
          details: `This generation requires ${FROM_KEYFRAME_COST} credits.`,
        });
        return;
      }

      const requestId = (req as Request & { id?: string }).id;
      const operationToken =
        requestId ??
        buildRefundKey([
          "consistent-from-keyframe",
          userId,
          keyframeUrl,
          prompt,
          Date.now(),
          randomUUID().slice(0, 8),
        ]);
      const refundKey = buildRefundKey([
        "consistent-generation",
        operationToken,
        "from-keyframe",
      ]);

      try {
        const result =
          await consistentVideoService.generateVideoFromApprovedKeyframe({
            keyframeUrl,
            prompt,
            model,
            aspectRatio,
            duration,
          });

        res.json(result);
      } catch (error) {
        const statusCode = getStatusCode(error);
        await refundWithGuard({
          userCreditService,
          userId,
          amount: FROM_KEYFRAME_COST,
          refundKey,
          reason: "consistent from-keyframe generation failed",
          metadata: {
            requestId,
            endpoint: "consistent:from-keyframe",
          },
        });
        sendApiError(res, req, statusCode, {
          error: "Generation failed",
          code:
            statusCode === 503
              ? GENERATION_ERROR_CODES.SERVICE_UNAVAILABLE
              : GENERATION_ERROR_CODES.GENERATION_FAILED,
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  return router;
}

export default createConsistentGenerationRoutes;
