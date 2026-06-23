import { storageApi } from "@/api/storageApi";
import {
  getImageAssetViewUrl,
  getVideoAssetViewUrl,
} from "@/features/preview/api/previewApi";
import {
  extractStorageObjectPath,
  extractVideoContentAssetId,
  hasGcsSignedUrlParams,
  parseGcsSignedUrlExpiryMs,
  safeParseUrl,
} from "@/utils/storageUrl";
import { logger } from "@/services/LoggingService";

export type MediaKind = "image" | "video";

export interface MediaUrlRequest {
  kind: MediaKind;
  url?: string | null;
  storagePath?: string | null;
  assetId?: string | null;
  preferFresh?: boolean;
}

export interface MediaUrlResult {
  url: string | null;
  expiresAt?: string | null;
  storagePath?: string | null;
  assetId?: string | null;
  source: "storage" | "preview" | "content" | "raw" | "unknown";
}

const log = logger.child("MediaUrlResolver");
const inflight = new Map<string, Promise<MediaUrlResult>>();
const cache = new Map<
  string,
  { result: MediaUrlResult; expiresAtMs: number | null; cachedAt: number }
>();

const CACHE_TTL_MS = 30_000;
/** Negative results (null URL / not-found) are cached longer to prevent retry storms. */
const NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000;
const EXPIRY_SAFETY_WINDOW_MS = 2 * 60 * 1000;
const PREVIEW_ROUTE_PREFIX = "/api/preview/";
const VIDEO_CONTENT_ROUTE_PREFIX = "/api/preview/video/content/";
const MEDIA_PROXY_PATH = "/api/storage/proxy";

const isFirebaseStorageUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url, "https://placeholder.invalid");
    return parsed.hostname === "firebasestorage.googleapis.com";
  } catch {
    return false;
  }
};

/**
 * Rewrite GCS/Firebase Storage URLs to go through the app-origin media proxy.
 * This avoids ORB (Opaque Response Blocking) failures when COEP is set to
 * 'credentialless' and the remote storage lacks CORS headers.
 */
export const rewriteGcsUrlToProxy = (url: string | null): string | null => {
  if (!url) return null;
  if (url.includes(MEDIA_PROXY_PATH)) return url;
  if (hasGcsSignedUrlParams(url) || isFirebaseStorageUrl(url)) {
    return `${MEDIA_PROXY_PATH}?url=${encodeURIComponent(url)}`;
  }
  return url;
};

const getErrorStatus = (error: unknown): number | null => {
  if (!error || typeof error !== "object") return null;
  const maybeStatus = (error as { status?: unknown }).status;
  return typeof maybeStatus === "number" && Number.isFinite(maybeStatus)
    ? maybeStatus
    : null;
};

const isTransientApiFailure = (error: unknown): boolean => {
  const status = getErrorStatus(error);
  if (status === 429) return true;
  if (status !== null && status >= 500 && status <= 599) return true;
  return false;
};

const isBlockedRawPreviewUrl = (rawUrl: string | null | undefined): boolean => {
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) return false;
  const parsed = safeParseUrl(rawUrl);
  if (!parsed) return false;
  const path = parsed.pathname;
  if (!path.startsWith(PREVIEW_ROUTE_PREFIX)) return false;
  if (
    path.startsWith(VIDEO_CONTENT_ROUTE_PREFIX) &&
    parsed.searchParams.has("token")
  ) {
    return false;
  }
  return true;
};

const pickSafeFallbackUrl = (fallbackUrl: string | null): string | null => {
  if (!fallbackUrl) return null;
  return isBlockedRawPreviewUrl(fallbackUrl) ? null : fallbackUrl;
};

