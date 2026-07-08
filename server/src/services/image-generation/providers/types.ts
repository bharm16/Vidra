/**
 * Image preview provider types
 */

import type { ImagePreviewSpeedMode } from "@shared/schemas/preview.schemas";

export const IMAGE_PREVIEW_PROVIDER_IDS = [
  "replicate-flux-schnell",
  "replicate-flux-kontext-fast",
] as const;

export type ImagePreviewProviderId =
  (typeof IMAGE_PREVIEW_PROVIDER_IDS)[number];

export type ImagePreviewProviderSelection = ImagePreviewProviderId | "auto";

export type { ImagePreviewSpeedMode };

export interface ImagePreviewRequest {
  prompt: string;
  aspectRatio?: string;
  userId: string;
  inputImageUrl?: string;
  seed?: number;
  speedMode?: ImagePreviewSpeedMode;
  outputQuality?: number;
}

export interface ImagePreviewResult {
  imageUrl: string;
  model: string;
  durationMs: number;
  aspectRatio: string;
}

export interface ImagePreviewProvider {
  id: ImagePreviewProviderId;
  displayName: string;

  /**
   * True for img2img-only providers (e.g. Kontext) that cannot serve a
   * text-only request. Auto provider plans skip them when no input image
   * is present, so their "input image required" errors never mask the
   * real failure from a capable provider.
   */
  requiresInputImage?: boolean;

  isAvailable(): boolean;

  generatePreview(request: ImagePreviewRequest): Promise<ImagePreviewResult>;
}
