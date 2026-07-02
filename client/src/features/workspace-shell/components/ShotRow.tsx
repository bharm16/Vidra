import React from "react";
import { Badge, type BadgeProps } from "@promptstudio/system/components/ui";
import { cn } from "@/utils/cn";
import type { Shot } from "../utils/groupShots";
import { formatRelative } from "../utils/formatRelative";
import { GenTile } from "./GenTile";

export interface ShotRowProps {
  shot: Shot;
  layout: "featured" | "compact";
  /** id of the featured tile within this shot, or null. */
  featuredTileId: string | null;
  /**
   * Wall-clock timestamp used to format the relative "5m ago" label.
   * Owned by the caller so the row stays presentational + storybook-stable.
   */
  now: number;
  onSelectTile: (generationId: string) => void;
  onRetryTile: (generationId: string) => void;
}

const STATUS_BADGE_VARIANT: Record<
  Shot["status"],
  NonNullable<BadgeProps["variant"]>
> = {
  ready: "success",
  rendering: "warning",
  queued: "neutral",
  failed: "danger",
  mixed: "warning",
};

export function ShotRow({
  shot,
  layout,
  featuredTileId,
  now,
  onSelectTile,
  onRetryTile,
}: ShotRowProps): React.ReactElement {
  return (
    <section
      data-layout={layout}
      aria-labelledby={`shot-${shot.id}-header`}
      className="border-tool-rail-border bg-tool-surface-card/40 rounded-lg border p-4"
    >
      <header
        id={`shot-${shot.id}-header`}
        className="mb-3 flex items-center gap-3"
      >
        <h2 className="text-foreground m-0 flex-1 truncate text-sm font-medium">
          {shot.promptSummary || "Untitled shot"}
        </h2>
        <Badge
          variant={STATUS_BADGE_VARIANT[shot.status]}
          size="xs"
          className="px-2 capitalize"
        >
          {shot.status}
        </Badge>
        <time className="text-tool-text-subdued font-mono text-[10px]">
          {formatRelative(shot.createdAt, now)}
        </time>
      </header>
      <div
        className={cn(
          "grid gap-3",
          layout === "featured"
            ? "grid-cols-2 lg:grid-cols-4"
            : "grid-cols-4 lg:grid-cols-6",
        )}
      >
        {shot.tiles.map((tile) => (
          <GenTile
            key={tile.id}
            generation={tile}
            isFeatured={tile.id === featuredTileId}
            onSelect={() => onSelectTile(tile.id)}
            onRetry={() => onRetryTile(tile.id)}
          />
        ))}
      </div>
    </section>
  );
}
