/**
 * The still that stands in for a take — the one answer to "what image do I show
 * for this generation?", used by the gallery, the space's lineage nodes, the
 * canvas tiles, and Continue Scene's start-frame seed.
 *
 * It exists as a module because the rule it carries kept getting lost: a clip's
 * own media URL is never its still. Handing an `.mp4` to an `<img src>` renders
 * a broken tile, and handing one to `setStartFrame` seeds a video where a first
 * frame belongs. Every surface that needs a poster asks here, so the guard
 * cannot be skipped by writing `thumbnailUrl ?? mediaUrls[0]` one more time.
 */

/**
 * The media facts a poster is resolved from. Structural on purpose: the live
 * `Generation` record, a persisted generation bag read off a session version,
 * and the space's source generations all satisfy it without this module
 * coupling to any one of them.
 */
export interface TakePosterSource {
  mediaType?: string | null | undefined;
  status?: string | null | undefined;
  thumbnailUrl?: string | null | undefined;
  mediaUrls?: ReadonlyArray<string | null | undefined> | null | undefined;
}

/**
 * True when a URL (or storage path) points at video media. Exported so
 * poster consumers that read persisted preview fields directly (e.g. the
 * Library) can reject legacy records where a video URL was written where a
 * still belongs.
 */
export const isLikelyVideoUrl = (url: string): boolean => {
  let value = url.toLowerCase();
  // Storage-proxy URLs carry the real object URL percent-encoded in a query
  // param, hiding the media extension from a plain scan — decode so a
  // proxied .mp4 is still recognized as video.
  try {
    value = decodeURIComponent(value);
  } catch {
    // Malformed escapes: scan the raw string.
  }
  if (value.includes("/api/preview/video/content/")) {
    return true;
  }
  return /\.(mp4|webm|mov|m3u8)(\?|#|$|&)/.test(value);
};

const normalizeNonEmpty = (value: string | null | undefined): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

/**
 * Resolve the still for a take, or null when it has none yet.
 *
 * For a clip the still must be a separate image — its own `mediaUrls[0]` is the
 * video and is never returned. For a picture the media URL *is* the still, so
 * the usual `thumbnailUrl ?? mediaUrls[0]` fallback applies.
 *
 * `versionPreviewImageUrl` is the prompt version's preview image, offered as a
 * last resort by callers that have one; it is only used once the take has
 * completed, so an in-flight take never borrows an unrelated still.
 */
export function resolveTakePosterUrl(
  take: TakePosterSource,
  versionPreviewImageUrl?: string | null,
): string | null {
  const isCompletedTake = take.status === "completed";
  const normalizedThumbnail = normalizeNonEmpty(take.thumbnailUrl);
  const normalizedVersionPreview = normalizeNonEmpty(versionPreviewImageUrl);

  if (take.mediaType === "video") {
    if (normalizedThumbnail && !isLikelyVideoUrl(normalizedThumbnail)) {
      return normalizedThumbnail;
    }
    if (
      isCompletedTake &&
      normalizedVersionPreview &&
      !isLikelyVideoUrl(normalizedVersionPreview)
    ) {
      return normalizedVersionPreview;
    }
    return null;
  }

  if (normalizedThumbnail) {
    return normalizedThumbnail;
  }

  const firstMediaUrl = normalizeNonEmpty(take.mediaUrls?.[0]);
  if (firstMediaUrl) {
    return firstMediaUrl;
  }

  if (isCompletedTake && normalizedVersionPreview) {
    return normalizedVersionPreview;
  }

  return null;
}
