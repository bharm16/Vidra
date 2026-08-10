/**
 * The forms a Google Cloud Storage object URL can take, in one place.
 *
 * Client and server both need to answer "which object does this URL name?",
 * but for different reasons — the client recognises storage URLs so it can
 * rewrite them through the media proxy, the server gates a pre-auth proxy on
 * the answer. Those policies stay where they belong; only the shape-parsing
 * is shared, because that is the part that was drifting: the client
 * recognised `storage.cloud.google.com` and the JSON-API download form while
 * the server did not, so a URL the client resolved happily came back 403.
 *
 * Pure by construction — no Node built-ins, no fetch, no `window`. Callers
 * that need to resolve a relative URL do so before calling in.
 */

const GCS_HOST = "storage.googleapis.com";
const GCS_CONSOLE_HOST = "storage.cloud.google.com";
const GCS_HOST_SUFFIX = ".storage.googleapis.com";
const FIREBASE_STORAGE_HOST = "firebasestorage.googleapis.com";

/**
 * One Firebase bucket answers to both spellings, so they must compare equal.
 */
const FIREBASE_BUCKET_SUFFIXES = [
  ".appspot.com",
  ".firebasestorage.app",
] as const;

export interface GcsObjectRef {
  bucket: string;
  objectPath: string;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function pathSegments(pathname: string): string[] {
  return pathname.split("/").filter((segment) => segment.length > 0);
}

/** Read the `{bucket}/o/{object}` tail shared by every JSON-API style path. */
function readBucketAndObject(segments: string[]): GcsObjectRef | null {
  const [bucket, marker, ...objectSegments] = segments;
  if (!bucket || marker !== "o" || objectSegments.length === 0) {
    return null;
  }
  const objectPath = safeDecode(objectSegments.join("/"));
  return objectPath ? { bucket, objectPath } : null;
}

/**
 * The `/b/{bucket}/o/{object}` layouts: Firebase's `v0` surface and the GCS
 * JSON API's download surface.
 */
function readApiStylePath(segments: string[]): GcsObjectRef | null {
  if (segments[0] === "v0" && segments[1] === "b") {
    return readBucketAndObject(segments.slice(2));
  }
  if (
    segments[0] === "download" &&
    segments[1] === "storage" &&
    segments[2] === "v1" &&
    segments[3] === "b"
  ) {
    return readBucketAndObject(segments.slice(4));
  }
  if (
    segments[0] === "storage" &&
    segments[1] === "v1" &&
    segments[2] === "b"
  ) {
    return readBucketAndObject(segments.slice(3));
  }
  return null;
}

function toUrl(value: string | URL): URL | null {
  if (value instanceof URL) {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return new URL(trimmed);
  } catch {
    return null;
  }
}

/**
 * Resolve a storage URL to the bucket and object it names, or null when the
 * URL is not a storage URL at all. Applies no bucket policy — callers decide
 * whether the bucket it names is one they will serve.
 */
export function parseGcsObjectUrl(value: string | URL): GcsObjectRef | null {
  const url = toUrl(value);
  if (!url) {
    return null;
  }

  // gs://{bucket}/{object} — the bucket parses as the host.
  if (url.protocol === "gs:") {
    const objectPath = safeDecode(pathSegments(url.pathname).join("/"));
    return url.hostname && objectPath
      ? { bucket: url.hostname, objectPath }
      : null;
  }

  const segments = pathSegments(url.pathname);
  if (segments.length === 0) {
    return null;
  }
  const host = url.hostname.toLowerCase();

  if (host === FIREBASE_STORAGE_HOST) {
    return readApiStylePath(segments);
  }

  if (host === GCS_HOST || host === GCS_CONSOLE_HOST) {
    const apiStyle = readApiStylePath(segments);
    if (apiStyle) {
      return apiStyle;
    }
    // {host}/{bucket}/{object}
    const [bucket, ...objectSegments] = segments;
    const objectPath = safeDecode(objectSegments.join("/"));
    return bucket && objectPath ? { bucket, objectPath } : null;
  }

  // {bucket}.storage.googleapis.com/{object}
  if (host.endsWith(GCS_HOST_SUFFIX)) {
    const bucket = host.slice(0, -GCS_HOST_SUFFIX.length);
    const objectPath = safeDecode(segments.join("/"));
    return bucket && objectPath ? { bucket, objectPath } : null;
  }

  return null;
}

/** Strip the interchangeable Firebase suffixes so one bucket has one identity. */
export function normalizeBucketName(bucket: string): string {
  const normalized = bucket.trim().toLowerCase();
  for (const suffix of FIREBASE_BUCKET_SUFFIXES) {
    if (normalized.endsWith(suffix)) {
      return normalized.slice(0, -suffix.length);
    }
  }
  return normalized;
}

/** True when both names identify the same bucket. Empty names never match. */
export function bucketNamesMatch(a: string, b: string): boolean {
  const left = normalizeBucketName(a);
  return left.length > 0 && left === normalizeBucketName(b);
}
