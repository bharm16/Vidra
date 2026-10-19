import { resolveGenerationModelSelection } from "@config/videoModelRegistry";
import { isReleaseGenerationModelSupported } from "@shared/videoModels";
import type {
  VideoAvailabilitySnapshot,
  VideoModelAvailability,
  VideoModelId,
  VideoProviderAvailability,
} from "./types";
import { VIDEO_MODELS } from "@config/modelConfig";
import {
  resolveAutoModelId,
  resolveProviderForModel,
} from "./providers/ProviderRegistry";
import { VIDEO_PROVIDER_CREDENTIALS } from "./providers/types";

type LogSink = {
  warn: (message: string, meta?: Record<string, unknown>) => void;
};

const CANONICAL_VIDEO_MODEL_IDS = new Set<VideoModelId>(
  Object.values(VIDEO_MODELS) as VideoModelId[],
);

const isCanonicalVideoModelId = (modelId: string): modelId is VideoModelId =>
  CANONICAL_VIDEO_MODEL_IDS.has(modelId as VideoModelId);

// Credential facts come from VIDEO_PROVIDER_CREDENTIALS. Two verbatim copies
// of these strings used to live here and inside each provider closure, so the
// error a caller saw could drift from the one the report explained.
const requiredKeyFor = (provider: keyof VideoProviderAvailability): string =>
  VIDEO_PROVIDER_CREDENTIALS[provider].requiredKey;

const missingMessageFor = (provider: keyof VideoProviderAvailability): string =>
  VIDEO_PROVIDER_CREDENTIALS[provider].missingMessage;

export function getModelAvailability(
  model: string | null | undefined,
  providers: VideoProviderAvailability,
  log: LogSink,
): VideoModelAvailability {
  const resolution = resolveGenerationModelSelection(model || undefined, log);
  const isAuto =
    !model ||
    (typeof model === "string" &&
      (model.trim().length === 0 || model.trim().toLowerCase() === "auto"));
  const autoModelId = isAuto ? resolveAutoModelId(providers) : null;
  const resolvedId = autoModelId || resolution.modelId;
  const requestedId =
    typeof model === "string" && model.trim().length > 0
      ? model.trim()
      : "auto";

  if (isAuto && !autoModelId) {
    return {
      id: "auto",
      requestedId: "auto",
      available: false,
      reason: "missing_credentials",
      statusCode: 424,
      message: "No video generation providers are configured.",
      entitled: false,
      planTier: "unknown",
    };
  }

  const normalizedModel =
    typeof model === "string" ? model.trim().toLowerCase() : "";

  if (
    model &&
    normalizedModel !== "auto" &&
    resolution.resolvedBy === "default"
  ) {
    return {
      id: model,
      requestedId: model,
      available: false,
      reason: "unsupported_model",
      statusCode: 400,
      message: `Unknown video model: ${model}`,
      entitled: false,
      planTier: "unknown",
    };
  }

  const providerKey = resolveProviderForModel(resolvedId);
  const isAvailable = providers[providerKey];

  const base = {
    id: model || resolvedId,
    requestedId,
    resolvedModelId: resolvedId,
  };

  if (!isReleaseGenerationModelSupported(resolvedId)) {
    return {
      ...base,
      available: false,
      reason: "unsupported_model",
      statusCode: 400,
      message: "This video model is not offered during free testing.",
      entitled: false,
      planTier: "unknown",
    };
  }

  if (!isAvailable) {
    return {
      ...base,
      available: false,
      reason: "missing_credentials",
      requiredKey: requiredKeyFor(providerKey),
      statusCode: 424,
      message: missingMessageFor(providerKey),
      entitled: false,
      planTier: "unknown",
    };
  }

  return {
    ...base,
    available: true,
    entitled: true,
    planTier: "unknown",
  };
}

export function getAvailabilitySnapshot(
  modelIds: VideoModelId[],
  providers: VideoProviderAvailability,
  log: LogSink,
): VideoAvailabilitySnapshot {
  const uniqueIds = Array.from(new Set(modelIds));

  const models = uniqueIds.map((modelId) => {
    const canonicalModelId = isCanonicalVideoModelId(modelId) ? modelId : null;
    if (!canonicalModelId) {
      log.warn(
        "Non-canonical video model ID supplied to availability snapshot",
        { modelId },
      );
      return {
        id: modelId,
        available: false,
        reason: "unsupported_model" as const,
        entitled: false,
        planTier: "unknown",
      };
    }

    const availability = getModelAvailability(canonicalModelId, providers, log);

    return {
      id: canonicalModelId,
      available: availability.available,
      planTier: availability.planTier ?? "unknown",
      ...(availability.available
        ? {}
        : { reason: availability.reason ?? "unknown_availability" }),
      ...(availability.requiredKey
        ? { requiredKey: availability.requiredKey }
        : {}),
      ...(availability.entitled !== undefined
        ? { entitled: availability.entitled }
        : {}),
    };
  });

  const availableModelIds = models
    .filter((model) => model.available)
    .map((model) => model.id);
  const unknownModelIds = models
    .filter(
      (model) => !model.available && model.reason === "unknown_availability",
    )
    .map((model) => model.id);

  return { models, availableModelIds, unknownModelIds };
}
