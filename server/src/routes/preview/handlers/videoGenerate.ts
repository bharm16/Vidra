import type { Request, Response } from "express";
import { isIP } from "node:net";
import { logger } from "@infrastructure/Logger";
import { parseVideoPreviewRequest } from "@routes/preview/videoRequest";
import { sendApiError } from "@middleware/apiErrorResponse";
import { GENERATION_ERROR_CODES } from "@routes/generationErrorCodes";
import type { ApiErrorCode } from "@shared/types/api";
import { resolveVideoGenerateIdempotencyMode } from "@services/video-generation/jobs/RequestIdempotencyService";
import { assertUrlSafe } from "@server/shared/urlValidation";
import { stripVideoPreviewPrompt } from "../prompt";
import { extractMotionMeta } from "./video-generate/motion";
import {
  extractPromptTriggers,
  resolvePromptTriggers,
} from "./video-generate/triggerResolution";
import { runVideoGenerateIntake } from "./video-generate/intake";
import type { VideoGenerateServices } from "./video-generate/types";

const log = logger.child({ route: "preview.videoGenerate" });

export const createVideoGenerateHandler =
  ({
    videoGenerationService,
    videoJobStore,
    userCreditService,
    storageService,
    keyframeService,
    faceSwapService,
    assetService,
    requestIdempotencyService,
  }: VideoGenerateServices) =>
  async (req: Request, res: Response): Promise<Response | void> => {
    if (!videoGenerationService || !videoJobStore) {
      return sendApiError(res, req, 503, {
        error: "Video generation service is not available",
        code: GENERATION_ERROR_CODES.SERVICE_UNAVAILABLE,
        details: "Video generation queue is not configured",
      });
    }

    const parsed = parseVideoPreviewRequest(req.body);
    if (!parsed.ok) {
      return sendApiError(res, req, parsed.status, {
        error: parsed.error,
        code: GENERATION_ERROR_CODES.INVALID_REQUEST,
      });
    }

    const {
      prompt,
      aspectRatio,
      model,
      startImage,
      endImage,
      referenceImages,
      extendVideoUrl,
      inputReference,
      generationParams,
      characterAssetId: requestedCharacterAssetId,
      autoKeyframe = true,
      faceSwapAlreadyApplied = false,
    } = parsed.payload;
    let characterAssetId = requestedCharacterAssetId;

    if (startImage) {
      try {
        assertUrlSafe(startImage, "startImage");
      } catch (err) {
        return sendApiError(res, req, 400, {
          error: "Invalid startImage URL",
          code: GENERATION_ERROR_CODES.INVALID_REQUEST,
          details: err instanceof Error ? err.message : "URL validation failed",
        });
      }
    }
    if (inputReference) {
      try {
        assertUrlSafe(inputReference, "inputReference");
      } catch (err) {
        return sendApiError(res, req, 400, {
          error: "Invalid inputReference URL",
          code: GENERATION_ERROR_CODES.INVALID_REQUEST,
          details: err instanceof Error ? err.message : "URL validation failed",
        });
      }
    }
    if (endImage) {
      try {
        assertUrlSafe(endImage, "endImage");
      } catch (err) {
        return sendApiError(res, req, 400, {
          error: "Invalid endImage URL",
          code: GENERATION_ERROR_CODES.INVALID_REQUEST,
          details: err instanceof Error ? err.message : "URL validation failed",
        });
      }
    }
    if (extendVideoUrl) {
      try {
        assertUrlSafe(extendVideoUrl, "extendVideoUrl");
      } catch (err) {
        return sendApiError(res, req, 400, {
          error: "Invalid extendVideoUrl URL",
          code: GENERATION_ERROR_CODES.INVALID_REQUEST,
          details: err instanceof Error ? err.message : "URL validation failed",
        });
      }
    }
    if (referenceImages) {
      for (const ref of referenceImages) {
        try {
          assertUrlSafe(ref.url, "referenceImages[].url");
        } catch (err) {
          return sendApiError(res, req, 400, {
            error: "Invalid referenceImages URL",
            code: GENERATION_ERROR_CODES.INVALID_REQUEST,
            details:
              err instanceof Error ? err.message : "URL validation failed",
          });
        }
      }
    }

    let { cleaned: cleanedPrompt, wasStripped: promptWasStripped } =
      stripVideoPreviewPrompt(prompt);
    const userId =
      (req as Request & { user?: { uid?: string } }).user?.uid ?? null;
    const requestId = (req as Request & { id?: string }).id;
    const rawMotionMeta = extractMotionMeta(generationParams);
    const promptTriggers = extractPromptTriggers(cleanedPrompt);
    const uniquePromptTriggerCount = new Set(promptTriggers).size;
    const hasPromptTriggers = uniquePromptTriggerCount > 0;

    if (!userId || userId === "anonymous" || isIP(userId) !== 0) {
      return sendApiError(res, req, 401, {
        error: "Authentication required",
        code: GENERATION_ERROR_CODES.AUTH_REQUIRED,
        details: "You must be logged in to generate videos.",
      });
    }

    const idempotencyMode = resolveVideoGenerateIdempotencyMode();
    const rawIdempotencyKey = req.get("Idempotency-Key");
    const idempotencyKey =
      typeof rawIdempotencyKey === "string" &&
      rawIdempotencyKey.trim().length > 0
        ? rawIdempotencyKey.trim()
        : null;
    let idempotencyRecordId: string | null = null;

    if (!idempotencyKey && idempotencyMode === "required") {
      return sendApiError(res, req, 400, {
        error: "Idempotency-Key header is required",
        code: GENERATION_ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED,
      });
    }

    if (idempotencyKey && !requestIdempotencyService) {
      log.warn(
        "Idempotency key supplied but request idempotency service is unavailable",
        {
          requestId,
          userId,
        },
      );
      return sendApiError(res, req, 503, {
        error: "Video generation service is not available",
        code: GENERATION_ERROR_CODES.SERVICE_UNAVAILABLE,
        details: "Idempotency service is not configured",
      });
    }

    if (!idempotencyKey && idempotencyMode === "soft") {
      log.warn(
        "Video generation request missing Idempotency-Key header in soft mode",
        {
          requestId,
          userId,
        },
      );
    }

    if (idempotencyKey && requestIdempotencyService) {
      const claim = await requestIdempotencyService.claimRequest({
        userId,
        route: "/api/preview/video/generate",
        key: idempotencyKey,
        payload: parsed.payload,
      });

      if (claim.state === "replay") {
        return res.status(claim.snapshot.statusCode).json(claim.snapshot.body);
      }
      if (claim.state === "conflict") {
        return sendApiError(res, req, 409, {
          error: "Idempotency key was already used with a different payload",
          code: GENERATION_ERROR_CODES.IDEMPOTENCY_CONFLICT,
        });
      }
      if (claim.state === "in_progress") {
        return sendApiError(res, req, 409, {
          error: "A matching request is already in progress",
          code: GENERATION_ERROR_CODES.REQUEST_IN_PROGRESS,
        });
      }

      idempotencyRecordId = claim.recordId;
    }

    const triggerResolution = await resolvePromptTriggers({
      cleanedPrompt,
      hasPromptTriggers,
      uniquePromptTriggerCount,
      userId,
      requestId,
      characterAssetId,
      assetService,
      log,
    });

    if (!triggerResolution.ok) {
      if (idempotencyRecordId && requestIdempotencyService) {
        await requestIdempotencyService.markFailed(
          idempotencyRecordId,
          triggerResolution.error.payload.code ||
            triggerResolution.error.payload.error,
        );
      }
      return sendApiError(
        res,
        req,
        triggerResolution.error.status,
        triggerResolution.error.payload,
      );
    }

    cleanedPrompt = triggerResolution.value.cleanedPrompt;
    characterAssetId = triggerResolution.value.characterAssetId;

    log.info("Video preview request received", {
      operation: "generateVideoPreview",
      requestId,
      promptLength: cleanedPrompt.length,
      promptWasStripped,
      aspectRatio,
      model,
      hasStartImage: Boolean(startImage),
      hasInputReference: Boolean(inputReference),
      hasCharacterAssetId: Boolean(characterAssetId),
      autoKeyframe,
      faceSwapAlreadyApplied,
      hasPromptTriggers,
      uniquePromptTriggerCount,
      promptExpandedFromTrigger:
        triggerResolution.value.promptExpandedFromTrigger,
      resolvedAssetCount: triggerResolution.value.resolvedAssetCount,
      resolvedCharacterCount: triggerResolution.value.resolvedCharacterCount,
      ...rawMotionMeta,
    });

    if (!userCreditService) {
      log.error(
        "User credit service is not available - blocking paid feature access",
        undefined,
        {
          path: req.path,
        },
      );
      if (idempotencyRecordId && requestIdempotencyService) {
        await requestIdempotencyService.markFailed(
          idempotencyRecordId,
          GENERATION_ERROR_CODES.SERVICE_UNAVAILABLE,
        );
      }
      return sendApiError(res, req, 503, {
        error: "Video generation service is not available",
        code: GENERATION_ERROR_CODES.SERVICE_UNAVAILABLE,
        details: "Credit service is not configured",
      });
    }

    const releaseIdempotencyLock = async (reason: string): Promise<void> => {
      if (!idempotencyRecordId || !requestIdempotencyService) {
        return;
      }
      await requestIdempotencyService.markFailed(idempotencyRecordId, reason);
    };

    const respondWithError = async (
      status: number,
      payload: { error: string; code: ApiErrorCode; details?: string },
      reason?: string,
    ): Promise<Response> => {
      await releaseIdempotencyLock(reason || payload.code || payload.error);
      return sendApiError(res, req, status, payload);
    };

    const intake = await runVideoGenerateIntake({
      payload: parsed.payload,
      userId,
      requestId,
      cleanedPrompt,
      characterAssetId,
      autoKeyframe,
      faceSwapAlreadyApplied,
      promptWasStripped,
      rawMotionMeta,
      services: {
        videoGenerationService,
        videoJobStore,
        userCreditService,
        keyframeService,
        faceSwapService,
        assetService,
        storageService,
      },
      idempotencyRecordId,
      requestIdempotencyService,
      log,
    });

    if (!intake.ok) {
      return await respondWithError(
        intake.error.status,
        intake.error.payload,
        intake.error.payload.code,
      );
    }

    return res.status(intake.status).json(intake.body);
  };
