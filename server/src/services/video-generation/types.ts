import { VIDEO_MODELS } from "@config/modelConfig";
import type { VideoModelId } from "@shared/videoModels";
import type { VideoAssetStore } from "./storage";
import type {
  VideoGenerationOptions,
  VideoModelKey,
  VideoProviderId,
  VideoProviderMap,
} from "./providers/types";

// The port owns the request shape; re-exported so existing importers of
// `@services/video-generation/types` keep working. Importing it back the
// other way made these two modules a cycle.
export type { VideoGenerationOptions, VideoModelKey };

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
