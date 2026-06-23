import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  MediaKind,
  MediaUrlRequest,
  MediaUrlResult,
} from "@/services/media/MediaUrlResolver";
import { resolveMediaUrl } from "@/services/media/MediaUrlResolver";
import { safeParseUrl } from "@/utils/storageUrl";

interface UseResolvedMediaUrlOptions {
  kind: MediaKind;
  url?: string | null;
  storagePath?: string | null;
  assetId?: string | null;
  enabled?: boolean;
  preferFresh?: boolean;
  deferUntilResolved?: boolean;
}

interface UseResolvedMediaUrlResult {
  url: string | null;
  expiresAt: string | null;
  loading: boolean;
  error: string | null;
  refresh: (reason?: string) => Promise<MediaUrlResult>;
}

const PREVIEW_ROUTE_PREFIX = "/api/preview/";
const VIDEO_CONTENT_ROUTE_PREFIX = "/api/preview/video/content/";

function shouldDeferRawPreviewUrl(rawUrl: string | null | undefined): boolean {
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    return false;
  }

  const parsed = safeParseUrl(rawUrl);
  if (!parsed) return false;

  const path = parsed.pathname;
  if (!path.startsWith(PREVIEW_ROUTE_PREFIX)) {
    return false;
  }

  if (
    path.startsWith(VIDEO_CONTENT_ROUTE_PREFIX) &&
    parsed.searchParams.has("token")
  ) {
    return false;
  }

  return true;
}

export function useResolvedMediaUrl({
  kind,
  url,
  storagePath,
  assetId,
  enabled = true,
  preferFresh = true,
  deferUntilResolved = false,
}: UseResolvedMediaUrlOptions): UseResolvedMediaUrlResult {
  const requestSignature = [
    kind,
    url ?? "",
    storagePath ?? "",
    assetId ?? "",
    preferFresh ? "fresh" : "stale",
  ].join("|");
  const immediateUrl = useMemo((): string | null => {
    if (deferUntilResolved && enabled) {
      return null;
    }
    return shouldDeferRawPreviewUrl(url) ? null : (url ?? null);
  }, [deferUntilResolved, enabled, url]);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(immediateUrl);
  const [resolvedSignature, setResolvedSignature] =
    useState<string>(requestSignature);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastRequestRef = useRef<MediaUrlRequest | null>(null);

  const refresh = useCallback(
    async (_reason?: string) => {
      const request: MediaUrlRequest = {
        kind,
        url: url ?? null,
        storagePath: storagePath ?? null,
        assetId: assetId ?? null,
        preferFresh,
      };
      lastRequestRef.current = request;
      setLoading(true);
      setError(null);
      try {
        const result = await resolveMediaUrl(request);
        if (lastRequestRef.current === request) {
          setResolvedUrl(result.url ?? null);
          setResolvedSignature(requestSignature);
          setExpiresAt(result.expiresAt ?? null);
        }
        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to resolve media URL";
        if (lastRequestRef.current === request) {
          setError(message);
        }
        return { url: url ?? null, source: "unknown" as const };
      } finally {
        if (lastRequestRef.current === request) {
          setLoading(false);
        }
      }
    },
    [assetId, kind, preferFresh, requestSignature, storagePath, url],
  );

  useEffect(() => {
    setResolvedUrl(immediateUrl);
    setResolvedSignature(requestSignature);
    setExpiresAt(null);
    setError(null);
  }, [assetId, immediateUrl, kind, requestSignature, storagePath, url]);

  useEffect(() => {
    if (!enabled) return;
    void refresh("init");
  }, [enabled, refresh]);

  return {
    url: resolvedSignature === requestSignature ? resolvedUrl : immediateUrl,
    expiresAt,
    loading,
    error,
    refresh,
  };
}

export default useResolvedMediaUrl;
