import type { VideoModelId, VideoProviderAvailability } from "../types";
import { isReleaseGenerationModelSupported } from "@shared/videoModels";
import {
  resolveGenerationModelSelection,
  resolveProviderForGenerationModel,
} from "@config/videoModelRegistry";
import {
  VIDEO_PROVIDER_IDS,
  type VideoProviderId,
  type VideoProviderMap,
} from "./types";

export function getProviderAvailability(
  providers: VideoProviderMap,
): VideoProviderAvailability {
  return Object.fromEntries(
    VIDEO_PROVIDER_IDS.map((id) => [id, providers[id]?.isAvailable() ?? false]),
  ) as VideoProviderAvailability;
}

/**
 * Which model "auto" resolves to, in preference order.
 *
 * An ordered list rather than an if-chain so that the preference order is a
 * value the tests can assert is total — the chain could silently omit a
 * provider and still compile. Replicate's entry is a thunk because its model
 * id comes from the env-aware `VIDEO_MODELS` config.
 */
const AUTO_MODEL_PRIORITY: ReadonlyArray<{
  provider: VideoProviderId;
  modelId: () => VideoModelId;
}> = [
  {
    provider: "replicate",
    modelId: () => resolveGenerationModelSelection("PRO").modelId,
  },
  { provider: "gemini", modelId: () => "google/veo-3" },
];

export { AUTO_MODEL_PRIORITY };

export function resolveAutoModelId(
  providers: VideoProviderAvailability,
): VideoModelId | null {
  for (const entry of AUTO_MODEL_PRIORITY) {
    if (
      providers[entry.provider] &&
      isReleaseGenerationModelSupported(entry.modelId())
    ) {
      return entry.modelId();
    }
  }
  return null;
}

export function resolveProviderForModel(
  modelId: VideoModelId,
): keyof VideoProviderAvailability {
  return resolveProviderForGenerationModel(modelId);
}
