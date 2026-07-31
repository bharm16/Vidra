import type { PromptHistoryEntry } from "@features/prompt-optimizer";
import type { PromptVersionEntry } from "@features/prompt-optimizer/types/domain/prompt-session";
import {
  isLikelyVideoUrl,
  resolveTakePosterUrl,
} from "@features/workspace-shell/utils/takePosterUrl";

export interface HistoryThumbnailRef {
  url: string | null;
  storagePath?: string | null;
  assetId?: string | null;
}

/**
 * The still for a version's newest completed take, or null. Current-loop
 * sessions persist their pictures as generation records on the version
 * (ADR-0011 D4) and write no legacy `preview` — the cover must read the
 * records. A picture's own asset id re-signs to a still; a clip's only
 * asset is the clip itself, so its poster URL stands alone.
 */
function resolveGenerationCover(
  version: PromptVersionEntry | undefined,
): HistoryThumbnailRef | null {
  const generations = Array.isArray(version?.generations)
    ? version.generations
    : [];
  for (let i = generations.length - 1; i >= 0; i -= 1) {
    const generation = generations[i];
    if (!generation || generation.status !== "completed") continue;
    const poster = resolveTakePosterUrl(generation);
    // A corrupt record can carry an mp4 where a still belongs even on a
    // picture take — a video URL never reaches an <img src>.
    if (!poster || isLikelyVideoUrl(poster)) continue;
    const assetId =
      generation.mediaType === "image"
        ? (generation.mediaAssetIds?.[0] ?? null)
        : null;
    return { url: poster, storagePath: null, assetId };
  }
  return null;
}

export function resolveHistoryThumbnail(
  entry: PromptHistoryEntry,
): HistoryThumbnailRef {
  const versions = Array.isArray(entry.versions) ? entry.versions : [];
  for (let i = versions.length - 1; i >= 0; i -= 1) {
    const preview = versions[i]?.preview;
    const candidate = preview?.imageUrl;
    // Legacy records wrote the clip's own mp4 where a still belongs; a video
    // URL in an <img src> renders a broken cover, so those previews are
    // treated as absent (the whole record — its storagePath is the same mp4).
    if (
      typeof candidate === "string" &&
      candidate.trim() &&
      isLikelyVideoUrl(candidate)
    ) {
      // The corrupt preview is absent, but the version's persisted takes may
      // still hold a real still.
      const rescuedCover = resolveGenerationCover(versions[i]);
      if (rescuedCover) {
        return rescuedCover;
      }
      continue;
    }
    // A video storagePath can never re-sign into a still: legacy records
    // wrote the clip's own mp4 (and its asset id) where the preview's
    // identifiers belong, and MediaUrlResolver prefers storagePath — so it
    // minted a fresh signed VIDEO url for the card's <img>. Only the image
    // url (rescuable via the media proxy) survives such records.
    const recordPointsAtVideo =
      typeof preview?.storagePath === "string" &&
      isLikelyVideoUrl(preview.storagePath);
    const storagePath = recordPointsAtVideo
      ? null
      : (preview?.storagePath ?? null);
    const assetId = recordPointsAtVideo ? null : (preview?.assetId ?? null);
    if (typeof candidate === "string" && candidate.trim()) {
      return { url: candidate, storagePath, assetId };
    }
    if (storagePath || assetId) {
      return { url: null, storagePath, assetId };
    }
    // No usable legacy preview on this version — read its persisted takes.
    const generationCover = resolveGenerationCover(versions[i]);
    if (generationCover) {
      return generationCover;
    }
  }
  return { url: null };
}

export function hasVideoArtifact(entry: PromptHistoryEntry): boolean {
  const versions = Array.isArray(entry.versions) ? entry.versions : [];
  return versions.some((version) => {
    const url = version?.video?.videoUrl;
    return typeof url === "string" && url.trim().length > 0;
  });
}

export function isRecentEntry(
  entry: PromptHistoryEntry,
  days: number = 7,
): boolean {
  if (!entry.timestamp) return false;

  // Handle both ISO-8601 strings and numeric-string timestamps (legacy data).
  let ms = Date.parse(entry.timestamp);
  if (Number.isNaN(ms)) {
    // Fallback: try parsing as a numeric string (milliseconds since epoch).
    const numeric = Number(entry.timestamp);
    if (!Number.isFinite(numeric) || numeric <= 0) return false;
    // Disambiguate seconds vs milliseconds — timestamps below 1e12 are seconds.
    ms = numeric < 1e12 ? numeric * 1000 : numeric;
  }

  const diffMs = Date.now() - ms;
  return diffMs >= 0 && diffMs <= days * 24 * 60 * 60 * 1000;
}
