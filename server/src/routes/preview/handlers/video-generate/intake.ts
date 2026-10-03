import { VIDEO_MODELS } from "@config/modelConfig";
import { isReleaseGenerationModelSupported } from "@shared/videoModels";
import { GENERATION_ERROR_CODES } from "@routes/generationErrorCodes";
import { resolveModelId as resolveCapabilityModelId } from "@services/capabilities/modelProviders";
import type { ILogger } from "@interfaces/ILogger";
import type { VideoModelId } from "@shared/videoModels";
import type { VideoRequestPayload } from "@routes/preview/videoRequest";
import { scheduleInlineVideoProcessing } from "../../inlineProcessor";
import { extractMotionMeta } from "./motion";
import {
  buildVideoRequestPlan,
  createModelUnavailableError,
} from "./requestPlan";
import type { VideoErrorResult, VideoGenerateServices } from "./types";

export interface VideoGenerateIntakeArgs {
  payload: VideoRequestPayload;
  userId: string;
  requestId?: string | undefined;
  cleanedPrompt: string;
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
    storageService: VideoGenerateServices["storageService"];
    sessionService: VideoGenerateServices["sessionService"];
  };
  idempotencyRecordId: string;
  idempotencyKey: string;
  requestIdempotencyService: NonNullable<
    VideoGenerateServices["requestIdempotencyService"]
  >;
  log: ILogger;
}
export type VideoGenerateIntakeResult =
  | { ok: true; status: 202; body: Record<string, unknown> }
  | { ok: false; error: VideoErrorResult; retainClaim?: true };

/** ADR-0023 / #124: free active intake; existing paid preprocessing stays frozen. */
export async function runVideoGenerateIntake(
  args: VideoGenerateIntakeArgs,
): Promise<VideoGenerateIntakeResult> {
  const { payload, userId, requestId, cleanedPrompt, services, log } = args;
  const {
    videoGenerationService,
    videoJobStore,
    storageService,
    sessionService,
  } = services;
  const {
    model,
    startImage,
    inputReference,
    endImage,
    referenceImages,
    extendVideoUrl,
    generationParams,
    aspectRatio,
  } = payload;
  if (model && !isReleaseGenerationModelSupported(model))
    return {
      ok: false,
      error: {
        status: 400,
        payload: {
          error: "Requested model is excluded from this release",
          code: GENERATION_ERROR_CODES.INVALID_REQUEST,
        },
      },
    };
  if (
    args.characterAssetId &&
    ((startImage && !args.faceSwapAlreadyApplied) ||
      (!startImage && args.autoKeyframe))
  )
    return {
      ok: false,
      error: {
        status: 400,
        payload: {
          error:
            "Automatic character keyframes and face swap are not available in free validation",
          code: GENERATION_ERROR_CODES.INVALID_REQUEST,
          details:
            "Use an already supplied first frame or plain prompt; the consistency stack remains frozen.",
        },
      },
    };
  const availability = videoGenerationService.getModelAvailability(model);
  if (
    !availability.available ||
    (availability.resolvedModelId &&
      !isReleaseGenerationModelSupported(availability.resolvedModelId))
  ) {
    const snapshot = videoGenerationService.getAvailabilitySnapshot(
      Object.values(VIDEO_MODELS) as VideoModelId[],
    );
    return {
      ok: false,
      error: createModelUnavailableError({
        availability,
        availableModelIds: snapshot.availableModelIds.filter(
          isReleaseGenerationModelSupported,
        ),
        availableCapabilityModels: [
          ...new Set(
            snapshot.availableModelIds
              .filter(isReleaseGenerationModelSupported)
              .map(resolveCapabilityModelId)
              .filter(
                (id): id is string => typeof id === "string" && id.length > 0,
              ),
          ),
        ],
      }),
    };
  }
  const resolvedModel = availability.resolvedModelId || model;
  const planResult = buildVideoRequestPlan({
    generationParams,
    model: resolvedModel,
    operation: "generateVideo",
    requestId: requestId || "unknown",
    userId,
    costModel: resolvedModel,
    cleanedPrompt,
    resolvedStartImage: startImage,
    inputReference,
    endImage,
    referenceImages,
    extendVideoUrl,
    aspectRatio,
    characterAssetId: args.characterAssetId,
    faceSwapAlreadyApplied: args.faceSwapAlreadyApplied,
    swappedImageUrl: null,
  });
  if (!planResult.ok) return { ok: false, error: planResult.error };

  try {
    const published = await videoJobStore.createJobWithReceipt(
      {
        userId,
        ...(requestId ? { requestId } : {}),
        ...(payload.sessionId ? { sessionId: payload.sessionId } : {}),
        ...(payload.promptVersionId
          ? { promptVersionId: payload.promptVersionId }
          : {}),
        ...(payload.sourceGenerationId
          ? { sourceGenerationId: payload.sourceGenerationId }
          : {}),
        request: { prompt: cleanedPrompt, options: planResult.value.options },
        creditsReserved: 0,
      },
      {
        idempotency: args.requestIdempotencyService,
        recordId: args.idempotencyRecordId,
        buildSnapshot: (job) => {
          const data = {
            jobId: job.id,
            status: job.status,
            keyframeGenerated: false,
            keyframeUrl: null,
            faceSwapApplied: Boolean(args.faceSwapAlreadyApplied && startImage),
            faceSwapUrl: args.faceSwapAlreadyApplied
              ? (startImage ?? null)
              : null,
          };
          return { statusCode: 202, body: { success: true, data, ...data } };
        },
      },
    );
    // Publication is committed. A scheduling failure cannot release its claim
    // or refund/recreate the accepted job; the existing queue remains recoverable.
    try {
      scheduleInlineVideoProcessing({
        jobId: published.job.id,
        ...(requestId ? { requestId } : {}),
        videoJobStore,
        videoGenerationService,
        storageService: storageService ?? null,
        sessionService: sessionService ?? null,
      });
    } catch (error) {
      log.warn(
        "Free clip accepted; inline scheduling failed, durable job remains queued",
        {
          jobId: published.job.id,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
    return { ok: true, status: 202, body: published.snapshot.body };
  } catch (error) {
    // An ambiguous transaction outcome must not mark a completed claim failed.
    // Preserve its lock; a replay can discover a committed receipt safely.
    const receipt = await args.requestIdempotencyService.getResponseSnapshot({
      userId,
      route: "/api/preview/video/generate",
      key: args.idempotencyKey,
    });
    if (receipt?.statusCode === 202 && typeof receipt.body.jobId === "string") {
      try {
        scheduleInlineVideoProcessing({
          jobId: receipt.body.jobId,
          videoJobStore,
          videoGenerationService,
          storageService: storageService ?? null,
          sessionService: sessionService ?? null,
        });
      } catch {
        /* Durable receipt remains replayable even if inline scheduling is unavailable. */
      }
      return { ok: true, status: 202, body: receipt.body };
    }
    log.error(
      "Free clip publication failed",
      error instanceof Error ? error : undefined,
      { userId, requestId },
    );
    return {
      ok: false,
      retainClaim: true,
      error: {
        status: 503,
        payload: {
          error: "Video intake could not confirm durable publication",
          code: GENERATION_ERROR_CODES.SERVICE_UNAVAILABLE,
          details:
            "Retry this request with the same idempotency key; no new job will be scheduled without its receipt.",
        },
      },
    };
  }
}