const toExpiresAtMs = (value?: string | number | null): number | null => {
  if (value == null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value < 1e12 ? value * 1000 : value;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isFreshCache = (entry: {
  result: MediaUrlResult;
  expiresAtMs: number | null;
  cachedAt: number;
}): boolean => {
  // Negative results (asset not found) use a longer TTL to prevent retry storms
  if (!entry.result.url) {
    return Date.now() < entry.cachedAt + NEGATIVE_CACHE_TTL_MS;
  }
  if (entry.expiresAtMs) {
    return Date.now() < entry.expiresAtMs - EXPIRY_SAFETY_WINDOW_MS;
  }
  return Date.now() < entry.cachedAt + CACHE_TTL_MS;
};

const buildCacheKey = (req: MediaUrlRequest): string => {
  if (req.storagePath) return `${req.kind}|storage|${req.storagePath}`;
  if (req.assetId) return `${req.kind}|asset|${req.assetId}`;
  if (req.url) return `${req.kind}|url|${req.url}`;
  return `${req.kind}|unknown`;
};

const withFallbackUrl = (
  result: MediaUrlResult,
  fallbackUrl: string | null,
): MediaUrlResult =>
  result.url ? result : { ...result, url: pickSafeFallbackUrl(fallbackUrl) };

const resolveViaStoragePath = async (
  storagePath: string,
): Promise<MediaUrlResult> => {
  const data = (await storageApi.getViewUrl(storagePath)) as {
    viewUrl?: string;
    expiresAt?: string;
    storagePath?: string;
  };
  if (!data?.viewUrl) {
    return { url: null, storagePath, source: "storage" };
  }
  return {
    url: data.viewUrl,
    expiresAt: data.expiresAt ?? null,
    storagePath: data.storagePath ?? storagePath,
    source: "storage",
  };
};

const resolveViaAssetId = async (
  assetId: string,
  kind: MediaKind,
): Promise<MediaUrlResult> => {
  const response =
    kind === "video"
      ? await getVideoAssetViewUrl(assetId)
      : await getImageAssetViewUrl(assetId);
  if (!response.success) {
    return { url: null, assetId, source: "preview" };
  }
  const data = response.data;
  return {
    url: data?.viewUrl ?? null,
    expiresAt:
      (data as { expiresAt?: string; viewUrlExpiresAt?: string } | undefined)
        ?.expiresAt ??
      (data as { viewUrlExpiresAt?: string } | undefined)?.viewUrlExpiresAt ??
      null,
    storagePath:
      (data as { storagePath?: string } | undefined)?.storagePath ?? null,
    assetId,
    source: "preview",
  };
};

const resolveFromUrl = async (
  url: string,
  kind: MediaKind,
  preferFresh: boolean,
): Promise<MediaUrlResult> => {
  const trimmed = url.trim();
  if (!trimmed) {
    return { url: null, source: "unknown" };
  }

  if (hasGcsSignedUrlParams(trimmed)) {
    const expiresAtMs = parseGcsSignedUrlExpiryMs(trimmed);
    const isExpired =
      expiresAtMs !== null &&
      Date.now() >= expiresAtMs - EXPIRY_SAFETY_WINDOW_MS;
    if (!isExpired && !preferFresh) {
      return {
        url: trimmed,
        expiresAt: expiresAtMs ? new Date(expiresAtMs).toISOString() : null,
        source: "raw",
      };
    }
    if (!isExpired && preferFresh === false) {
      return { url: trimmed, source: "raw" };
    }
    if (!isExpired && preferFresh === true) {
      // keep going to refresh if requested
    } else if (!isExpired) {
      return {
        url: trimmed,
        expiresAt: expiresAtMs ? new Date(expiresAtMs).toISOString() : null,
        source: "raw",
      };
    }
  }

  const objectPath = extractStorageObjectPath(trimmed);
  if (objectPath) {
    if (objectPath.startsWith("users/")) {
      const resolved = await resolveViaStoragePath(objectPath);
      if (resolved.url) return resolved;
      return resolved;
    }
    const assetId = objectPath.split("/").filter(Boolean).pop() ?? null;
    if (assetId) {
      const resolved = await resolveViaAssetId(assetId, kind);
      if (resolved.url) return resolved;
      if (isBlockedRawPreviewUrl(trimmed)) return resolved;
    }
  }

  const assetIdFromContent = extractVideoContentAssetId(trimmed);
  if (assetIdFromContent) {
    const resolved = await resolveViaAssetId(assetIdFromContent, "video");
    if (resolved.url) return resolved;
    if (isBlockedRawPreviewUrl(trimmed)) return resolved;
  }

  const safeFallback = pickSafeFallbackUrl(trimmed);
  if (!safeFallback) {
    return { url: null, source: "unknown" };
  }
  return { url: safeFallback, source: "raw" };
};

export async function resolveMediaUrl(
  req: MediaUrlRequest,
): Promise<MediaUrlResult> {
  const trimmedUrl = req.url?.trim?.() ?? null;
  const resolvedReq: MediaUrlRequest = {
    ...req,
    url: trimmedUrl || null,
    storagePath: req.storagePath?.trim?.() ?? null,
    assetId: req.assetId?.trim?.() ?? null,
    preferFresh: req.preferFresh ?? true,
  };

  const cacheKey = buildCacheKey(resolvedReq);
  const cached = cache.get(cacheKey);
  if (cached && isFreshCache(cached)) {
    return cached.result;
  }

  const existing = inflight.get(cacheKey);
  if (existing) {
    return await existing;
  }

  const task: Promise<MediaUrlResult> = (async (): Promise<MediaUrlResult> => {
    try {
      if (resolvedReq.storagePath) {
        const normalizedPath = resolvedReq.storagePath;
        if (normalizedPath.startsWith("users/")) {
          const result = await resolveViaStoragePath(normalizedPath);
          return withFallbackUrl(result, resolvedReq.url ?? null);
        }
        const assetId = normalizedPath.split("/").filter(Boolean).pop();
        if (assetId) {
          const result = await resolveViaAssetId(assetId, resolvedReq.kind);
          return withFallbackUrl(result, resolvedReq.url ?? null);
        }
      }

      if (resolvedReq.assetId) {
        const result = await resolveViaAssetId(
          resolvedReq.assetId,
          resolvedReq.kind,
        );
        return withFallbackUrl(result, resolvedReq.url ?? null);
      }

      if (resolvedReq.url) {
        return await resolveFromUrl(
          resolvedReq.url,
          resolvedReq.kind,
          resolvedReq.preferFresh ?? true,
        );
      }

      return { url: null, source: "unknown" };
    } catch (error) {
      if (isTransientApiFailure(error)) {
        throw error;
      }
      log.warn("Failed to resolve media URL", {
        kind: resolvedReq.kind,
        storagePath: resolvedReq.storagePath ?? null,
        assetId: resolvedReq.assetId ?? null,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        url: pickSafeFallbackUrl(resolvedReq.url ?? null),
        source: "unknown",
      };
    }
  })();

  inflight.set(cacheKey, task);
  try {
    const rawResult = await task;
    // Rewrite GCS signed URLs through the media proxy to avoid ORB failures
    const result: MediaUrlResult = {
      ...rawResult,
      url: rewriteGcsUrlToProxy(rawResult.url),
    };
    const expiresAtMs =
      toExpiresAtMs(result.expiresAt) ??
      (rawResult.url ? parseGcsSignedUrlExpiryMs(rawResult.url) : null);
    cache.set(cacheKey, { result, expiresAtMs, cachedAt: Date.now() });
    return result;
  } finally {
    inflight.delete(cacheKey);
  }
}

// ---------------------------------------------------------------------------
// Batch resolution for image assets (reduces N API calls to 1)
// ---------------------------------------------------------------------------

import { getImageAssetViewUrlBatch } from "@/features/preview/api/previewApi";

/** Maximum consecutive not-found results before the circuit opens. */
const CIRCUIT_BREAKER_THRESHOLD = 10;
/** How long the circuit stays open (ms). */
const CIRCUIT_BREAKER_RESET_MS = 2 * 60 * 1000;

let circuitNotFoundCount = 0;
let circuitOpenUntil = 0;

/** Returns true when too many consecutive 404s have been observed. */
export function isMediaCircuitOpen(): boolean {
  if (circuitOpenUntil > 0 && Date.now() < circuitOpenUntil) {
    return true;
  }
  if (circuitOpenUntil > 0 && Date.now() >= circuitOpenUntil) {
    // Half-open: reset and allow traffic
    circuitNotFoundCount = 0;
    circuitOpenUntil = 0;
  }
  return false;
}

/** Record a not-found result; opens circuit after threshold. */
function recordNotFound(): void {
  circuitNotFoundCount += 1;
  if (circuitNotFoundCount >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_RESET_MS;
    log.warn("Media circuit breaker opened", {
      threshold: CIRCUIT_BREAKER_THRESHOLD,
      resetMs: CIRCUIT_BREAKER_RESET_MS,
    });
  }
}

/** Record a successful resolution; resets the circuit counter. */
function recordSuccess(): void {
  circuitNotFoundCount = 0;
}

/**
 * Resolve multiple image asset IDs in a single batch request.
 * Results are cached in the shared MediaUrlResolver cache.
 *
 * Returns a Map from assetId to resolved URL (or null if not found).
 */
export async function resolveImageAssetBatch(
  assetIds: string[],
): Promise<Map<string, string | null>> {
  const resultMap = new Map<string, string | null>();
  if (assetIds.length === 0) return resultMap;

  // Check cache first, collect uncached IDs
  const uncached: string[] = [];
  for (const id of assetIds) {
    const cacheKey = `image|asset|${id}`;
    const entry = cache.get(cacheKey);
    if (entry && isFreshCache(entry)) {
      resultMap.set(id, entry.result.url);
    } else {
      uncached.push(id);
    }
  }

  if (uncached.length === 0) return resultMap;

  // Circuit breaker check
  if (isMediaCircuitOpen()) {
    for (const id of uncached) {
      resultMap.set(id, null);
    }
    return resultMap;
  }

  try {
    const response = await getImageAssetViewUrlBatch(uncached);
    if (response.success && response.data?.results) {
      let notFoundInBatch = 0;
      for (const item of response.data.results) {
        const cacheKey = `image|asset|${item.assetId}`;
        const result: MediaUrlResult = {
          url: item.viewUrl,
          assetId: item.assetId,
          source: "preview",
        };
        cache.set(cacheKey, {
          result,
          expiresAtMs: null,
          cachedAt: Date.now(),
        });
        resultMap.set(item.assetId, item.viewUrl);
        if (!item.viewUrl) {
          notFoundInBatch += 1;
        }
      }
      if (
        notFoundInBatch > 0 &&
        notFoundInBatch === response.data.results.length
      ) {
        // All items in batch were not found — increment circuit breaker
        for (let i = 0; i < notFoundInBatch; i++) {
          recordNotFound();
        }
      } else if (notFoundInBatch < response.data.results.length) {
        // At least some succeeded — reset circuit
        recordSuccess();
      }
    }
  } catch (error) {
    // Batch endpoint failed — don't cache, let individual resolution handle it
    log.warn(
      "Batch resolution failed, individual resolution will be used as fallback",
      {
        count: uncached.length,
        error: error instanceof Error ? error.message : String(error),
      },
    );
  }

  return resultMap;
}
