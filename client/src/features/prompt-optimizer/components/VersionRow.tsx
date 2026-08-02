import React from "react";
import { Icon, Image, Play } from "@promptstudio/system/components/ui";
import { Button } from "@promptstudio/system/components/ui/button";
import { formatTimestamp } from "../PromptCanvas/utils/promptCanvasFormatters";
import { cn } from "@/utils/cn";
import type { PromptVersionEdit } from "@features/prompt-optimizer/types/domain/prompt-session";
import type { Generation } from "@features/generations/types";

type VersionPreview = {
  generatedAt?: string;
  imageUrl?: string | null;
  aspectRatio?: string | null;
};

export type VersionEntry = {
  id?: string;
  versionId?: string;
  label?: string;
  version?: string | number;
  meta?: string;
  edits?: PromptVersionEdit[] | number;
  editCount?: number;
  timestamp?: string | number;
  signature?: string;
  prompt?: string;
  highlights?: unknown | null;
  isDirty?: boolean;
  dirty?: boolean;
  hasPreview?: boolean;
  hasVideo?: boolean;
  thumbnailUrl?: string | null;
  preview?: VersionPreview | null;
  video?: unknown;
  generations?: Generation[];
};

interface VersionRowProps {
  entry: VersionEntry;
  index: number;
  total: number;
  isSelected: boolean;
  onSelect: () => void;
  /** Layout direction */
  layout?: "vertical" | "horizontal";
}

const normalizeUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const pushUniqueUrl = (target: string[], candidate: unknown): void => {
  const normalized = normalizeUrl(candidate);
  if (!normalized) return;
  if (!target.includes(normalized)) {
    target.push(normalized);
  }
};

const resolvePreviewImageCandidates = (entry: VersionEntry): string[] => {
  const candidates: string[] = [];
  pushUniqueUrl(candidates, entry.preview?.imageUrl);
  pushUniqueUrl(candidates, entry.thumbnailUrl);

  const generations = Array.isArray(entry.generations) ? entry.generations : [];
  const completedGenerations = generations.filter(
    (generation) => generation.status === "completed",
  );
  const source = completedGenerations.length
    ? completedGenerations
    : generations;

  // Prefer explicit generation thumbnails first.
  for (const generation of source) {
    pushUniqueUrl(candidates, generation.thumbnailUrl);
  }

  // Then prefer image-like generation outputs.
  for (const generation of source) {
    if (
      generation.mediaType === "image" ||
      generation.mediaType === "image-sequence"
    ) {
      pushUniqueUrl(candidates, generation.mediaUrls?.[0]);
    }
  }

  // Finally, any first media URL as a last resort.
  for (const generation of source) {
    pushUniqueUrl(candidates, generation.mediaUrls?.[0]);
  }

  return candidates;
};

const resolveTimestamp = (value: VersionEntry["timestamp"]): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
    const asNumber = Number(value);
    if (!Number.isNaN(asNumber)) return asNumber;
  }
  return null;
};

const resolveMetaLabel = (entry: VersionEntry): string => {
  if (typeof entry.meta === "string" && entry.meta.trim()) {
    return entry.meta.trim();
  }
  const count =
    typeof entry.editCount === "number"
      ? entry.editCount
      : Array.isArray(entry.edits)
        ? entry.edits.length
        : typeof entry.edits === "number"
          ? entry.edits
          : null;
  if (typeof count === "number" && Number.isFinite(count)) {
    return `${count} edit${count === 1 ? "" : "s"}`;
  }
  const timestamp = resolveTimestamp(entry.timestamp);
  if (timestamp !== null) {
    return formatTimestamp(timestamp);
  }
  return "";
};

const resolveVersionLabel = (
  entry: VersionEntry,
  index: number,
  total: number,
): string => {
  if (typeof entry.label === "string" && entry.label.trim()) {
    return entry.label.trim();
  }
  if (typeof entry.version === "string" && entry.version.trim()) {
    return entry.version.trim();
  }
  if (typeof entry.version === "number" && Number.isFinite(entry.version)) {
    return `v${entry.version}`;
  }
  return `v${total - index}`;
};

