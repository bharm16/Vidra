/**
 * Video generation provider seam.
 *
 * Mirrors `ImagePreviewProvider` (server/src/services/image-generation/
 * providers/types.ts): a small interface, one class per provider, each
 * registered independently in DI. Before this, the five providers were
 * closures inside one 206-line factory, all reading fields off a shared SDK
 * bag — so adding or removing one meant editing nine places, four of which
 * merely restated facts the provider already knew.
 */

import {
  GENERATION_ADAPTERS,
  type GenerationAdapter,
} from "@shared/modelIdentity";
import type { VideoModelId } from "@shared/videoModels";
import { VIDEO_MODELS } from "@config/modelConfig";

/** `keyof typeof VIDEO_MODELS` — a server-local runtime config, so it cannot
 * live in shared/. */
export type VideoModelKey = keyof typeof VIDEO_MODELS;
import type { StoredVideoAsset, VideoAssetStore } from "../storage";

/**
 * The providers that can dispatch a generation call.
 *
 * The same set as `GenerationAdapter` in the shared identity table, not a
 * second declaration of it — that table is what maps a model to the provider
 * that runs it, so the two can never disagree about which providers exist.
 */
export const VIDEO_PROVIDER_IDS = GENERATION_ADAPTERS;
export type VideoProviderId = GenerationAdapter;

export interface VideoGenerationOptions {
  model?: VideoModelKey | VideoModelId;
  aspectRatio?: "16:9" | "9:16" | "21:9" | "1:1";
  numFrames?: number;
  fps?: number;
  negativePrompt?: string;
  /** Override Replicate's prompt_extend behavior for Wan models */
  promptExtend?: boolean;
  startImage?: string;
  /** End/last frame image URL for interpolation (Veo, Luma, Kling) */
  endImage?: string;
  /** Reference image URLs for style/character consistency (Veo: up to 3) */
  referenceImages?: Array<{ url: string; type: "asset" | "style" }>;
  /** URL of an existing video to extend/continue (Veo scene extension) */
  extendVideoUrl?: string;
  inputReference?: string;
  seconds?: "4" | "5" | "6" | "8" | "10" | "12";
  size?: string;
  seed?: number;
  /** Provider-native style reference image (if supported) */
  style_reference?: string;
  /** Optional weight/strength for provider-native style reference */
  style_reference_weight?: number;
  /** Asset ID of a character - triggers automatic PuLID keyframe generation */
  characterAssetId?: string;
  /** If true (default), automatically generate keyframe for character assets */
  autoKeyframe?: boolean;
  /** When true, startImage already includes a face-swap result (skip preprocessing). */
  faceSwapAlreadyApplied?: boolean;
  /** Optional face-swap preview URL for provenance/metadata. */
  faceSwapUrl?: string;
}

export type VideoProviderLog = {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (
    message: string,
    error?: Error,
    meta?: Record<string, unknown>,
  ) => void;
};

export interface VideoGenerateResult {
  asset: StoredVideoAsset;
  seed?: number;
  resolvedAspectRatio?: string;
  providerCost?: { amount: number; currency: string; unit: string };
}

export interface VideoProvider {
  id: VideoProviderId;
  displayName: string;
  /** Env var that must be set for {@link isAvailable} to be true. */
  requiredKey: string;

  isAvailable(): boolean;

  generate(
    prompt: string,
    modelId: VideoModelId,
    options: VideoGenerationOptions,
    assetStore: VideoAssetStore,
    log: VideoProviderLog,
  ): Promise<VideoGenerateResult>;
}

export type VideoProviderMap = Record<VideoProviderId, VideoProvider>;

/**
 * What each provider needs to be usable, and what to say when it isn't.
 *
 * One declaration, read by both the provider (which throws the message on a
 * generate call it cannot serve) and the availability report (which reports
 * it without constructing anything). These strings previously existed twice —
 * verbatim — in `availability.ts` and inside each provider closure, with
 * nothing keeping them in step.
 */
export const VIDEO_PROVIDER_CREDENTIALS: Record<
  VideoProviderId,
  { requiredKey: string; missingMessage: string }
> = {
  replicate: {
    requiredKey: "REPLICATE_API_TOKEN",
    missingMessage:
      "Replicate API token is required for the selected video model.",
  },
  openai: {
    requiredKey: "OPENAI_API_KEY",
    missingMessage: "Sora video generation requires OPENAI_API_KEY.",
  },
  luma: {
    requiredKey: "LUMA_API_KEY",
    missingMessage:
      "Luma video generation requires LUMA_API_KEY or LUMAAI_API_KEY.",
  },
  kling: {
    requiredKey: "KLING_API_KEY",
    missingMessage: "Kling video generation requires KLING_API_KEY.",
  },
  gemini: {
    requiredKey: "GEMINI_API_KEY",
    missingMessage: "Veo video generation requires GEMINI_API_KEY.",
  },
};

/** Throw the provider's own missing-credential error. */
export function missingCredential(id: VideoProviderId): never {
  throw new Error(VIDEO_PROVIDER_CREDENTIALS[id].missingMessage);
}
