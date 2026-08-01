import type { VideoPreviewPayload } from "@routes/preview/videoRequest";
import {
  extractObjectPathFromUrl,
  validatePathOwnership,
} from "@services/storage/utils/pathUtils";

/**
 * Re-mint the requester's own signed GCS URLs in a generation payload.
 *
 * Session records persist signed media URLs (start frames, references) whose
 * signatures die after ~1h. A restored session's "Make it" would hand that
 * dead URL straight to a video provider, which fails when it fetches the
 * image — the client's keyframe-refresh loop narrows the window but the
 * server accepting stale input verbatim is the hole. Before the payload
 * flows to intake, every media URL that (a) is a signed URL on OUR bucket
 * and (b) lives under the requester's own users/{uid}/ namespace is swapped
 * for a freshly minted grant.
 *
 * Everything else passes through untouched: foreign hosts, unsigned URLs,
 * and paths the requester doesn't own (never mint a grant for someone
 * else's object). A mint failure also passes the original through —
 * behavior degrades to exactly what shipped before this seam existed.
 */

interface OwnedUrlRefreshStorage {
  getViewUrl: (
    userId: string,
    path: string,
  ) => Promise<{ viewUrl: string; expiresAt: string; storagePath: string }>;
}

interface RefreshLogger {
  warn: (message: string, meta?: Record<string, unknown>) => void;
}

interface RefreshContext {
  userId: string;
  bucketName: string;
  storageService: OwnedUrlRefreshStorage | null | undefined;
  log: RefreshLogger;
  requestId: string | undefined;
}

const refreshOwnedSignedUrl = async (
  url: string,
  { userId, bucketName, storageService, log, requestId }: RefreshContext,
): Promise<string> => {
  if (!storageService) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  // Only signed GCS URLs carry an expiring grant worth re-minting.
  if (!parsed.searchParams.has("X-Goog-Signature")) return url;

  const objectPath = extractObjectPathFromUrl(parsed, bucketName);
  if (!objectPath) return url;
  if (!validatePathOwnership(objectPath, userId)) return url;

  try {
    const { viewUrl } = await storageService.getViewUrl(userId, objectPath);
    return viewUrl;
  } catch (error) {
    log.warn("Owned media URL refresh failed; using the original", {
      requestId,
      objectPath,
      error: error instanceof Error ? error.message : String(error),
    });
    return url;
  }
};

export const refreshOwnedMediaUrls = async (
  payload: VideoPreviewPayload,
  context: RefreshContext,
): Promise<VideoPreviewPayload> => {
  const refreshed: VideoPreviewPayload = { ...payload };

  if (refreshed.startImage) {
    refreshed.startImage = await refreshOwnedSignedUrl(
      refreshed.startImage,
      context,
    );
  }
  if (refreshed.endImage) {
    refreshed.endImage = await refreshOwnedSignedUrl(
      refreshed.endImage,
      context,
    );
  }
  if (refreshed.inputReference) {
    refreshed.inputReference = await refreshOwnedSignedUrl(
      refreshed.inputReference,
      context,
    );
  }
  if (refreshed.extendVideoUrl) {
    refreshed.extendVideoUrl = await refreshOwnedSignedUrl(
      refreshed.extendVideoUrl,
      context,
    );
  }
  if (refreshed.referenceImages && refreshed.referenceImages.length > 0) {
    refreshed.referenceImages = await Promise.all(
      refreshed.referenceImages.map(async (reference) => ({
        ...reference,
        url: await refreshOwnedSignedUrl(reference.url, context),
      })),
    );
  }

  return refreshed;
};
