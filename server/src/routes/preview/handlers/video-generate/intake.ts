import { VIDEO_MODELS } from "@config/modelConfig";
import { GENERATION_ERROR_CODES } from "@routes/generationErrorCodes";
import { resolveModelId as resolveCapabilityModelId } from "@services/capabilities/modelProviders";
import type { ILogger } from "@interfaces/ILogger";
import type { VideoModelId } from "@shared/videoModels";
import type { VideoPreviewPayload } from "@routes/preview/videoRequest";
import { scheduleInlineVideoPreviewProcessing } from "../../inlineProcessor";
import { extractMotionMeta } from "./motion";
import {
  buildVideoRequestPlan,
  createModelUnavailableError,
} from "./requestPlan";
import { runVideoPreprocessing } from "./preprocessing";
import { createVideoRefundManager } from "./refundManager";
import type { VideoErrorResult, VideoGenerateServices } from "./types";

const hasStatusCode = (value: unknown): value is { statusCode: number } => {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (!("statusCode" in value)) {
    return false;
  }
  const statusCode = (value as { statusCode?: unknown }).statusCode;
  return typeof statusCode === "number" && Number.isFinite(statusCode);
};

export interface VideoGenerateIntakeArgs {
  payload: VideoPreviewPayload;
  userId: string;
  requestId?: string | undefined;
  /** Prompt after stripping AND @-trigger resolution (overrides payload.prompt). */
  cleanedPrompt: string;
  /** Character asset after @-trigger resolution (overrides payload.characterAssetId). */
  characterAssetId?: string | undefined;
  autoKeyframe: boolean;
  faceSwapAlreadyApplied: boolean;
  promptWasStripped: boolean;
  rawMotionMeta: ReturnType<typeof extractMotionMeta>;
  services: {
    videoGenerationService: NonNullable<
      VideoGenerateServices["videoGenerationService"]
    >;
    videoJobStore: NonNullable<VideoGenerateServices["videoJobStore"]>;
    userCreditService: NonNullable<VideoGenerateServices["userCreditService"]>;
    keyframeService: VideoGenerateServices["keyframeService"];
    faceSwapService: VideoGenerateServices["faceSwapService"];
    assetService: VideoGenerateServices["assetService"];
    storageService: VideoGenerateServices["storageService"];
  };
  idempotencyRecordId: string | null;
  requestIdempotencyService: VideoGenerateServices["requestIdempotencyService"];
  log: ILogger;
}

export type VideoGenerateIntakeResult =
  | { ok: true; status: 202; body: Record<string, unknown> }
  | { ok: false; error: VideoErrorResult };

/**
 * Video-generation intake — owns the credit-bearing business workflow:
 * preprocessing, model-availability gating, request-plan construction, and the
 * atomic job + credit reservation, together with the compensating refunds that
 * keep the credit ledger correct on every failure path. Every failure returns a
 * uniform {@link VideoErrorResult} (with refunds already issued) so the HTTP
 * route can translate them identically; success returns the 202 body.
 *
 * The route owns request parsing, URL safety, auth, and the idempotency lock
 * release (markFailed). markCompleted is recorded HERE on success because the
 * snapshot it stores IS the response body assembled in this workflow.
 */
