import { VIDEO_MODELS } from "@config/modelConfig";
import type { VideoModelId } from "@shared/videoModels";
import type { VideoAssetStore } from "./storage";
import type { VideoProviderId, VideoProviderMap } from "./providers/types";

// Pure type family lives in `shared/videoModels.ts`. Re-exported here for
// backward compatibility with existing importers under
// `@services/video-generation/types`. Prefer importing from `@shared/videoModels`
// directly in new code.
export type {
  KlingAspectRatio,
  KlingModelId,
  KnownVideoModelId,
  LumaModelId,
  SoraModelId,
  VeoModelId,
  VideoModelId,
} from "@shared/videoModels";

export interface VideoGenerationServiceOptions {
  /** The providers this service dispatches to, assembled in DI. */
  providers: VideoProviderMap;
  assetStore?: VideoAssetStore;
}

// `VideoModelKey` stays here — it is `keyof typeof VIDEO_MODELS`, which
// depends on the server-local runtime config. It cannot be moved to `shared/`
// without also exporting `VIDEO_MODELS` (a Node-scoped value) from shared.
export type VideoModelKey = keyof typeof VIDEO_MODELS;

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

export interface VideoGenerationResult {
  assetId: string;
  videoUrl: string;
  contentType: string;
  inputMode?: "t2v" | "i2v";
  startImageUrl?: string;
  storagePath?: string;
  viewUrl?: string;
  viewUrlExpiresAt?: string;
  sizeBytes?: number;
  seed?: number;
  /** The actual aspect ratio used by the provider (may differ from the requested one). */
  resolvedAspectRatio?: string;
  /** Provider-reported cost for this generation (if available). */
  providerCost?: { amount: number; currency: string; unit: string };
}

/**
 * Which providers are usable right now.
 *
 * Derived from `VideoProviderId` rather than restating the five names: as a
 * hand-written interface, adding or removing a provider meant remembering to
 * edit this too, and nothing failed if you didn't.
 */
export type VideoProviderAvailability = Record<VideoProviderId, boolean>;

export interface VideoModelAvailability {
  id: string;
  available: boolean;
  reason?: "unsupported_model" | "missing_credentials" | "unknown_availability";
  requiredKey?: string;
  resolvedModelId?: VideoModelId;
  capabilityModelId?: string;
  requestedId?: string;
  statusCode?: number;
  message?: string;
  supportsImageInput?: boolean;
  supportsI2V?: boolean;
  planTier?: string;
  entitled?: boolean;
}

export interface VideoAvailabilityReport {
  providers: VideoProviderAvailability;
  models: VideoModelAvailability[];
  availableModels: string[];
  availableCapabilityModels?: string[];
}

export interface VideoAvailabilitySnapshotModel {
  id: VideoModelId;
  available: boolean;
  reason?: VideoModelAvailability["reason"];
  requiredKey?: string;
  supportsI2V?: boolean;
  supportsImageInput?: boolean;
  planTier?: string;
  entitled?: boolean;
}

export interface VideoAvailabilitySnapshot {
  models: VideoAvailabilitySnapshotModel[];
  availableModelIds: VideoModelId[];
  unknownModelIds: VideoModelId[];
}
