import { findProviderForModel } from "./registry";
import { CAPABILITY_ID_TO_VENDOR } from "@shared/modelIdentity";

const MODEL_ID_ALIASES: Record<string, string> = {
  runway: "runway-gen45",
  luma: "luma-ray3",
  kling: "kling-26",
  sora: "sora-2",
  veo: "veo-4",
  wan: "wan-2.2",
  "wan-2.5": "wan-2.5",
  "kling-2.1": "kling-26",
  "veo-3": "veo-4",
  "kling-26": "kling-26",
  "veo-4": "veo-4",
  // Video-generation model keys/ids (used by /preview/video/generate)
  PRO: "wan-2.2",
  DRAFT: "wan-2.2",
  DRAFT_I2V: "wan-2.5",
  DRAFT_I2V_LEGACY: "wan-2.2",
  DRAFT_I2V_WAN_2_5: "wan-2.5",
  "wan-video/wan-2.2-t2v-fast": "wan-2.2",
  "wan-video/wan-2.2-i2v-fast": "wan-2.2",
  "kling-v2-1-master": "kling-26",
  "kwaivgi/kling-v2.1": "kling-26",
  "google/veo-3": "veo-4",
  "wan-video/wan-2.5-i2v": "wan-2.5",
  "wan-video/wan-2.5-i2v-fast": "wan-2.5",
};

/**
 * Capability-registry spelling → vendor bucket.
 *
 * Derived from `shared/modelIdentity.ts`. This is the VENDOR vocabulary
 * (who makes the model — `google`, `wan`, `runway`), deliberately not the
 * adapter vocabulary used on the generation path (`gemini`, `replicate`).
 * Conflating the two is what let `runway` look callable and `wan` look like
 * a provider; the identity table now carries both facts separately.
 *
 * Wider than the literal it replaces: it also covers `veo-3`, `kling-2.1` and
 * `sora-2-pro`. Each of those resolved to the same vendor before — the first
 * two via MODEL_ID_ALIASES, the third via the `findProviderForModel` registry
 * fallback below — so answers are unchanged, with two fewer hops.
 */
const MODEL_PROVIDER_MAP: Record<string, string> = CAPABILITY_ID_TO_VENDOR;

export const resolveModelId = (modelId?: string | null): string | null => {
  if (!modelId) {
    return null;
  }
  return MODEL_ID_ALIASES[modelId] ?? modelId;
};

export const resolveProviderForModel = (
  modelId?: string | null,
): string | null => {
  const resolved = resolveModelId(modelId);
  if (!resolved) {
    return null;
  }
  return MODEL_PROVIDER_MAP[resolved] ?? findProviderForModel(resolved);
};
