import type { VideoModelId, VideoProviderAvailability } from "../types";
import { resolveModelSelection } from "../modelResolver";
import { resolveProviderForGenerationModel } from "@config/videoModelRegistry";
import {
  VIDEO_PROVIDER_IDS,
  type VideoProviderId,
  type VideoProviderMap,
} from "./types";

export function getProviderAvailability(
  providers: VideoProviderMap,
): VideoProviderAvailability {
  return Object.fromEntries(
    VIDEO_PROVIDER_IDS.map((id) => [id, providers[id].isAvailable()]),
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
    modelId: () => resolveModelSelection("PRO").modelId,
  },
  { provider: "openai", modelId: () => "sora-2" },
  { provider: "luma", modelId: () => "luma-ray3" },
  { provider: "kling", modelId: () => "kling-v2-1-master" },
  { provider: "gemini", modelId: () => "google/veo-3" },
];

export { AUTO_MODEL_PRIORITY };

export function resolveAutoModelId(
  providers: VideoProviderAvailability,
): VideoModelId | null {
  for (const entry of AUTO_MODEL_PRIORITY) {
    if (providers[entry.provider]) {
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
