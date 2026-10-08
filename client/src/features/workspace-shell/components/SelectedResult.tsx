import React from "react";
import { useSelectedResultMedia } from "../hooks/useSelectedResultMedia";
import { Button } from "@promptstudio/system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@promptstudio/system/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@promptstudio/system/components/ui/dropdown-menu";
import { Pause, X } from "@promptstudio/system/components/ui";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { formatRelativeTime } from "@features/generations/config/generationConfig";
import type { GalleryGeneration } from "../types/result";
import favoriteIcon from "@/assets/design-system/favorite.svg";
import downloadIcon from "@/assets/design-system/download.svg";
import shareIcon from "@/assets/design-system/share.svg";
import takeMenuIcon from "@/assets/design-system/take-menu.svg";
import playIcon from "@/assets/design-system/play.svg";
import fullscreenIcon from "@/assets/design-system/fullscreen.svg";
import copyIcon from "@/assets/design-system/copy.svg";
import closeResultIcon from "@/assets/design-system/result-close.svg";
import { modelDisplayLabel } from "@shared/modelIdentity";

interface SelectedResultProps {
  generation: GalleryGeneration;
  onClose: () => void;
  onReuse: () => void;
  onToggleFavorite: (favorite: boolean) => void;
  onDownload: (url: string) => void;
  renderTakeMenu?: ((onFullscreen: () => void) => React.ReactNode) | undefined;
  onShare?: (() => void) | undefined;
}

const timestamp = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;