export async function runVideoGenerateIntake(
  args: VideoGenerateIntakeArgs,
): Promise<VideoGenerateIntakeResult> {
  const {
    payload,
    userId,
    requestId,
    cleanedPrompt,
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
  } = args;

  const {
    aspectRatio,
    model,
    startImage,
    endImage,
    referenceImages,
    extendVideoUrl,
    inputReference,
    generationParams,
    sessionId: requestedSessionId,
    promptVersionId: requestedPromptVersionId,
  } = payload;

  let characterAssetId = args.characterAssetId;

  const refunds = createVideoRefundManager({
    userCreditService,
    userId,
    requestId,
    cleanedPrompt,
    model,
  });

  const preprocessing = await runVideoPreprocessing({
    requestId,
    userId,
    startImage,
    characterAssetId,
    autoKeyframe,
    faceSwapAlreadyApplied,
    aspectRatio,
    cleanedPrompt,
    services: {
      userCreditService,
      keyframeService,
      faceSwapService,
      assetService,
    },
    refunds,
    log,
  });

  if (preprocessing.error) {
    return { ok: false, error: preprocessing.error };
  }

  const resolvedStartImage = preprocessing.resolvedStartImage;
  const generatedKeyframeUrl = preprocessing.generatedKeyframeUrl;
  const swappedImageUrl = preprocessing.swappedImageUrl;
  characterAssetId = preprocessing.characterAssetId;

  const availability = videoGenerationService.getModelAvailability(model);
  if (!availability.available) {
    await refunds.refundKeyframeCredits(
      "video model unavailable after keyframe reservation",
    );
    await refunds.refundFaceSwapCredits(
      "video model unavailable after face-swap reservation",
    );

    const snapshot = videoGenerationService.getAvailabilitySnapshot(
      Object.values(VIDEO_MODELS) as VideoModelId[],
    );
    const availableCapabilityModels = Array.from(
      new Set(
        snapshot.availableModelIds
          .map((modelId) => resolveCapabilityModelId(modelId))
          .filter(
            (modelId): modelId is string =>
              typeof modelId === "string" && modelId.length > 0,
          ),
      ),
    );

    const unavailable = createModelUnavailableError({
      availability,
      availableModelIds: snapshot.availableModelIds,
      availableCapabilityModels,
    });
    return { ok: false, error: unavailable };
  }

  const operation = "generateVideoPreview";
  const costModel = availability.resolvedModelId || model;

  const planResult = buildVideoRequestPlan({
    generationParams,
    model,
    operation,
    requestId: requestId || "unknown",
    userId,
    costModel,
    cleanedPrompt,
    resolvedStartImage,
    inputReference,
    endImage,
    referenceImages,
    extendVideoUrl,
    aspectRatio,
    characterAssetId,
    faceSwapAlreadyApplied,
    swappedImageUrl,
  });

  if (!planResult.ok) {
    await refunds.refundKeyframeCredits(
      "video request normalization failed after keyframe reservation",
    );
    await refunds.refundFaceSwapCredits(
      "video request normalization failed after face-swap reservation",
    );
    return { ok: false, error: planResult.error };
  }

  const plan = planResult.value;

  log.info("Resolved motion context for video generation", {
    operation: "resolveMotionContext",
    requestId,
    userId,
    hasStartImage: Boolean(resolvedStartImage),
    hasInputReference: Boolean(inputReference),
    isI2VRequest: Boolean(resolvedStartImage || inputReference),
    rawHasCameraMotion: rawMotionMeta.hasCameraMotion,
    rawCameraMotionId: rawMotionMeta.cameraMotionId,
    rawHasSubjectMotion: rawMotionMeta.hasSubjectMotion,
    rawSubjectMotionLength: rawMotionMeta.subjectMotionLength,
    normalizedHasCameraMotion: plan.normalizedMotionMeta.hasCameraMotion,
    normalizedCameraMotionId: plan.normalizedMotionMeta.cameraMotionId,
    normalizedHasSubjectMotion: plan.normalizedMotionMeta.hasSubjectMotion,
    normalizedSubjectMotionLength:
      plan.normalizedMotionMeta.subjectMotionLength,
    resolvedCameraMotionId: plan.motionContext.cameraMotionId,
    resolvedCameraMotionText: plan.motionContext.cameraMotionText,
    resolvedSubjectMotionLength: plan.motionContext.subjectMotion?.length ?? 0,
    disablePromptExtend: plan.disablePromptExtend,
    motionGuidanceAppended: plan.motionGuidanceAppended,
    promptLengthBeforeMotion: plan.promptLengthBeforeMotion,
    promptLengthAfterMotion: plan.promptLengthAfterMotion,
  });

  if (plan.disablePromptExtend) {
    log.info("Disabling Wan prompt_extend for I2V camera motion", {
      operation: "configureWanPromptExtend",
      requestId,
      userId,
      cameraMotionId: plan.motionContext.cameraMotionId,
      hasStartImage: Boolean(resolvedStartImage),
      hasInputReference: Boolean(inputReference),
    });
  }

  log.debug("Queueing operation.", {
    operation,
    requestId,
    userId,
    promptLength: plan.promptWithMotion.length,
    promptLengthBeforeMotion: plan.promptLengthBeforeMotion,
    promptLengthAfterMotion: plan.promptLengthAfterMotion,
    motionGuidanceAppended: plan.motionGuidanceAppended,
    promptWasStripped,
    aspectRatio,
    model,
    videoCost: refunds.ledger.videoCost,
    keyframeCost: refunds.ledger.keyframeCost,
    faceSwapCost: refunds.ledger.faceSwapCost,
    totalCost:
      refunds.ledger.videoCost +
      refunds.ledger.keyframeCost +
      refunds.ledger.faceSwapCost,
    usedKeyframe: Boolean(generatedKeyframeUrl),
    faceSwapApplied: Boolean(swappedImageUrl),
    hasCameraMotion: Boolean(plan.motionContext.cameraMotionId),
    cameraMotionId: plan.motionContext.cameraMotionId,
    hasSubjectMotion: Boolean(plan.motionContext.subjectMotion),
    subjectMotionLength: plan.motionContext.subjectMotion?.length ?? 0,
    promptExtend: plan.options.promptExtend ?? null,
  });

  try {
    const reservationResult = await videoJobStore.createJobWithReservation(
      {
        userId,
        ...(requestId ? { requestId } : {}),
        ...(requestedSessionId ? { sessionId: requestedSessionId } : {}),
        ...(requestedPromptVersionId
          ? { promptVersionId: requestedPromptVersionId }
          : {}),
        request: {
          prompt: plan.promptWithMotion,
          options: plan.options,
        },
        creditsReserved: plan.videoCost,
      },
      { creditService: userCreditService, cost: plan.videoCost },
    );

    if (!reservationResult.reserved) {
      const userFacingReason =
        reservationResult.reason === "user_not_found"
          ? "user not found"
          : "insufficient";
      await refunds.refundKeyframeCredits(
        `video credits ${userFacingReason} after keyframe reservation`,
      );
      await refunds.refundFaceSwapCredits(
        `video credits ${userFacingReason} after face-swap reservation`,
      );
      const preprocessingCost =
        refunds.ledger.keyframeCost + refunds.ledger.faceSwapCost;
      return {
        ok: false,
        error: {
          status: 402,
          payload: {
            error:
              reservationResult.reason === "user_not_found"
                ? "User not found"
                : "Insufficient credits",
            code: GENERATION_ERROR_CODES.INSUFFICIENT_CREDITS,
            details: `This generation requires ${plan.videoCost} credits${preprocessingCost > 0 ? ` (plus ${preprocessingCost} already reserved for preprocessing)` : ""}.`,
          },
        },
      };
    }

    refunds.setVideoCost(plan.videoCost);
    const job = reservationResult.job;

    log.info("Operation queued.", {
      operation,
      requestId,
      userId,
      jobId: job.id,
      videoCost: refunds.ledger.videoCost,
      keyframeCost: refunds.ledger.keyframeCost,
      faceSwapCost: refunds.ledger.faceSwapCost,
      keyframeUrl: generatedKeyframeUrl,
      faceSwapUrl: swappedImageUrl,
      hasCameraMotion: Boolean(plan.motionContext.cameraMotionId),
      cameraMotionId: plan.motionContext.cameraMotionId,
      hasSubjectMotion: Boolean(plan.motionContext.subjectMotion),
      subjectMotionLength: plan.motionContext.subjectMotion?.length ?? 0,
      promptLengthBeforeMotion: plan.promptLengthBeforeMotion,
      promptLengthAfterMotion: plan.promptLengthAfterMotion,
      motionGuidanceAppended: plan.motionGuidanceAppended,
    });

    scheduleInlineVideoPreviewProcessing({
      jobId: job.id,
      ...(requestId ? { requestId } : {}),
      videoJobStore,
      videoGenerationService,
      userCreditService,
      storageService: storageService ?? null,
    });

    // No `typeof === "function"` guard: `userCreditService` is a
    // `UserCreditService` class instance (DI-resolved), and the route's
    // null-checks gate this branch — so `getBalance` is statically
    // guaranteed to exist.
    let remainingCredits: number | null = null;
    try {
      remainingCredits = await userCreditService.getBalance(userId);
    } catch (error) {
      log.warn("Failed to resolve remaining credits after video reservation.", {
        operation,
        requestId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const responsePayload = {
      jobId: job.id,
      status: job.status,
      creditsReserved: refunds.ledger.videoCost,
      creditsDeducted:
        refunds.ledger.videoCost +
        refunds.ledger.keyframeCost +
        refunds.ledger.faceSwapCost,
      ...(typeof remainingCredits === "number" ? { remainingCredits } : {}),
      keyframeGenerated: Boolean(generatedKeyframeUrl),
      keyframeUrl: generatedKeyframeUrl,
      faceSwapApplied: Boolean(swappedImageUrl),
      faceSwapUrl: swappedImageUrl,
    };

    const responseBody = {
      success: true,
      data: responsePayload,
      ...responsePayload,
    } as Record<string, unknown>;

    if (idempotencyRecordId && requestIdempotencyService) {
      await requestIdempotencyService.markCompleted({
        recordId: idempotencyRecordId,
        jobId: job.id,
        snapshot: {
          statusCode: 202,
          body: responseBody,
        },
      });
    }

    return { ok: true, status: 202, body: responseBody };
  } catch (error: unknown) {
    await refunds.refundVideoCredits("video queueing failed");
    await refunds.refundKeyframeCredits(
      "video queueing failed after keyframe reservation",
    );
    await refunds.refundFaceSwapCredits(
      "video queueing failed after face-swap reservation",
    );

    const errorMessage = error instanceof Error ? error.message : String(error);
    const statusCode = hasStatusCode(error) ? error.statusCode : 500;
    const errorInstance =
      error instanceof Error ? error : new Error(errorMessage);
    const code =
      statusCode === 503
        ? GENERATION_ERROR_CODES.SERVICE_UNAVAILABLE
        : GENERATION_ERROR_CODES.GENERATION_FAILED;

    log.error("Operation failed.", errorInstance, {
      operation,
      requestId,
      userId,
      refundAmount:
        refunds.ledger.videoCost +
        refunds.ledger.keyframeCost +
        refunds.ledger.faceSwapCost,
      statusCode,
    });

    return {
      ok: false,
      error: {
        status: statusCode,
        payload: {
          error: "Video generation failed",
          code,
          details: errorMessage,
        },
      },
    };
  }
}
