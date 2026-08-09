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
import type { StoredVideoAsset, VideoAssetStore } from "../storage";
import type { VideoGenerationOptions } from "../types";

/**
 * The providers that can dispatch a generation call.
 *
 * The same set as `GenerationAdapter` in the shared identity table, not a
 * second declaration of it — that table is what maps a model to the provider
 * that runs it, so the two can never disagree about which providers exist.
 */
export const VIDEO_PROVIDER_IDS = GENERATION_ADAPTERS;
export type VideoProviderId = GenerationAdapter;

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
