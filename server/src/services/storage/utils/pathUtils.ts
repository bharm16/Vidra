import crypto from "node:crypto";
import {
  bucketNamesMatch,
  parseGcsObjectUrl,
} from "@shared/utils/gcsObjectUrl";
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

/**
 * Resolve a GCS/Firebase Storage URL to its object path within the given
 * bucket, or null when the URL names a different bucket (or no object at
 * all). Shared by the media proxy and the generation intake's owned-URL
 * refresh — both of which treat a null as "not ours, refuse".
 */
export function extractObjectPathFromUrl(
  url: URL,
  bucketName: string,
): string | null {
  const ref = parseGcsObjectUrl(url);
  if (!ref || !bucketNamesMatch(ref.bucket, bucketName)) {
    return null;
  }
  return ref.objectPath;
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
