import React, { useMemo, useState } from "react";
import { useResolvedMediaUrl } from "@/hooks/useResolvedMediaUrl";
import {
  extractStorageObjectPath,
  extractVideoContentAssetId,
} from "@/utils/storageUrl";
import type { GalleryGeneration } from "./types";

interface GalleryThumbnailProps {
  generation: GalleryGeneration;
  isActive: boolean;
  onClick: () => void;
}

export function GalleryThumbnail({
  generation,
  isActive,
  onClick,
}: GalleryThumbnailProps): React.ReactElement {
  const [videoLoadFailed, setVideoLoadFailed] = useState(false);
  const flyoutTitle = useMemo(() => {
    const trimmed = generation.prompt.trim();
    if (trimmed.length === 0) return "Untitled generation";
    return trimmed.length > 52 ? `${trimmed.slice(0, 52)}...` : trimmed;
  }, [generation.prompt]);
  const flyoutMeta = useMemo(() => {
    const formattedDate = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(new Date(generation.createdAt));
    return `${generation.model} • ${formattedDate}`;
  }, [generation.createdAt, generation.model]);
  const rawThumbnailUrl = useMemo(() => {
    if (typeof generation.thumbnailUrl !== "string") return null;
    const trimmed = generation.thumbnailUrl.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, [generation.thumbnailUrl]);
  const rawMediaUrl = useMemo(() => {
    if (typeof generation.mediaUrl !== "string") return null;
    const trimmed = generation.mediaUrl.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, [generation.mediaUrl]);

  const thumbnailStoragePath = useMemo(
    () => (rawThumbnailUrl ? extractStorageObjectPath(rawThumbnailUrl) : null),
    [rawThumbnailUrl],
  );
  const thumbnailAssetId = generation.thumbnailAssetId ?? null;
  const { url: resolvedThumbnailUrl } = useResolvedMediaUrl({
    kind: "image",
    url: rawThumbnailUrl,
    storagePath: thumbnailStoragePath,
    assetId: thumbnailAssetId,
    deferUntilResolved: true,
    enabled: Boolean(rawThumbnailUrl || thumbnailAssetId),
  });

  const videoStoragePath = useMemo(
    () => (rawMediaUrl ? extractStorageObjectPath(rawMediaUrl) : null),
    [rawMediaUrl],
  );
  const videoAssetId = useMemo(
    () =>
      generation.mediaAssetId ??
      (rawMediaUrl && !videoStoragePath
        ? extractVideoContentAssetId(rawMediaUrl)
        : null),
    [generation.mediaAssetId, rawMediaUrl, videoStoragePath],
  );
  const { url: resolvedVideoUrl } = useResolvedMediaUrl({
    kind: "video",
    url: rawMediaUrl,
    storagePath: videoStoragePath,
    assetId: videoAssetId,
    deferUntilResolved: true,
    enabled:
      generation.mediaType === "video" &&
      Boolean(rawMediaUrl || videoStoragePath || videoAssetId),
  });

  const showVideoFallback =
    generation.mediaType === "video" &&
    !resolvedThumbnailUrl &&
    Boolean(resolvedVideoUrl) &&
    !videoLoadFailed;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group pointer-events-auto relative aspect-square h-[100px] w-[100px] flex-shrink-0 snap-start overflow-visible rounded-md bg-neutral-600 transition-[transform,box-shadow,opacity] duration-[180ms] [transition-timing-function:var(--motion-ease-emphasized)] ${
        isActive
          ? "scale-[1.03] opacity-100 shadow-[inset_0_0_0_2px_rgb(0,0,0),0_0_0_2px_rgb(255,255,255)]"
          : "opacity-85 shadow-none hover:scale-[1.03] hover:opacity-100"
      }`}
      aria-label="Open generation details"
      data-testid={`gallery-thumbnail-${generation.id}`}
    >
      <div className="h-full w-full overflow-hidden rounded-md">
        {resolvedThumbnailUrl ? (
          <img
            src={resolvedThumbnailUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-[180ms] [transition-timing-function:var(--motion-ease-emphasized)] group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : showVideoFallback ? (
          <video
            src={resolvedVideoUrl ?? undefined}
            className="h-full w-full object-cover transition-transform duration-[180ms] [transition-timing-function:var(--motion-ease-emphasized)] group-hover:scale-[1.03]"
            muted
            playsInline
            loop
            autoPlay
            preload="metadata"
            onError={() => setVideoLoadFailed(true)}
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-neutral-800 to-neutral-900" />
        )}
      </div>

      <div className="pointer-events-none absolute right-[calc(100%+10px)] top-1/2 z-20 w-[220px] -translate-y-1/2 translate-x-1 rounded-md border border-surface-2 bg-tool-surface-deep/95 px-3 py-2 opacity-0 shadow-[0_8px_30px_rgba(0,0,0,0.35)] transition-all duration-200 ease-out group-hover:translate-x-0 group-hover:opacity-100">
        <p className="truncate text-meta font-medium text-foreground">
          {flyoutTitle}
        </p>
        <p className="mt-0.5 text-meta text-tool-text-dim">{flyoutMeta}</p>
      </div>
    </button>
  );
}
