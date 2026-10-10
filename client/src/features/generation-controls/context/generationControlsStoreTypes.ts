import type { CapabilityValues } from "@shared/capabilities";
import type { CameraPath } from "@shared/cameraMotion";
import type { KeyframeTile, VideoTier } from "../types";

export type GenerationControlsTab = "video" | "image";
export type ImageSubTab = "references" | "styles";

export interface VideoReferenceImage {
  id: string;
  url: string;
  referenceType: "asset" | "style";
  source: "upload" | "library" | "asset";
  storagePath?: string;
  assetId?: string;
  viewUrlExpiresAt?: string;
}

export interface ExtendVideoSource {
  url: string;
  source: "generation" | "upload";
  generationId?: string;
  storagePath?: string;
  assetId?: string;
}

export interface GenerationControlsDomainState {
  selectedModel: string;
  generationParams: CapabilityValues;
  videoTier: VideoTier;
  keyframes: KeyframeTile[];
  startFrame: KeyframeTile | null;
  endFrame: KeyframeTile | null;
  videoReferenceImages: VideoReferenceImage[];
  extendVideo: ExtendVideoSource | null;
  cameraMotion: CameraPath | null;
  subjectMotion: string;
}

export interface GenerationControlsUIState {
  activeTab: GenerationControlsTab;
  imageSubTab: ImageSubTab;
}

export interface GenerationControlsState {
  domain: GenerationControlsDomainState;
  ui: GenerationControlsUIState;
}

export const DEFAULT_GENERATION_CONTROLS_STATE: GenerationControlsState = {
  domain: {
    selectedModel: "",
    generationParams: {},
    videoTier: "render",
    keyframes: [],
    startFrame: null,
    endFrame: null,
    videoReferenceImages: [],
    extendVideo: null,
    cameraMotion: null,
    subjectMotion: "",
  },
  ui: {
    activeTab: "video",
    imageSubTab: "references",
  },
};
