export type DraftModel = "flux-kontext" | "wan-2.2" | "wan-2.5";

export type VideoTier = "draft" | "render";

export interface KeyframeTile {
  id: string;
  url: string;
  source: "upload" | "library" | "generation" | "asset";
  assetId?: string;
  sourcePrompt?: string;
  storagePath?: string;
  viewUrlExpiresAt?: string;
  /**
   * M5 / ADR-0013: when this frame is a persisted generated picture, its
   * generation id. Threaded to video generation as sourceGenerationId so the
   * resulting clip names its source picture in the space.
   */
  generationId?: string;
}

export interface StartImage {
  url: string;
  source: string;
  assetId?: string;
  storagePath?: string;
  viewUrlExpiresAt?: string;
  /** M5 / ADR-0013: source picture generation id (carried from the tile). */
  generationId?: string;
}

export interface SidebarUploadedImage {
  url: string;
  storagePath?: string;
  viewUrlExpiresAt?: string;
}

export interface GenerationOverrides {
  startImage?: StartImage | null;
  endImage?: {
    url: string;
    storagePath?: string;
    viewUrlExpiresAt?: string;
  } | null;
  referenceImages?: Array<{
    url: string;
    type: "asset" | "style";
    storagePath?: string;
    viewUrlExpiresAt?: string;
  }>;
  extendVideoUrl?: string | null;
  generationParams?: Record<string, unknown>;
  characterAssetId?: string | null;
  faceSwapAlreadyApplied?: boolean;
  faceSwapUrl?: string | null;
}
