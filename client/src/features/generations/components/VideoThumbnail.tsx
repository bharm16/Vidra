import React from "react";
import {
  DotsThree,
  Play,
  WarningCircle,
} from "@promptstudio/system/components/ui";
import { cn } from "@/utils/cn";
import { useResolvedMediaUrl } from "@/hooks/useResolvedMediaUrl";

const formatDuration = (seconds: number): string => {
  const normalized =
    Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 4;
  const minutes = Math.floor(normalized / 60);
  const remainderSeconds = normalized % 60;
  return `${minutes}:${String(remainderSeconds).padStart(2, "0")}`;
};

interface VideoThumbnailProps {
  videoUrl: string | null;
  videoStoragePath?: string | null;
  videoAssetId?: string | null;
  thumbnailUrl?: string | null;
  thumbnailStoragePath?: string | null;
  thumbnailAssetId?: string | null;
  isGenerating: boolean;
  progressPercent?: number | null;
  tier?: "draft" | "render";
  modelLabel?: string;
  isFailed?: boolean;
  failedMessage?: string | null;
  onRetry?: (() => void) | undefined;
  onCancel?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
  onPlay?: (() => void) | undefined;
}

export function VideoThumbnail({
  videoUrl,
  videoStoragePath,
  videoAssetId,
  thumbnailUrl,
  thumbnailStoragePath,
  thumbnailAssetId,
  isGenerating,
  progressPercent,
  tier,
  modelLabel,
  isFailed,
  onCancel,
  onDelete,
  onPlay,
}: VideoThumbnailProps): React.ReactElement {
  const videoRefreshAttemptedRef = React.useRef(false);
  const thumbnailRefreshAttemptedRef = React.useRef(false);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = React.useState(false);
  const [hasStartedPlayback, setHasStartedPlayback] = React.useState(false);
  const [videoDuration, setVideoDuration] = React.useState(0);
  const [playbackProgress, setPlaybackProgress] = React.useState(0);
  const { url: resolvedVideoUrl, refresh: refreshVideo } = useResolvedMediaUrl({
    kind: "video",
    url: videoUrl,
    storagePath: videoStoragePath ?? null,
    assetId: videoAssetId ?? null,
  });
  const { url: resolvedThumbnailUrl, refresh: refreshThumbnail } =
    useResolvedMediaUrl({
      kind: "image",
      url: thumbnailUrl ?? null,
      storagePath: thumbnailStoragePath ?? null,
      assetId: thumbnailAssetId ?? null,
    });

  React.useEffect(() => {
    videoRefreshAttemptedRef.current = false;
    thumbnailRefreshAttemptedRef.current = false;
  }, [
    thumbnailUrl,
    videoUrl,
    videoStoragePath,
    videoAssetId,
    thumbnailStoragePath,
    thumbnailAssetId,
  ]);

  React.useEffect(() => {
    setIsVideoPlaying(false);
    setHasStartedPlayback(false);
    setVideoDuration(0);
    setPlaybackProgress(0);
  }, [resolvedVideoUrl]);

  const handlePlayToggle = async (
    event: React.MouseEvent<HTMLButtonElement>,
  ): Promise<void> => {
    event.stopPropagation();

    if (!resolvedVideoUrl || !videoRef.current) {
      onPlay?.();
      return;
    }

    const video = videoRef.current;

    if (video.paused || video.ended) {
      try {
        await video.play();
        setIsVideoPlaying(true);
      } catch {
        onPlay?.();
      }
      return;
    }

    video.pause();
    setIsVideoPlaying(false);
  };

  const handleScrub = (event: React.MouseEvent<HTMLDivElement>): void => {
    event.stopPropagation();

    const video = videoRef.current;
    if (!video || !videoDuration) return;

    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;

    const ratio = Math.min(
      Math.max((event.clientX - rect.left) / rect.width, 0),
      1,
    );
    video.currentTime = ratio * videoDuration;
    setPlaybackProgress(ratio);
  };

  const handleVideoClick = async (
    event: React.MouseEvent<HTMLVideoElement>,
  ): Promise<void> => {
    event.stopPropagation();

    const video = videoRef.current;
    if (!video) return;

    if (!isVideoPlaying) {
      try {
        await video.play();
        setIsVideoPlaying(true);
        setHasStartedPlayback(true);
      } catch {
        onPlay?.();
      }
      return;
    }

    video.pause();
    setIsVideoPlaying(false);
  };

  if (isGenerating) {
    return (
      <div className="group/video relative aspect-video w-full overflow-hidden rounded-md border border-success-400/20 bg-tool-surface-deep">
        <div className="h-full w-full animate-shimmer bg-gradient-to-r from-tool-surface-deep via-tool-nav-active to-tool-surface-deep bg-[length:200%_100%]" />

        {modelLabel && (
          <div className="absolute left-2 top-2 rounded bg-black/30 px-1.5 py-0.5 text-meta font-semibold text-white/40 backdrop-blur-md">
            {modelLabel}
          </div>
        )}

        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-meta font-medium text-white/30">
            {typeof progressPercent === "number"
              ? `${progressPercent}%`
              : "Starting..."}
          </span>
        </div>

        {onCancel && (
          <button
            type="button"
            className="absolute right-2 top-2 rounded bg-black/30 px-1.5 py-0.5 text-meta font-medium text-white/40 backdrop-blur-md transition-colors hover:text-white/70"
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
          >
            Cancel
          </button>
        )}

        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/[0.06]">
          <div
            className="h-full bg-success-400 transition-[width] duration-300 ease-out"
            style={{
              width: `${typeof progressPercent === "number" ? progressPercent : 0}%`,
            }}
          />
        </div>
      </div>
    );
  }

  if (isFailed) {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-md border border-tool-nav-active bg-tool-surface-deep">
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5">
          <WarningCircle
            size={14}
            className="text-red-500/40"
            aria-hidden="true"
          />
          <span className="text-meta text-red-500/40">Failed</span>
        </div>
      </div>
    );
  }

  return (
    <div className="group/video relative aspect-video w-full overflow-hidden rounded-md border border-tool-nav-active bg-tool-surface-deep transition-[border-color] duration-200 hover:border-tool-text-disabled">
      {resolvedVideoUrl ? (
        <video
          ref={videoRef}
          key={resolvedVideoUrl}
          src={resolvedVideoUrl}
          className="h-full w-full cursor-pointer object-cover bg-black"
          playsInline
          muted
          loop
          preload="metadata"
          onClick={handleVideoClick}
          onLoadedMetadata={(event) => {
            const nextDuration = event.currentTarget.duration;
            if (!Number.isFinite(nextDuration) || nextDuration <= 0) {
              setVideoDuration(0);
              return;
            }
            setVideoDuration(nextDuration);
          }}
          onTimeUpdate={(event) => {
            const duration = event.currentTarget.duration;
            if (!Number.isFinite(duration) || duration <= 0) {
              setPlaybackProgress(0);
              return;
            }
            setPlaybackProgress(event.currentTarget.currentTime / duration);
          }}
          onPlay={() => {
            setIsVideoPlaying(true);
            setHasStartedPlayback(true);
            onPlay?.();
          }}
          onPause={() => {
            setIsVideoPlaying(false);
          }}
          onEnded={() => {
            setIsVideoPlaying(false);
          }}
          onError={async () => {
            if (videoRefreshAttemptedRef.current || !resolvedVideoUrl) {
              return;
            }
            videoRefreshAttemptedRef.current = true;
            await refreshVideo("error");
          }}
        />
      ) : resolvedThumbnailUrl ? (
        <img
          src={resolvedThumbnailUrl}
          alt="Video thumbnail"
          className="h-full w-full object-cover"
          onError={async () => {
            if (thumbnailRefreshAttemptedRef.current || !resolvedThumbnailUrl) {
              return;
            }
            thumbnailRefreshAttemptedRef.current = true;
            await refreshThumbnail("error");
          }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-meta text-tool-text-label">
          No preview
        </div>
      )}

      {resolvedVideoUrl && (
        <div
          className="absolute bottom-0 left-0 right-0 z-10 h-[3px] cursor-pointer bg-white/10 opacity-60 transition-opacity duration-200 group-hover/video:opacity-100"
          onClick={handleScrub}
          role="slider"
          aria-label="Video scrubber"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(playbackProgress * 100)}
        >
          <div
            className="h-full rounded-sm bg-white/70 transition-[width] duration-75"
            style={{ width: `${playbackProgress * 100}%` }}
          />
        </div>
      )}

      <div className="absolute bottom-2 right-2 rounded bg-black/45 px-[5px] py-[2px] text-meta font-medium tabular-nums text-white/70 backdrop-blur-md">
        {formatDuration(videoDuration)}
      </div>

      <div className="absolute inset-x-0 top-0 flex items-center gap-1.5 p-2 opacity-0 transition-opacity duration-200 group-hover/video:opacity-100">
        {tier && (
          <span
            className={cn(
              "rounded bg-black/40 px-1.5 py-0.5 text-meta font-semibold backdrop-blur-md",
              tier === "draft"
                ? "text-success-400/80"
                : "text-tool-accent-neutral/80",
            )}
          >
            {tier === "draft" ? "Draft" : "Render"}
          </span>
        )}
        {modelLabel && (
          <span className="rounded bg-black/40 px-1.5 py-0.5 text-meta font-medium text-white/55 backdrop-blur-md">
            {modelLabel}
          </span>
        )}
        <div className="flex-1" />
        {onDelete && (
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded-sm border-none bg-black/40 text-white/55 backdrop-blur-md transition-colors hover:text-white/80"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label="More actions"
          >
            <DotsThree size={14} weight="bold" aria-hidden="true" />
          </button>
        )}
      </div>

      {resolvedVideoUrl && !isVideoPlaying && !hasStartedPlayback && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover/video:opacity-100">
          <button
            type="button"
            className="pointer-events-auto flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-none bg-black/45 text-white/90 backdrop-blur-xl transition-transform hover:scale-105"
            onClick={handlePlayToggle}
            aria-label="Play video"
          >
            <Play size={20} weight="fill" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
