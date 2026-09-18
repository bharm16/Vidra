import { getVideoCost } from "@config/modelCosts";
import { normalizeGenerationParams } from "@routes/optimize/normalizeGenerationParams";
import { GENERATION_ERROR_CODES } from "@routes/generationErrorCodes";
import type { VideoGenerationOptions } from "@services/video-generation/types";
import { extractMotionMeta, resolveMotionContext } from "./motion";
import type {
  VideoErrorResult,
  VideoRequestPlan,
  VideoRequestPlanArgs,
} from "./types";

interface ModelUnavailableInput {
  availability: {
    statusCode?: number;
    message?: string;
    reason?: string;
    requiredKey?: string;
    resolvedModelId?: string;
  };
  availableModelIds: string[];
  availableCapabilityModels: string[];
}

export const createModelUnavailableError = ({
  availability,
  availableModelIds,
  availableCapabilityModels,
}: ModelUnavailableInput): VideoErrorResult => {
  const statusCode = availability.statusCode || 503;
  const availabilityDetails = [
    availability.message || "Requested video model is not available",
    ...(availability.reason ? [`Reason: ${availability.reason}`] : []),
    ...(availability.requiredKey
      ? [`Missing key: ${availability.requiredKey}`]
      : []),
    ...(availability.resolvedModelId
      ? [`Resolved model: ${availability.resolvedModelId}`]
      : []),
    ...(availableModelIds.length > 0
      ? [`Available models: ${availableModelIds.join(", ")}`]
      : []),
    ...(availableCapabilityModels.length > 0
      ? [`Available capability models: ${availableCapabilityModels.join(", ")}`]
      : []),
  ].join(" | ");

  return {
    status: statusCode,
    payload: {
      error: "Video model not available",
      code: GENERATION_ERROR_CODES.SERVICE_UNAVAILABLE,
      details: availabilityDetails,
    },
  };
};

export const buildVideoRequestPlan = (
  args: VideoRequestPlanArgs,
):
  | { ok: true; value: VideoRequestPlan }
  | { ok: false; error: VideoErrorResult } => {
  const {
    generationParams,
    model,
    operation,
    requestId,
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
  } = args;

  const asFiniteNumber = (value: unknown): number | undefined => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return undefined;
  };

  const normalized = normalizeGenerationParams({
    generationParams,
    operation,
    requestId,
    userId,
    ...(model ? { targetModel: model } : {}),
  });

  if (normalized.error) {
    const code =
      normalized.error.status === 503
        ? GENERATION_ERROR_CODES.SERVICE_UNAVAILABLE
        : normalized.error.status >= 500
          ? GENERATION_ERROR_CODES.GENERATION_FAILED
          : GENERATION_ERROR_CODES.INVALID_REQUEST;

    return {
      ok: false,
      error: {
        status: normalized.error.status,
        payload: {
          error: normalized.error.error,
          code,
          ...(normalized.error.details
            ? { details: normalized.error.details }
            : {}),
        },
      },
    };
  }

  const normalizedParams = normalized.normalizedGenerationParams as Record<
    string,
    unknown
  > | null;
  const paramAspectRatio =
    normalizedParams && typeof normalizedParams.aspect_ratio === "string"
      ? (normalizedParams.aspect_ratio as VideoGenerationOptions["aspectRatio"])
      : undefined;
  const paramFps = asFiniteNumber(normalizedParams?.fps);
  const paramDurationS = asFiniteNumber(normalizedParams?.duration_s);
  const paramSeed = asFiniteNumber(normalizedParams?.seed);
  const paramResolution =
    normalizedParams && typeof normalizedParams.resolution === "string"
      ? normalizedParams.resolution
      : undefined;

  const seconds =
    paramDurationS != null &&
    ["4", "5", "6", "8", "10", "12"].includes(String(paramDurationS))
      ? (String(paramDurationS) as VideoGenerationOptions["seconds"])
      : undefined;

  const durationForCost = paramDurationS ?? 8;
  const videoCost = getVideoCost(costModel, durationForCost);

  const size =
    typeof paramResolution === "string" &&
    (/\d+x\d+/i.test(paramResolution) ||
      /p$/i.test(paramResolution) ||
      /k$/i.test(paramResolution))
      ? paramResolution
      : undefined;

  const numFrames =
    typeof paramDurationS === "number" && typeof paramFps === "number"
      ? Math.max(1, Math.min(300, Math.round(paramDurationS * paramFps)))
      : undefined;

  const motionContext = resolveMotionContext(
    normalizedParams,
    generationParams,
  );
  // Truth (ADR-0010): the queued prompt is the creator's text verbatim — motion
  // params are no longer spliced in. ADR-0022 D7 removed the last side channel
  // too: a camera id used to flip promptExtend off for image-to-video, so the
  // same visible words ran differently depending on a click the request never
  // named. The camera choice now lands in the words; nothing is implied here.
  const normalizedMotionMeta = extractMotionMeta(normalizedParams);

  const options: VideoGenerationOptions = {};
  const resolvedAspectRatio = paramAspectRatio || aspectRatio;
  if (resolvedAspectRatio) {
    options.aspectRatio = resolvedAspectRatio as NonNullable<
      VideoGenerationOptions["aspectRatio"]
    >;
  }
  if (model) {
    options.model = model as NonNullable<VideoGenerationOptions["model"]>;
  }
  if (resolvedStartImage) {
    options.startImage = resolvedStartImage;
  }
  if (inputReference) {
    options.inputReference = inputReference;
  }
  if (endImage) {
    options.endImage = endImage;
  }
  if (referenceImages && referenceImages.length > 0) {
    options.referenceImages = referenceImages;
  }
  if (extendVideoUrl) {
    options.extendVideoUrl = extendVideoUrl;
  }
  if (characterAssetId) {
    options.characterAssetId = characterAssetId;
  }
  if (faceSwapAlreadyApplied) {
    options.faceSwapAlreadyApplied = true;
  }
  if (swappedImageUrl) {
    options.faceSwapUrl = swappedImageUrl;
  }
  if (typeof paramFps === "number") {
    options.fps = paramFps;
  }
  if (typeof paramSeed === "number") {
    options.seed = Math.round(paramSeed);
  }
  if (seconds) {
    options.seconds = seconds;
  }
  if (size) {
    options.size = size;
  }
  if (typeof numFrames === "number") {
    options.numFrames = numFrames;
  }

  return {
    ok: true,
    value: {
      normalizedParams,
      motionContext,
      normalizedMotionMeta,
      options,
      videoCost,
    },
  };
};