/** Page 21 selected result. Inspection owns no draft setters. */
export function SelectedResult({
  generation,
  onClose,
  onReuse,
  onToggleFavorite,
  onDownload,
  onShare,
  renderTakeMenu,
}: SelectedResultProps): React.ReactElement {
  const {
    videoRef,
    video,
    image,
    playable,
    mediaUrl,
    details,
    fullscreen,
    playing,
    position,
    duration,
    setDetails,
    setFullscreen,
    setPlaying,
    setPosition,
    setDuration,
    togglePlayback,
    copyPrompt,
    share,
  } = useSelectedResultMedia(generation, onShare);
  const media = (
    <div className="vidra-result-media rounded-card overflow-hidden border-[0.5px]">
      <div
        className="relative"
        style={{
          aspectRatio: "7 / 4",
          maxHeight: fullscreen ? "calc(100dvh - 132px)" : undefined,
        }}
      >
        {playable && video.url ? (
          <video
            ref={videoRef}
            src={video.url}
            poster={image.url ?? undefined}
            playsInline
            loop
            muted
            aria-label="Selected video"
            className="h-full w-full object-contain"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onLoadedMetadata={(event) => {
              const element = event.currentTarget;
              setDuration(
                Number.isFinite(element.duration) ? element.duration : 0,
              );
              element.currentTime = position;
              if (playing) void element.play().catch(() => setPlaying(false));
            }}
            onTimeUpdate={(event) =>
              setPosition(event.currentTarget.currentTime)
            }
          />
        ) : image.url ? (
          <img
            src={image.url}
            alt="Selected result"
            className="h-full w-full object-contain"
          />
        ) : (
          <div
            role="status"
            className="text-ui text-muted flex h-full min-h-[168px] items-center justify-center"
          >
            {image.loading || video.loading
              ? "Loading media…"
              : "Media unavailable"}
          </div>
        )}
        {!fullscreen ? (
          <div className="absolute right-2 top-2">
            {renderTakeMenu ? (
              renderTakeMenu(() => setFullscreen(true))
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon-xs"
                    aria-label="Take actions"
                  >
                    <img src={takeMenuIcon} alt="" width={12} height={12} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    onSelect={() => setFullscreen(true)}
                    disabled={!mediaUrl}
                  >
                    Fullscreen
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={onClose}>
                    Close preview
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ) : null}
      </div>
      {playable ? (
        <div className="flex h-9 items-center gap-2 px-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={togglePlayback}
            aria-label={playing ? "Pause video" : "Play video"}
          >
            {playing ? (
              <Pause className="h-4 w-4" />
            ) : (
              <img src={playIcon} alt="" width={16} height={16} />
            )}
          </Button>
          <input
            type="range"
            aria-label="Playback position"
            min={0}
            max={duration || 1}
            step={0.1}
            value={Math.min(position, duration || 1)}
            style={
              {
                "--seek-progress": `${duration > 0 ? Math.min(100, (position / duration) * 100) : 0}%`,
              } as React.CSSProperties
            }
            className="vidra-result-scrub min-w-0 flex-1"
            onChange={(event) => {
              const next = Number(event.currentTarget.value);
              if (videoRef.current) videoRef.current.currentTime = next;
              setPosition(next);
            }}
          />
          <span className="text-meta text-muted whitespace-nowrap">
            {timestamp(position)} / {timestamp(duration)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setFullscreen(true)}
            aria-label="Fullscreen"
          >
            <img src={fullscreenIcon} alt="" width={16} height={16} />
          </Button>
        </div>
      ) : null}
    </div>
  );
  const metadata = [
    ["Model", modelDisplayLabel(generation.model)],
    ["Mode", generation.tier === "draft" ? "Draft" : "Render"],
    ["Duration", generation.duration ? `${generation.duration}s` : null],
    ["Aspect ratio", generation.aspectRatio],
    ["Resolution", generation.resolution],
  ];
  return (
    <section
      aria-label="Selected result"
      className="flex w-full flex-col gap-2"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {fullscreen ? (
        <div className="rounded-card bg-canvas aspect-[7/4]" />
      ) : (
        media
      )}
      <div className="flex items-center justify-between gap-1">
        <Button
          variant="secondary"
          size="sm"
          className="w-[112px] px-0"
          onClick={onReuse}
        >
          Reuse setup
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-[60px] px-0"
          onClick={() => setDetails(true)}
        >
          Details
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Favorite"
          aria-pressed={generation.isFavorite}
          onClick={() => onToggleFavorite(!generation.isFavorite)}
          className={generation.isFavorite ? "bg-active" : undefined}
        >
          <img src={favoriteIcon} alt="" width={16} height={16} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Download"
          disabled={!mediaUrl}
          onClick={() => mediaUrl && onDownload(mediaUrl)}
        >
          <img src={downloadIcon} alt="" width={16} height={16} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Share"
          disabled={!mediaUrl}
          onClick={() => void share()}
        >
          <img src={shareIcon} alt="" width={16} height={16} />
        </Button>
      </div>
      <Dialog open={details} onOpenChange={setDetails}>
        <DialogContent
          hideClose
          className="vidra-result-details rounded-card max-w-[352px] gap-4 p-4"
        >
          <DialogTitle className="sr-only">Result details</DialogTitle>
          <div className="flex items-center justify-between">
            <p className="text-ui flex-1">Prompt</p>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Copy prompt"
              onClick={() => void copyPrompt()}
            >
              <img src={copyIcon} alt="" width={16} height={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close"
              onClick={() => setDetails(false)}
            >
              <img src={closeResultIcon} alt="" width={16} height={16} />
            </Button>
          </div>
          <DialogDescription className="sr-only">
            Saved prompt and generation settings
          </DialogDescription>
          <p className="text-ui max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
            {generation.prompt}
          </p>
          <dl className="border-border text-ui grid grid-cols-2 gap-4 border-t pt-4">
            {metadata.map(([label, value]) =>
              value ? (
                <div key={label} className="min-h-11">
                  <dt className="text-meta text-foreground">{label}</dt>
                  <dd className="mt-1">{value}</dd>
                </div>
              ) : null,
            )}
          </dl>
          <p className="text-meta text-foreground">
            Generated {formatRelativeTime(generation.createdAt)}
          </p>
        </DialogContent>
      </Dialog>
      <FullscreenDialog
        open={fullscreen}
        onOpenChange={setFullscreen}
        title="Fullscreen result"
        description="Selected media. Close to return to the workspace."
        contentClassName="flex items-center justify-center bg-canvas p-4 md:p-12"
      >
        {fullscreen ? (
          <>
            <div className="w-full max-w-[1120px]">{media}</div>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Close fullscreen"
              onClick={() => setFullscreen(false)}
              className="absolute right-4 top-4"
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : null}
      </FullscreenDialog>
    </section>
  );
}
