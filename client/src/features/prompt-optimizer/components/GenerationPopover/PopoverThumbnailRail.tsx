import React, { useMemo, useState } from "react";
import { useResolvedMediaUrl } from "@/hooks/useResolvedMediaUrl";
import {
  extractStorageObjectPath,
  extractVideoContentAssetId,
} from "@/utils/storageUrl";
import type { GalleryGeneration } from "@/features/prompt-optimizer/components/GalleryPanel";
import type { PopoverThumbnailRailProps } from "./types";

interface PopoverRailThumbnailProps {
  generation: GalleryGeneration;
  isSelected: boolean;
  onClick: () => void;
}

function PopoverRailThumbnail({
  generation,
  isSelected,
  onClick,
}: PopoverRailThumbnailProps): React.ReactElement {
  const [videoLoadFailed, setVideoLoadFailed] = useState(false);
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

  const imageCandidateUrl = useMemo(() => {
    if (generation.mediaType === "video") return rawThumbnailUrl;
    return rawThumbnailUrl ?? rawMediaUrl;
  }, [generation.mediaType, rawMediaUrl, rawThumbnailUrl]);
  const imageStoragePath = useMemo(
    () =>
      imageCandidateUrl ? extractStorageObjectPath(imageCandidateUrl) : null,
    [imageCandidateUrl],
  );
  const imageAssetId = generation.thumbnailAssetId ?? null;
  const { url: resolvedThumbnailUrl } = useResolvedMediaUrl({
    kind: "image",
    url: imageCandidateUrl,
    storagePath: imageStoragePath,
    assetId: imageAssetId,
    deferUntilResolved: true,
    enabled: Boolean(imageCandidateUrl || imageAssetId),
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
      className={`relative h-[70px] w-full flex-shrink-0 overflow-hidden rounded-md border-[2.5px] transition-opacity ${
        isSelected
          ? "border-tool-accent-neutral opacity-100"
          : "border-transparent opacity-50 hover:opacity-80"
      }`}
      aria-label="Change active generation"
      data-testid={`popover-rail-${generation.id}`}
    >
      {resolvedThumbnailUrl ? (
        <img
          src={resolvedThumbnailUrl}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : showVideoFallback ? (
        <video
          src={resolvedVideoUrl ?? undefined}
          className="h-full w-full object-cover"
          muted
          playsInline
          loop
          autoPlay
          preload="metadata"
          onError={() => setVideoLoadFailed(true)}
        />
      ) : (
        <div className="h-full w-full bg-gradient-to-br from-tool-rail-border to-tool-surface-deep" />
      )}
    </button>
  );
}

export function PopoverThumbnailRail({
  generations,
  activeId,
  onChange,
}: PopoverThumbnailRailProps): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col gap-2 overflow-auto px-3 pb-3 pt-3.5">
      {generations.map((generation) => (
        <PopoverRailThumbnail
          key={generation.id}
          generation={generation}
          isSelected={generation.id === activeId}
          onClick={() => onChange(generation.id)}
        />
      ))}
    </div>
  );
}
