import React, { useMemo, useRef, useState } from "react";
import { useResolvedMediaUrl } from "@/hooks/useResolvedMediaUrl";
import {
  extractStorageObjectPath,
  extractVideoContentAssetId,
} from "@/utils/storageUrl";
import type { PopoverPreviewProps } from "./types";

const iconClassName = "h-4 w-4";

function IconBack(): React.ReactElement {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      className={iconClassName}
    >
      <path
        d="M10.5 3.5L6 8l4.5 4.5"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconHeart({ filled }: { filled: boolean }): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" className={iconClassName}>
      <path
        d="M8 13.4l-1-.9C4 9.8 2.2 8.2 2.2 5.9c0-1.7 1.3-2.9 2.9-2.9 1 0 1.9.5 2.4 1.3A3 3 0 0 1 9.9 3c1.7 0 2.9 1.3 2.9 2.9 0 2.3-1.8 3.9-4.8 6.6l-1 .9Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconDownload(): React.ReactElement {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      className={iconClassName}
    >
      <path
        d="M8 2.5v7.3M5.3 7.5 8 10.2l2.7-2.7"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 11.3v1.2A1.5 1.5 0 0 0 4.5 14h7A1.5 1.5 0 0 0 13 12.5v-1.2"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconShare(): React.ReactElement {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      className={iconClassName}
    >
      <path
        d="M10.8 2.8a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Zm-5.6 4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Zm5.6 4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Z"
        strokeWidth="1.1"
      />
      <path
        d="m6.6 8.4 2.8-1.4M6.6 9.6l2.8 1.4"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconExtend(): React.ReactElement {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      className={iconClassName}
    >
      <path d="M8 3v10M3 8h10" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconModify(): React.ReactElement {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      className={iconClassName}
    >
      <path
        d="m11.8 2.8 1.4 1.4-7.3 7.3-2.2.8.8-2.2 7.3-7.3Z"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCopy(): React.ReactElement {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      className={iconClassName}
    >
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" strokeWidth="1.1" />
      <path
        d="M10 5.5V3.8A1.8 1.8 0 0 0 8.2 2H3.8A1.8 1.8 0 0 0 2 3.8v4.4A1.8 1.8 0 0 0 3.8 10H5.5"
        strokeWidth="1.1"
      />
    </svg>
  );
}

const parseAspectRatio = (value: string | undefined): string => {
  if (!value) return "16 / 9";
  const parts = value.split(":");
  if (parts.length !== 2) return "16 / 9";
  const left = Number.parseFloat(parts[0] ?? "");
  const right = Number.parseFloat(parts[1] ?? "");
  if (
    !Number.isFinite(left) ||
    !Number.isFinite(right) ||
    left <= 0 ||
    right <= 0
  ) {
    return "16 / 9";
  }
  return `${left} / ${right}`;
};

const normalizeUrl = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const copyText = async (text: string): Promise<void> => {
  if (typeof navigator === "undefined" || !navigator.clipboard) return;
  await navigator.clipboard.writeText(text);
};

const downloadUrl = (url: string): void => {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.download = "";
  anchor.click();
};

export function PopoverPreview({
  generation,
  onBack,
  onToggleFavorite,
}: PopoverPreviewProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const rawMediaUrl = useMemo(
    () => normalizeUrl(generation.mediaUrl),
    [generation.mediaUrl],
  );
  const rawThumbnailUrl = useMemo(
    () => normalizeUrl(generation.thumbnailUrl),
    [generation.thumbnailUrl],
  );
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
  const imageCandidateUrl = useMemo(() => {
    if (generation.mediaType === "video") {
      return rawThumbnailUrl;
    }
    return rawMediaUrl ?? rawThumbnailUrl;
  }, [generation.mediaType, rawMediaUrl, rawThumbnailUrl]);
  const imageStoragePath = useMemo(
    () =>
      imageCandidateUrl ? extractStorageObjectPath(imageCandidateUrl) : null,
    [imageCandidateUrl],
  );
  const imageAssetId = generation.thumbnailAssetId ?? null;
  const { url: resolvedImageUrl } = useResolvedMediaUrl({
    kind: "image",
    url: imageCandidateUrl,
    storagePath: imageStoragePath,
    assetId: imageAssetId,
    deferUntilResolved: true,
    enabled: Boolean(imageCandidateUrl || imageAssetId),
  });

  const previewUrl =
    generation.mediaType === "video"
      ? (resolvedVideoUrl ?? resolvedImageUrl)
      : resolvedImageUrl;
  const aspectRatio = useMemo(
    () => parseAspectRatio(generation.aspectRatio),
    [generation.aspectRatio],
  );
  const isVideo = generation.mediaType === "video" && Boolean(resolvedVideoUrl);

  const handleTogglePlayback = (): void => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      void videoRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch(() => {
          setIsPlaying(false);
        });
      return;
    }
    videoRef.current.pause();
    setIsPlaying(false);
  };

  const handleShare = async (): Promise<void> => {
    const url = previewUrl;
    if (!url) return;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ url });
        return;
      } catch {
        // Fall through to clipboard copy.
      }
    }
    await copyText(url);
  };

  return (
    <section className="relative flex min-h-0 flex-1 flex-col">
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex h-14 items-center px-6">
        <div className="pointer-events-auto">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[rgba(255,255,255,0.07)] text-white transition-colors hover:bg-[rgba(255,255,255,0.12)]"
            aria-label="Close generation detail"
          >
            <IconBack />
          </button>
        </div>
        <div className="flex-1" />
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleFavorite}
            className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[rgba(255,255,255,0.07)] text-white transition-colors hover:bg-[rgba(255,255,255,0.12)]"
            aria-label="Toggle favorite"
          >
            <IconHeart filled={generation.isFavorite} />
          </button>
          <button
            type="button"
            onClick={() => (previewUrl ? downloadUrl(previewUrl) : undefined)}
            className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[rgba(255,255,255,0.07)] text-white transition-colors hover:bg-[rgba(255,255,255,0.12)]"
            aria-label="Download"
          >
            <IconDownload />
          </button>
          <button
            type="button"
            onClick={() => {
              void handleShare();
            }}
            className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[rgba(255,255,255,0.07)] text-white transition-colors hover:bg-[rgba(255,255,255,0.12)]"
            aria-label="Share"
          >
            <IconShare />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center p-6 pb-20">
        <div className="relative w-full max-w-[560px]" style={{ aspectRatio }}>
          {previewUrl ? (
            isVideo ? (
              <div className="relative h-full w-full overflow-hidden rounded-lg bg-black">
                <video
                  ref={videoRef}
                  src={previewUrl}
                  className="h-full w-full object-cover"
                  loop
                  playsInline
                  muted
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
                {!isPlaying ? (
                  <button
                    type="button"
                    onClick={handleTogglePlayback}
                    className="absolute left-1/2 top-1/2 inline-flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[rgba(0,0,0,0.35)] text-white"
                    aria-label="Play video preview"
                  >
                    <svg viewBox="0 0 16 16" className="h-5 w-5 fill-current">
                      <path d="M5 3.5v9l7-4.5-7-4.5Z" />
                    </svg>
                  </button>
                ) : null}
              </div>
            ) : (
              <img
                src={previewUrl}
                alt=""
                className="h-full w-full rounded-lg object-cover"
              />
            )
          ) : (
            <div className="h-full w-full rounded-lg bg-gradient-to-br from-tool-rail-border to-tool-surface-deep" />
          )}
        </div>
      </div>

      <div className="flex h-16 flex-shrink-0 items-center justify-center">
        <div className="flex items-center gap-8 text-[12px] font-medium text-[rgba(255,255,255,0.4)]">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 hover:text-[rgba(255,255,255,0.85)]"
          >
            <IconExtend />
            <span>Extend</span>
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 hover:text-[rgba(255,255,255,0.85)]"
          >
            <IconModify />
            <span>Modify</span>
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 hover:text-[rgba(255,255,255,0.85)]"
            onClick={() => {
              void copyText(generation.prompt);
            }}
          >
            <IconCopy />
            <span>Copy prompt</span>
          </button>
        </div>
      </div>
    </section>
  );
}
