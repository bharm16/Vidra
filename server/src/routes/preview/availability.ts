import { getCapabilitiesRegistry } from "@services/capabilities";
import type { VideoAvailabilityReport } from "@services/video-generation/types";

let capabilityModelIdsCache: string[] | null = null;

export const getCapabilityModelIds = (): string[] => {
  if (capabilityModelIdsCache) {
    return capabilityModelIdsCache;
  }

  const ids = new Set<string>();
  for (const [provider, models] of Object.entries(getCapabilitiesRegistry())) {
    if (provider === "generic") continue;
    for (const modelId of Object.keys(models)) {
      ids.add(modelId);
    }
  }
  capabilityModelIdsCache = Array.from(ids);
  return capabilityModelIdsCache;
};

/**
 * The availability payload returned when nothing is configured.
 *
 * Annotated, not inferred: as a bare literal this restated the five provider
 * names where no type could reach it, so a provider added or removed anywhere
 * else left this endpoint silently wrong. The annotation is what makes that a
 * build error.
 */
export const emptyAvailability = (): VideoAvailabilityReport => ({
  providers: {
    replicate: false,
    openai: false,
    luma: false,
    kling: false,
    gemini: false,
  },
  models: [],
  availableModels: [],
  availableCapabilityModels: [],
});
