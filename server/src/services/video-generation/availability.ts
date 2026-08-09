import { resolveModelSelection } from "./modelResolver";
import type {
  VideoAvailabilityReport,
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
import { MANUAL_CAPABILITIES_REGISTRY } from "@services/capabilities/manualRegistry";
import { getDynamicCapabilitiesRegistry } from "@services/capabilities/dynamicRegistry";
import { resolveModelId as resolveCapabilityModelId } from "@services/capabilities/modelProviders";

type LogSink = {
  warn: (message: string, meta?: Record<string, unknown>) => void;
};

const CANONICAL_VIDEO_MODEL_IDS = new Set<VideoModelId>(
  Object.values(VIDEO_MODELS) as VideoModelId[],
);

const isCanonicalVideoModelId = (modelId: string): modelId is VideoModelId =>
  CANONICAL_VIDEO_MODEL_IDS.has(modelId as VideoModelId);

const withCapabilityModelId = (
  capabilityModelId: string | null,
): { capabilityModelId?: string } =>
  capabilityModelId ? { capabilityModelId } : {};

// Credential facts come from VIDEO_PROVIDER_CREDENTIALS. Two verbatim copies
// of these strings used to live here and inside each provider closure, so the
// error a caller saw could drift from the one the report explained.
const requiredKeyFor = (provider: keyof VideoProviderAvailability): string =>
  VIDEO_PROVIDER_CREDENTIALS[provider].requiredKey;

const missingMessageFor = (provider: keyof VideoProviderAvailability): string =>
  VIDEO_PROVIDER_CREDENTIALS[provider].missingMessage;

export function getModelCapabilities(modelId: string): {
  supportsImageInput: boolean;
  supportsSeed: boolean;
  supportsStyleReference: boolean;
  supportsCharacterReference: boolean;
  supportsExtendVideo: boolean;
  capabilityModelId: string | null;
} {
  const resolvedCapabilityId = resolveCapabilityModelId(modelId);
  const lookupId = resolvedCapabilityId ?? modelId;

  const registries = [
    getDynamicCapabilitiesRegistry(),
    MANUAL_CAPABILITIES_REGISTRY,
  ];
  for (const registry of registries) {
    for (const [, models] of Object.entries(registry)) {
      for (const [id, schema] of Object.entries(models)) {
        if (id === lookupId || schema.model === lookupId) {
          return {
            supportsImageInput: schema.fields?.image_input?.default === true,
            supportsSeed: Boolean(schema.fields?.seed),
            supportsStyleReference:
              schema.fields?.style_reference?.default === true,
            supportsCharacterReference:
              schema.fields?.character_reference?.default === true,
            supportsExtendVideo: schema.fields?.extend_video?.default === true,
            capabilityModelId: id,
          };
        }
      }
    }
  }

  const i2vModels = [
    "sora-2",
    "sora-2-pro",
    "luma-ray3",
    "kling-26",
    "wan-2.2",
    "wan-2.5",
  ];
  return {
    supportsImageInput: i2vModels.some((entry) => lookupId.includes(entry)),
    supportsSeed: false,
    supportsStyleReference: false,
    supportsCharacterReference: false,
    supportsExtendVideo: false,
    capabilityModelId: resolvedCapabilityId ?? null,
  };
}

export function getModelAvailability(
  model: string | null | undefined,
  providers: VideoProviderAvailability,
  log: LogSink,
): VideoModelAvailability {
  const resolution = resolveModelSelection(model || undefined, log);
  const isAuto =
    !model ||
    (typeof model === "string" &&
      (model.trim().length === 0 || model.trim().toLowerCase() === "auto"));
  const autoModelId = isAuto ? resolveAutoModelId(providers) : null;
  const resolvedId = autoModelId || resolution.modelId;
  const capabilityInfo = getModelCapabilities(resolvedId);
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
      supportsI2V: false,
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
      supportsI2V: false,
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
    ...withCapabilityModelId(capabilityInfo.capabilityModelId),
    supportsImageInput: capabilityInfo.supportsImageInput,
    supportsI2V: capabilityInfo.supportsImageInput,
  };

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

export function getAvailabilityReport(
  modelIds: string[],
  providers: VideoProviderAvailability,
  log: LogSink,
): VideoAvailabilityReport {
  const uniqueIds = Array.from(new Set(modelIds));
  const models = uniqueIds.map((id) =>
    getModelAvailability(id, providers, log),
  );
  const availableModels = models
    .filter((model) => model.available)
    .map((model) => model.resolvedModelId ?? model.id);
  const availableCapabilityModels = models
    .filter((model) => model.available)
    .map((model) => model.capabilityModelId ?? model.id);

  return { providers, models, availableModels, availableCapabilityModels };
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
        supportsI2V: false,
        supportsImageInput: false,
        entitled: false,
        planTier: "unknown",
      };
    }

    const availability = getModelAvailability(canonicalModelId, providers, log);
    const supportsI2V =
      availability.supportsI2V ?? availability.supportsImageInput ?? false;

    return {
      id: canonicalModelId,
      available: availability.available,
      supportsI2V,
      planTier: availability.planTier ?? "unknown",
      ...(availability.available
        ? {}
        : { reason: availability.reason ?? "unknown_availability" }),
      ...(availability.requiredKey
        ? { requiredKey: availability.requiredKey }
        : {}),
      ...(availability.supportsImageInput !== undefined
        ? { supportsImageInput: availability.supportsImageInput }
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
