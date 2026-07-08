/**
 * Image generation request types
 */

import type {
  ImagePreviewProviderSelection,
  ImagePreviewSpeedMode,
} from "../providers/types";

/**
 * Image generation options
 */
export interface ImageGenerationOptions {
  aspectRatio?: string;
  userId?: string;
  provider?: ImagePreviewProviderSelection;
  inputImageUrl?: string;
  seed?: number;
  speedMode?: ImagePreviewSpeedMode;
  outputQuality?: number;
}