export function VersionRow({
  entry,
  index,
  total,
  isSelected,
  onSelect,
  layout = "vertical",
}: VersionRowProps): React.ReactElement {
  const previewImageCandidates = resolvePreviewImageCandidates(entry);
  const previewImageCandidateKey = previewImageCandidates.join("|");
  const [previewImageIndex, setPreviewImageIndex] = React.useState(0);
  const previewImageUrl =
    previewImageIndex >= 0 && previewImageIndex < previewImageCandidates.length
      ? (previewImageCandidates[previewImageIndex] ?? null)
      : null;
  const hasPreview = Boolean(
    entry.hasPreview || entry.preview || previewImageCandidates.length > 0,
  );
  const hasVideo = Boolean(entry.hasVideo ?? entry.video);
  const label = resolveVersionLabel(entry, index, total);
  const meta = resolveMetaLabel(entry);
  const isDirty = Boolean(entry.isDirty ?? entry.dirty);

  // Reset image fallback chain when candidate set changes.
  React.useEffect(() => {
    setPreviewImageIndex(0);
  }, [previewImageCandidateKey]);

  const showImage = Boolean(previewImageUrl);
  const handleImageError = React.useCallback((): void => {
    setPreviewImageIndex((current) => {
      const next = current + 1;
      return next < previewImageCandidates.length
        ? next
        : previewImageCandidates.length;
    });
  }, [previewImageCandidates.length]);

  // Horizontal layout (compact filmstrip thumb)
  if (layout === "horizontal") {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "group snap-start",
          "flex flex-shrink-0 flex-col items-center gap-1.5",
          "bg-transparent border-none p-0 outline-none cursor-pointer",
        )}
        data-active={isSelected ? "true" : "false"}
        aria-pressed={isSelected}
      >
        {/* 96×54 thumbnail (16:9) */}
        <div
          className={cn(
            "relative h-[54px] w-24 overflow-hidden rounded-md",
            "transition-all duration-150",
            isSelected
              ? "ring-[1.5px] ring-accent shadow-[0_0_0_1px_rgba(108,92,231,0.2),0_2px_8px_rgba(108,92,231,0.08)]"
              : "border border-border group-hover:border-border-strong",
          )}
        >
          {/* Preview content */}
          {showImage ? (
            <img
              src={previewImageUrl!}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              onError={handleImageError}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-surface-2">
              <Icon
                icon={Image}
                size="sm"
                weight="bold"
                aria-hidden="true"
                className="text-faint"
              />
            </div>
          )}

          {/* Video badge overlay */}
          {hasVideo ? (
            <div className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded bg-black/60 backdrop-blur-sm">
              <Icon
                icon={Play}
                size="xs"
                weight="fill"
                aria-hidden="true"
                className="text-white"
              />
            </div>
          ) : null}

          {/* Dirty indicator on thumb */}
          {isDirty ? (
            <span
              className="absolute left-1 top-1 h-[5px] w-[5px] rounded-full bg-warning shadow-[0_0_0_1.5px_var(--surface-2)]"
              aria-hidden="true"
            />
          ) : null}
        </div>

        {/* Label row */}
        <div className="flex max-w-24 items-center gap-1">
          <span
            className={cn(
              "truncate text-meta transition-colors duration-150",
              isSelected
                ? "font-semibold text-foreground"
                : "font-medium text-muted group-hover:text-foreground/70",
            )}
          >
            {label}
          </span>
          {index === 0 ? (
            <span className="text-meta font-semibold uppercase tracking-wide text-accent/70">
              current
            </span>
          ) : null}
        </div>

        {/* Meta */}
        {meta ? (
          <span className="-mt-0.5 text-meta tracking-wide text-faint">
            {meta}
          </span>
        ) : null}
      </button>
    );
  }

  // Original vertical layout
  return (
    <Button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative flex h-ps-10 w-full items-center justify-between gap-ps-3 rounded-lg border border-border bg-surface-2 px-ps-3 text-left transition-colors hover:border-border-strong",
        isSelected && "border-accent/50 ring-2 ring-accent/10",
      )}
      data-active={isSelected ? "true" : "false"}
      aria-pressed={isSelected}
      variant="ghost"
    >
      {isSelected && (
        <span
          className="absolute left-0 top-0 h-full w-ps-1 rounded-l-lg bg-accent"
          aria-hidden="true"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-ps-1">
        <div className="flex min-w-0 items-center gap-ps-2">
          {isDirty ? (
            <span
              className="h-ps-1 w-ps-1 rounded-full bg-warning ring-2 ring-warning/30 ps-animate-active-dot-pulse"
              aria-hidden="true"
            />
          ) : null}
          <div className="truncate text-body-sm font-semibold text-foreground">
            {label}
          </div>
        </div>
        <div className="text-label-12 text-muted">{meta}</div>
      </div>
      {hasPreview || hasVideo ? (
        <div className="inline-flex flex-shrink-0 items-center gap-ps-2">
          {hasPreview ? (
            <div className="inline-flex h-ps-7 w-ps-7 items-center justify-center overflow-hidden rounded-md border border-border bg-raise text-faint">
              {showImage ? (
                <img
                  src={previewImageUrl!}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                  onError={handleImageError}
                />
              ) : (
                <Icon icon={Image} size="sm" weight="bold" aria-hidden="true" />
              )}
            </div>
          ) : null}
          {hasVideo ? (
            <div className="inline-flex h-ps-7 items-center gap-ps-1 rounded-md border border-border bg-raise px-ps-2 text-label-sm font-semibold text-muted">
              <Icon icon={Play} size="sm" weight="bold" aria-hidden="true" />
              <span>Video</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </Button>
  );
}
