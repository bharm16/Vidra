import crypto from "node:crypto";
import type { StorageType } from "../config/storageConfig";

const DEFAULT_EXTENSIONS: Record<StorageType, string> = {
  "preview-image": "webp",
  "preview-video": "mp4",
  generation: "mp4",
};

const TYPE_SEGMENTS: Record<StorageType, string> = {
  "preview-image": "previews/images",
  "preview-video": "previews/videos",
  generation: "generations",
};

export function generateStoragePath(
  userId: string,
  type: StorageType,
  extension?: string | null,
): string {
  const timestamp = Date.now();
  const hash = crypto.randomBytes(8).toString("hex");
  const resolvedExtension = (
    extension ||
    DEFAULT_EXTENSIONS[type] ||
    "mp4"
  ).replace(/^\.+/, "");
  return `users/${userId}/${TYPE_SEGMENTS[type]}/${timestamp}-${hash}.${resolvedExtension}`;
}

/**
 * Rebuild the canonical storage path for an already-persisted asset from its
 * basename ({timestamp}-{hash}.{ext}) — the id shape session records carry.
 */
export function storagePathForBasename(
  userId: string,
  type: StorageType,
  basename: string,
): string {
  return `users/${userId}/${TYPE_SEGMENTS[type]}/${basename}`;
}

const GCS_HOST = "storage.googleapis.com";
const GCS_HOST_SUFFIX = ".storage.googleapis.com";
const FIREBASE_STORAGE_HOST = "firebasestorage.googleapis.com";

/**
 * Resolve a GCS/Firebase Storage URL to its object path within the given
 * bucket, or null when the host or bucket doesn't match. Shared by the media
 * proxy and the generation intake's owned-URL refresh.
 */
export function extractObjectPathFromUrl(
  url: URL,
  bucketName: string,
): string | null {
  const host = url.hostname;
  const path = url.pathname.replace(/^\/+/, "");

  if (!path) return null;

  // storage.googleapis.com/{bucket}/{object}
  if (host === GCS_HOST) {
    const [bucket, ...rest] = path.split("/");
    if (bucket !== bucketName) return null;
    return rest.join("/") || null;
  }

  // {bucket}.storage.googleapis.com/{object}
  if (host.endsWith(GCS_HOST_SUFFIX)) {
    const bucketFromHost = host.slice(0, -GCS_HOST_SUFFIX.length);
    if (bucketFromHost !== bucketName) return null;
    return path;
  }

  // firebasestorage.googleapis.com/v0/b/{bucket}/o/{encodedObject}
  if (host === FIREBASE_STORAGE_HOST) {
    const match = path.match(/^v0\/b\/([^/]+)\/o\/(.+)/);
    if (!match) return null;
    const [, bucket, encodedObject] = match;
    // Firebase bucket names may have .appspot.com or .firebasestorage.app suffixes
    const baseBucket = (bucket ?? "").replace(
      /\.(appspot\.com|firebasestorage\.app)$/,
      "",
    );
    const baseName = bucketName.replace(
      /\.(appspot\.com|firebasestorage\.app)$/,
      "",
    );
    if (baseBucket !== baseName) return null;
    return decodeURIComponent(encodedObject ?? "");
  }

  return null;
}

export function extractUserIdFromPath(path: string): string | null {
  const match = path.match(/^users\/([^/]+)\//);
  return match?.[1] ?? null;
}

export function validatePathOwnership(path: string, userId: string): boolean {
  return extractUserIdFromPath(path) === userId;
}

export function getTypeFromPath(path: string): StorageType | null {
  if (path.includes("/previews/images/")) return "preview-image";
  if (path.includes("/previews/videos/")) return "preview-video";
  if (path.includes("/generations/")) return "generation";
  return null;
}
