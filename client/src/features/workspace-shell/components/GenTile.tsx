import React from "react";
import { Badge } from "@promptstudio/system/components/ui";
import { cn } from "@/utils/cn";
import { useResolvedMediaUrl } from "@/hooks/useResolvedMediaUrl";
import type { Generation } from "@features/generations/types";
import { dispatchContinueScene } from "../events";

export interface GenTileProps {
  generation: Generation;
  isFeatured: boolean;
  onSelect: () => void;
  onRetry: () => void;
}

export function GenTile({
  generation,
  isFeatured,
  onSelect,
  onRetry,
}: GenTileProps): React.ReactElement {
  const status = generation.status;
  const dataState =
    status === "completed"
      ? "ready"
      : status === "generating"
        ? "rendering"
        : status === "pending"
          ? "queued"
          : "failed";

  return (
    <article
      data-state={dataState}
      data-generation-id={generation.id}
      className={cn(
        "border-tool-rail-border bg-tool-surface-card group relative aspect-video overflow-hidden rounded-lg border",
        isFeatured && "ring-tool-accent-neutral/40 ring-2",
        status === "completed" && "cursor-pointer",
      )}
      onClick={status === "completed" ? onSelect : undefined}
    >
      {status === "pending" && <QueuedPlaceholder />}
      {status === "generating" && <RenderingPlaceholder />}
      {status === "completed" && (
        <ReadyMedia generation={generation} isFeatured={isFeatured} />
      )}
      {status === "failed" && <FailedState onRetry={onRetry} />}

      {status === "completed" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-end gap-1.5 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            className="bg-tool-surface-deep/80 text-foreground pointer-events-auto rounded-md px-2 py-1 text-[10px] font-medium"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
          >
            Open
          </button>
          {isFeatured && (
            <button
              type="button"
              className="bg-tool-accent-neutral text-tool-surface-deep pointer-events-auto rounded-md px-2 py-1 text-[10px] font-semibold"
              onClick={(e) => {
                e.stopPropagation();
                dispatchContinueScene({ fromGenerationId: generation.id });
              }}
            >
              Continue scene
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function QueuedPlaceholder(): React.ReactElement {
  return (
    <div className="flex h-full items-center justify-center">
      <Badge variant="neutral" size="xs" className="px-2">
        Queued
      </Badge>
    </div>
  );
}

function RenderingPlaceholder(): React.ReactElement {
  return (
    <div className="relative h-full">
      <div className="bg-tool-rail-border/40 absolute inset-0 animate-pulse" />
      <div className="absolute inset-x-0 bottom-2 text-center">
        <Badge variant="warning" size="xs" className="px-2">
          Rendering
        </Badge>
      </div>
    </div>
  );
}

function ReadyMedia({
  generation,
  isFeatured,
}: {
  generation: Generation;
  isFeatured: boolean;
}): React.ReactElement {
  // Only the featured tile carries a <video> (hard cap: one per shot — see
  // GenTile.perf.regression.test). Non-featured tiles stay poster-only.
  const poster = generation.thumbnailUrl ?? generation.mediaUrls[0] ?? "";
  const videoUrl =
    generation.mediaType === "video" ? (generation.mediaUrls[0] ?? null) : null;
  if (isFeatured && videoUrl) {
    return <FeaturedVideo generation={generation} poster={poster} />;
  }
  return (
    <img
      src={poster}
      alt="Generation preview"
      loading="lazy"
      className="h-full w-full object-cover"
    />
  );
}

function FeaturedVideo({
  generation,
  poster,
}: {
  generation: Generation;
  poster: string;
}): React.ReactElement {
  const { url } = useResolvedMediaUrl({
    kind: "video",
    url: generation.mediaUrls[0] ?? null,
    assetId: generation.mediaAssetIds?.[0] ?? null,
  });
  if (!url) {
    return (
      <img
        src={poster}
        alt="Generation preview"
        loading="lazy"
        className="h-full w-full object-cover"
      />
    );
  }
  return (
    <video
      src={url}
      poster={generation.thumbnailUrl ?? undefined}
      autoPlay
      loop
      muted
      playsInline
      className="h-full w-full object-cover"
    />
  );
}

function FailedState({ onRetry }: { onRetry: () => void }): React.ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-3 text-center">
      <p className="text-tool-text-subdued text-xs">Render failed.</p>
      <button
        type="button"
        className="border-tool-rail-border text-tool-text-dim hover:text-foreground rounded-md border px-2 py-1 text-[10px] font-semibold"
        onClick={(e) => {
          e.stopPropagation();
          onRetry();
        }}
      >
        Retry
      </button>
    </div>
  );
}
