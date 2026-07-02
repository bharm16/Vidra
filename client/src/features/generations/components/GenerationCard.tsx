import React, { memo } from "react";
import {
  ArrowClockwise,
  Check,
  Download,
  WarningCircle,
  X,
} from "@promptstudio/system/components/ui";
import { Button } from "@promptstudio/system/components/ui/button";

import { cn } from "@/utils/cn";
import { FEATURES } from "@/config/features.config";
import { ContinueSceneButton } from "@/features/continuity/components/ContinueSceneButton";
import { extractStorageObjectPath } from "@/utils/storageUrl";
import { ImagePreview } from "@/components/MediaViewer/components/ImagePreview";

import type { Generation } from "../types";
import { getModelConfig } from "../config/generationConfig";
import { useGenerationProgress } from "../hooks/useGenerationProgress";
import { resolvePrimaryVideoSource } from "../utils/videoSource";
import { KontextFrameStrip } from "./KontextFrameStrip";
import { VideoThumbnail } from "./VideoThumbnail";

interface GenerationCardProps {
  generation: Generation;
  onRetry?: ((generation: Generation) => void) | undefined;
  onDelete?: ((generation: Generation) => void) | undefined;
  onDownload?: ((generation: Generation) => void) | undefined;
  onExtend?: ((generation: Generation) => void) | undefined;
  canExtend?: boolean | undefined;
  onCancel?: ((generation: Generation) => void) | undefined;
  onContinueSequence?: ((generation: Generation) => void) | undefined;
  isSequenceMode?: boolean | undefined;
  isStartingSequence?: boolean | undefined;
  onSelectFrame?:
    | ((url: string, index: number, generationId: string) => void)
    | undefined;
  onClearSelectedFrame?: (() => void) | undefined;
  selectedFrameUrl?: string | null | undefined;
  isActive?: boolean | undefined;
  className?: string;
  onClick?: (() => void) | undefined;
}

