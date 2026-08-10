/**
 * Preview API
 *
 * Not a feature — a transport module. The name matches the `/api/preview/*`
 * route prefix, which survives only because media URLs already persisted in
 * generation records contain it. "Preview" names no domain concept; the
 * artifacts these calls produce are pictures and clips, and both are takes.
 * See the Domain Glossary note in CLAUDE.md.
 *
 * The component and hook layer that once lived here (VisualPreview,
 * VideoPreview, KeyframeWorkflow, ImageUpload, useImagePreview,
 * useVideoPreview) had no consumers outside this directory and was removed
 * 2026-08-10.
 */

export {
  generatePreview,
  generateVideoPreview,
  uploadPreviewImage,
  validatePreviewImageFile,
} from "./api/previewApi";
export type {
  GeneratePreviewRequest,
  GeneratePreviewResponse,
  GenerateVideoResponse,
  UploadPreviewImageResponse,
  PreviewProvider,
  PreviewSpeedMode,
} from "./api/previewApi";
