/**
 * Video model identifiers and labels shared across features.
 *
 * The id set and the vendor map are derived from `@shared/modelIdentity` —
 * the client used to restate both, which is how it ended up listing `runway`
 * as a model the app can generate with when no adapter can call it. Copy
 * (labels, URLs) stays here: it is presentation, and keeping it keyed by the
 * shared union means adding a model upstream fails the client build until
 * someone writes the copy.
 */

import { CANONICAL_TO_VENDOR, type ModelVendor } from "@shared/modelIdentity";
import {
  CANONICAL_PROMPT_MODEL_IDS,
  type CanonicalPromptModelId,
} from "@shared/videoModels";

export const AI_MODEL_IDS = CANONICAL_PROMPT_MODEL_IDS;

export type AIModelId = CanonicalPromptModelId;

export const AI_MODEL_URLS: Record<AIModelId, string> = {
  "runway-gen45": "https://runwayml.com/",
  "luma-ray3": "https://lumalabs.ai/",
  "sora-2": "https://openai.com/sora",
  "veo-3": "https://deepmind.google/models/veo/",
  "kling-2.1": "https://kling.ai/",
  "wan-2.2": "https://wanvideo.alibaba.com/",
} as const;

export const AI_MODEL_LABELS: Record<AIModelId, string> = {
  "runway-gen45": "Runway Gen-45",
  "luma-ray3": "Luma Ray 3",
  "sora-2": "Sora 2",
  "veo-3": "Veo 3",
  "kling-2.1": "Kling 2.1",
  "wan-2.2": "Wan 2.2",
} as const;

export const AI_MODEL_PROVIDERS: Record<AIModelId, ModelVendor> =
  CANONICAL_TO_VENDOR;

/**
 * Showroom sample stills — static bundled assets served from
 * client/public/model-stills. Art-directed to visualize each model's
 * strength copy; generated with the app's own draft pipeline
 * (flux-schnell, 16:9 webp), not the named provider's output.
 * Matched by model family (same idiom as resolveModelMeta) because
 * runtime ids vary in form (e.g. "kling-v2-1-master", "google/veo-3").
 */
export const resolveModelStill = (modelId: string): string | undefined => {
  const id = modelId.toLowerCase();
  if (id.includes("sora")) return "/model-stills/sora-2.webp";
  if (id.includes("veo")) return "/model-stills/veo-3.webp";
  if (id.includes("kling")) return "/model-stills/kling-2.1.webp";
  if (id.includes("luma")) return "/model-stills/luma-ray3.webp";
  if (id.includes("wan-2.5")) return "/model-stills/wan-2.5.webp";
  if (id.includes("wan")) return "/model-stills/wan-2.2.webp";
  return undefined;
};

export type ModelMeta = {
  strength: string;
  badges: string[];
};

export const resolveModelMeta = (modelId: string): ModelMeta => {
  const id = modelId.toLowerCase();
  if (id.includes("sora")) {
    return {
      strength: "Cinematic motion and high fidelity",
      badges: ["Cinematic", "Photoreal"],
    };
  }
  if (id.includes("veo")) {
    return {
      strength: "Strong lighting, realism, and camera",
      badges: ["Cinematic", "Photoreal"],
    };
  }
  if (id.includes("kling")) {
    return {
      strength: "Stable subjects and dynamic movement",
      badges: ["Cinematic", "Character"],
    };
  }
  if (id.includes("luma")) {
    return {
      strength: "Fast, clean previews with realism",
      badges: ["Fast", "Photoreal"],
    };
  }
  if (id.includes("runway")) {
    return {
      strength: "Quick iterations with strong style",
      badges: ["Fast", "Cinematic"],
    };
  }
  if (id.includes("wan")) {
    return {
      strength: "Speedy motion checks for iteration",
      badges: ["Fast", "Balanced"],
    };
  }
  return { strength: "Balanced preview defaults", badges: ["Balanced"] };
};