export const GenerationCard = memo(function GenerationCard({
  generation,
  onRetry,
  onDelete,
  onDownload,
  onExtend,
  canExtend = false,
  onCancel,
  onContinueSequence,
  isSequenceMode = false,
  isStartingSequence = false,
  onSelectFrame,
  onClearSelectedFrame,
  selectedFrameUrl = null,
  className,
  onClick,
}: GenerationCardProps): React.ReactElement {
  const config = getModelConfig(generation.model);
  const { progressPercent, isGenerating, isFailed } =
    useGenerationProgress(generation);
  const mediaUrl = generation.mediaUrls[0] ?? null;
  const primaryMediaRef = generation.mediaAssetIds?.[0] ?? null;
  const { storagePath: mediaStoragePath, assetId: primaryVideoAssetId } =
    resolvePrimaryVideoSource(mediaUrl, primaryMediaRef);
  const continuitySourceId = primaryVideoAssetId ?? mediaStoragePath;
  const thumbnailStoragePath = generation.thumbnailUrl
    ? extractStorageObjectPath(generation.thumbnailUrl)
    : null;
  const showContinueScene =
    FEATURES.CONTINUITY_UI &&
    Boolean(onContinueSequence) &&
    !isSequenceMode &&
    generation.mediaType === "video" &&
    generation.status === "completed";
  const showRetry = generation.status === "failed" && Boolean(onRetry);
  const showDownload =
    generation.tier === "render" &&
    generation.status === "completed" &&
    Boolean(mediaUrl) &&
    Boolean(onDownload);
  const showExtend =
    canExtend &&
    generation.status === "completed" &&
    generation.mediaType === "video" &&
    Boolean(mediaUrl) &&
    Boolean(onExtend);
  const canSelectFrames =
    generation.mediaType === "image-sequence" &&
    generation.status === "completed" &&
    generation.mediaUrls.length > 0 &&
    Boolean(onSelectFrame);
  const hasSelectedFrame =
    canSelectFrames &&
    selectedFrameUrl !== null &&
    generation.mediaUrls.includes(selectedFrameUrl);
  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onClick) return;
    const target = event.target as Element;
    if (target.closest("button, a, input, textarea, select, video")) {
      return;
    }
    onClick();
  };

  return (
    <div
      className={cn("group cursor-pointer", className)}
      onClick={onClick ? handleClick : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {generation.mediaType === "image-sequence" ? (
        (() => {
          if (
            import.meta.env.DEV &&
            generation.status === "completed" &&
            generation.mediaUrls.length === 0
          ) {
            console.warn(
              "[GenerationCard] Image-sequence generation completed but no mediaUrls:",
              {
                id: generation.id,
                model: generation.model,
                mediaType: generation.mediaType,
              },
            );
          }
          return (
            <KontextFrameStrip
              frames={
                generation.mediaUrls.length
                  ? generation.mediaUrls
                  : Array.from({ length: 4 }, () => null)
              }
              duration={generation.duration ?? 5}
              isGenerating={isGenerating}
              progressPercent={progressPercent}
              selectedFrameUrl={selectedFrameUrl}
              onFrameClick={
                canSelectFrames
                  ? (index, url) => {
                      if (!url) return;
                      if (selectedFrameUrl === url) {
                        onClearSelectedFrame?.();
                        return;
                      }
                      onSelectFrame?.(url, index, generation.id);
                    }
                  : undefined
              }
            />
          );
        })()
      ) : (
        <VideoThumbnail
          videoUrl={mediaUrl}
          videoStoragePath={mediaStoragePath}
          videoAssetId={primaryVideoAssetId}
          thumbnailUrl={generation.thumbnailUrl ?? null}
          thumbnailStoragePath={thumbnailStoragePath}
          isGenerating={isGenerating}
          progressPercent={progressPercent}
          tier={generation.tier}
          modelLabel={config?.label ?? generation.model}
          isFailed={isFailed}
          {...(generation.error !== undefined
            ? { failedMessage: generation.error }
            : {})}
          onRetry={showRetry && onRetry ? () => onRetry(generation) : undefined}
          onCancel={
            isGenerating && onCancel ? () => onCancel(generation) : undefined
          }
          onDelete={onDelete ? () => onDelete(generation) : undefined}
        />
      )}

      {hasSelectedFrame && (
        <div className="border-tool-nav-active bg-tool-surface-card mt-3 flex items-center gap-2 rounded-lg border px-3 py-2">
          <Check
            size={14}
            weight="bold"
            className="text-tool-accent-neutral"
            aria-hidden="true"
          />
          <span className="text-tool-text-dim flex-1 text-xs font-medium">
            Frame selected as start frame
          </span>
          {onClearSelectedFrame && (
            <button
              type="button"
              className="text-tool-text-subdued hover:text-tool-text-dim transition-colors"
              onClick={(event) => {
                event.stopPropagation();
                onClearSelectedFrame();
              }}
              aria-label="Clear selected keyframe"
            >
              <X size={14} weight="bold" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {generation.faceSwapUrl && (
        <div className="border-tool-nav-active bg-tool-surface-card mt-3 flex items-center gap-2 rounded-lg border px-3 py-2">
          <div className="border-tool-nav-active h-10 w-10 overflow-hidden rounded-md border">
            <ImagePreview
              src={generation.faceSwapUrl}
              alt="Face swap preview"
            />
          </div>
          <span className="text-tool-text-dim flex-1 text-xs font-medium">
            Face swap applied
          </span>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1.5">
        {generation.status === "failed" && (
          <span className="text-label-sm mr-auto inline-flex items-center gap-1 font-medium text-red-500/40">
            <WarningCircle size={14} aria-hidden="true" />
            {generation.error ?? "Generation failed"}
          </span>
        )}

        {showRetry && onRetry && (
          <Button
            type="button"
            variant="ghost"
            className="border-tool-nav-active text-tool-text-subdued hover:border-tool-text-disabled hover:text-tool-text-dim h-6 gap-1 rounded-[5px] border bg-transparent px-2 text-[11px] font-medium transition-colors"
            onClick={(event) => {
              event.stopPropagation();
              onRetry(generation);
            }}
          >
            <ArrowClockwise size={12} aria-hidden="true" />
            Retry
          </Button>
        )}
        {showDownload && mediaUrl && onDownload && (
          <Button
            type="button"
            variant="ghost"
            className="border-tool-nav-active text-tool-text-subdued hover:border-tool-text-disabled hover:text-tool-text-dim h-6 gap-1 rounded-[5px] border bg-transparent px-2 text-[11px] font-medium transition-colors"
            onClick={(event) => {
              event.stopPropagation();
              onDownload(generation);
            }}
          >
            <Download size={12} aria-hidden="true" />
            Download
          </Button>
        )}
        {showExtend && mediaUrl && onExtend && (
          <Button
            type="button"
            variant="ghost"
            className="border-tool-nav-active text-tool-text-subdued hover:border-tool-text-disabled hover:text-tool-text-dim h-6 gap-1 rounded-[5px] border bg-transparent px-2 text-[11px] font-medium transition-colors"
            onClick={(event) => {
              event.stopPropagation();
              onExtend(generation);
            }}
          >
            Extend
          </Button>
        )}
        {showContinueScene && (
          <ContinueSceneButton
            onClick={() => onContinueSequence?.(generation)}
            disabled={!continuitySourceId || isStartingSequence}
            isLoading={isStartingSequence}
            label="Continue as Sequence"
            className={cn(
              showRetry || showDownload ? "" : "ml-auto",
              "[&>button]:border-tool-nav-active [&>button]:text-tool-text-subdued [&>button]:hover:border-tool-text-disabled [&>button]:hover:text-tool-text-dim [&>button]:disabled:border-tool-nav-active [&>button]:disabled:text-tool-text-label [&>button]:h-6 [&>button]:rounded-[5px] [&>button]:border [&>button]:bg-transparent [&>button]:px-2 [&>button]:text-[11px] [&>button]:font-medium [&>button]:transition-colors",
            )}
          />
        )}
      </div>
    </div>
  );
});

GenerationCard.displayName = "GenerationCard";
