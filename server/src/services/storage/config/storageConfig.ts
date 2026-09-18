/**
 * Storage configuration for GCS
 */

import { resolveBucketName } from "@config/storageBucket";
import { SIGNED_URL_TTL_MS } from "@config/signedUrlPolicy";

/**
 * Resolved on first read, not at import.
 *
 * `resolveBucketName` throws when neither bucket env var is set, and this
 * module is imported transitively by route registration — so resolving at
 * module scope made merely *loading* the storage routes require bucket
 * config. Memoising here also keeps this the single resolution for the
 * process: the DI container reads `STORAGE_CONFIG.bucketName` rather than
 * calling `resolveBucketName` a second time, so the name the media proxy
 * validates against and the bucket it streams from cannot drift apart.
 */
let memoizedBucketName: string | null = null;

export const STORAGE_CONFIG = {
  get bucketName(): string {
    memoizedBucketName ??= resolveBucketName();
    return memoizedBucketName;
  },
  paths: {
    previewImage: "users/{userId}/previews/images/{timestamp}-{hash}.webp",
    // Vector (SVG) studio output lives in its own lane so the raster
    // preview-image type — and the first-frame gate derived from it — stays
    // raster-only (issue #118).
    previewVector: "users/{userId}/previews/vectors/{timestamp}-{hash}.svg",
    previewVideo: "users/{userId}/previews/videos/{timestamp}-{hash}.mp4",
    generation: "users/{userId}/generations/{timestamp}-{hash}.mp4",
  },
  urlExpiration: {
    upload: SIGNED_URL_TTL_MS.upload,
    view: SIGNED_URL_TTL_MS.view,
    download: SIGNED_URL_TTL_MS.download,
  },
  maxFileSize: {
    previewImage: 10 * 1024 * 1024,
    // SVG is text; even elaborate vector art stays well under this. A tight
    // cap also bounds the blast radius of a hostile upload.
    previewVector: 5 * 1024 * 1024,
    previewVideo: 500 * 1024 * 1024,
    generation: 2 * 1024 * 1024 * 1024,
  },
  allowedContentTypes: {
    previewImage: ["image/webp", "image/png", "image/jpeg"],
    previewVector: ["image/svg+xml"],
    previewVideo: ["video/mp4", "video/webm"],
    generation: ["video/mp4", "video/webm", "video/quicktime"],
  },
} as const;

export const STORAGE_TYPES = {
  PREVIEW_IMAGE: "preview-image",
  PREVIEW_VECTOR: "preview-vector",
  PREVIEW_VIDEO: "preview-video",
  GENERATION: "generation",
} as const;

export type StorageType = (typeof STORAGE_TYPES)[keyof typeof STORAGE_TYPES];

export const STORAGE_TYPE_KEYS: Record<
  StorageType,
  keyof typeof STORAGE_CONFIG.allowedContentTypes
> = {
  [STORAGE_TYPES.PREVIEW_IMAGE]: "previewImage",
  [STORAGE_TYPES.PREVIEW_VECTOR]: "previewVector",
  [STORAGE_TYPES.PREVIEW_VIDEO]: "previewVideo",
  [STORAGE_TYPES.GENERATION]: "generation",
};

export function resolveStorageTypeKey(
  type: StorageType,
): keyof typeof STORAGE_CONFIG.allowedContentTypes {
  return STORAGE_TYPE_KEYS[type] || "generation";
}

/** The one content type the vector lane accepts. */
export const VECTOR_IMAGE_CONTENT_TYPE = "image/svg+xml";

/**
 * Whether the studio can persist vector (SVG) output — the single source of
 * truth behind "no vector model is offered while its output cannot be stored"
 * (issue #118). Read here rather than restated so the picker gate cannot drift
 * from what storage will actually keep; the studio registry consumes it.
 */
export function canStoreVector(): boolean {
  return (
    STORAGE_CONFIG.allowedContentTypes.previewVector as readonly string[]
  ).includes(VECTOR_IMAGE_CONTENT_TYPE);
}

/**
 * Storage types whose stored bytes can execute script when a browser renders
 * them inline (an SVG can carry `<script>`/`onload`). Their view URLs are
 * served as attachments so a direct open downloads rather than renders — the
 * XSS defense for the user-content serving path (issue #118). `<img>` display
 * is unaffected: a subresource load ignores Content-Disposition and an SVG in
 * an `<img>` runs no script regardless.
 */
export function isScriptExecutableStorageType(
  type: StorageType | null,
): boolean {
  return type === STORAGE_TYPES.PREVIEW_VECTOR;
}

export default STORAGE_CONFIG;
