import { parseGcsObjectUrl } from "@shared/utils/gcsObjectUrl";

const VIDEO_CONTENT_PREFIX = "/api/preview/video/content/";

export function safeParseUrl(rawUrl: string): URL | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed);
  } catch {
    if (typeof window === "undefined") return null;
    try {
      return new URL(trimmed, window.location.origin);
    } catch {
      return null;
    }
  }
}

/**
 * Resolve a media URL to the storage object it names, for any bucket.
 *
 * The app-local video-content route is handled here because it is app
 * routing, not storage addressing; every genuine storage URL shape is
 * parsed by the shared parser both tiers use.
 */
export function extractStorageObjectPath(rawUrl: string): string | null {
  const url = safeParseUrl(rawUrl);
  if (!url) return null;

  const localPreviewPath = url.pathname;
  if (localPreviewPath.includes(VIDEO_CONTENT_PREFIX)) {
    const relative = localPreviewPath.split(VIDEO_CONTENT_PREFIX)[1] || "";
    const decodedRelative = decodeURIComponent(relative);
    if (decodedRelative.startsWith("users/")) {
      return decodedRelative;
    }
  }

  return parseGcsObjectUrl(url)?.objectPath ?? null;
}

export function extractVideoContentAssetId(rawUrl: string): string | null {
  const url = safeParseUrl(rawUrl);
  if (!url) return null;
  const path = url.pathname;
  if (!path.includes(VIDEO_CONTENT_PREFIX)) {
    return null;
  }
  const relative = path.split(VIDEO_CONTENT_PREFIX)[1] || "";
  const assetId = relative.split("/")[0]?.trim() || "";
  return assetId || null;
}

export function hasGcsSignedUrlParams(rawUrl: string): boolean {
  const url = safeParseUrl(rawUrl);
  if (!url) return false;
  return (
    url.searchParams.has("X-Goog-Algorithm") ||
    url.searchParams.has("X-Goog-Signature") ||
    url.searchParams.has("X-Goog-Expires") ||
    url.searchParams.has("GoogleAccessId") ||
    url.searchParams.has("Signature") ||
    url.searchParams.has("Expires")
  );
}

export function parseGcsSignedUrlExpiryMs(rawUrl: string): number | null {
  const url = safeParseUrl(rawUrl);
  if (!url) return null;
  const v4Date = url.searchParams.get("X-Goog-Date");
  const v4Expires = url.searchParams.get("X-Goog-Expires");
  if (v4Date && v4Expires) {
    if (!/^\d{8}T\d{6}Z$/.test(v4Date)) return null;
    const year = Number(v4Date.slice(0, 4));
    const month = Number(v4Date.slice(4, 6));
    const day = Number(v4Date.slice(6, 8));
    const hour = Number(v4Date.slice(9, 11));
    const minute = Number(v4Date.slice(11, 13));
    const second = Number(v4Date.slice(13, 15));
    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      !Number.isFinite(day) ||
      !Number.isFinite(hour) ||
      !Number.isFinite(minute) ||
      !Number.isFinite(second)
    ) {
      return null;
    }
    const expiresSeconds = Number.parseInt(v4Expires, 10);
    if (!Number.isFinite(expiresSeconds)) return null;
    const baseMs = Date.UTC(year, month - 1, day, hour, minute, second);
    if (!Number.isFinite(baseMs)) return null;
    return baseMs + expiresSeconds * 1000;
  }

  const v2Expires = url.searchParams.get("Expires");
  if (v2Expires) {
    const expiresSeconds = Number.parseInt(v2Expires, 10);
    if (!Number.isFinite(expiresSeconds)) return null;
    return expiresSeconds * 1000;
  }

  return null;
}
