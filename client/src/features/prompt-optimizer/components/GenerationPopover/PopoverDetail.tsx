import React, { useMemo } from "react";
import { formatRelativeTime } from "@features/generations/config/generationConfig";
import { PopoverThumbnailRail } from "./PopoverThumbnailRail";
import type { GalleryGeneration } from "@/features/prompt-optimizer/components/GalleryPanel";
import type { PopoverDetailProps } from "./types";

const spanColors: Record<string, string> = {
  subject: "#B8A9E8",
  camera: "#E8C07D",
  shot: "#E8C07D",
  lighting: "#E8B87D",
  location: "#8DC5E8",
  environment: "#8DC5E8",
  style: "#D4A0D0",
  atmosphere: "#7DC5C5",
  action: "#7DD3A8",
};

type PromptSegment = {
  text: string;
  color: string | null;
};

// A storyboard is called out by its media type, not by its tier — it is a
// multi-image take, and it was generated at a tier like any other.
const isStoryboard = (generation: GalleryGeneration): boolean =>
  generation.mediaType === "image-sequence";

const resolveTierLabel = (generation: GalleryGeneration): string => {
  if (isStoryboard(generation)) return "Storyboard";
  if (generation.tier === "draft") return "Draft";
  return "Render";
};

const resolveTierColor = (generation: GalleryGeneration): string => {
  if (isStoryboard(generation)) return "#6C5CE7";
  if (generation.tier === "draft") return "#4ADE80";
  return "#8B92A5";
};

const buildPromptSegments = (
  generation: GalleryGeneration,
): PromptSegment[] => {
  const prompt = generation.prompt ?? "";
  const spans = generation.promptSpans ?? [];
  if (!prompt || spans.length === 0) return [{ text: prompt, color: null }];

  const normalizedSpans = spans
    .filter(
      (span) =>
        Number.isFinite(span.start) &&
        Number.isFinite(span.end) &&
        span.start >= 0 &&
        span.end > span.start &&
        span.end <= prompt.length,
    )
    .sort((left, right) => left.start - right.start);

  if (normalizedSpans.length === 0) return [{ text: prompt, color: null }];

  const segments: PromptSegment[] = [];
  let cursor = 0;

  for (const span of normalizedSpans) {
    if (span.start < cursor) continue;
    if (span.start > cursor) {
      segments.push({
        text: prompt.slice(cursor, span.start),
        color: null,
      });
    }

    segments.push({
      text: prompt.slice(span.start, span.end),
      color: spanColors[span.category] ?? null,
    });
    cursor = span.end;
  }

  if (cursor < prompt.length) {
    segments.push({
      text: prompt.slice(cursor),
      color: null,
    });
  }

  return segments;
};

const copyText = async (text: string): Promise<void> => {
  if (typeof navigator === "undefined" || !navigator.clipboard) return;
  await navigator.clipboard.writeText(text);
};

function CopyIcon(): React.ReactElement {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
    >
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" strokeWidth="1.1" />
      <path
        d="M10 5.5V3.8A1.8 1.8 0 0 0 8.2 2H3.8A1.8 1.8 0 0 0 2 3.8v4.4A1.8 1.8 0 0 0 3.8 10H5.5"
        strokeWidth="1.1"
      />
    </svg>
  );
}

export function PopoverDetail({
  generation,
  generations,
  activeId,
  onChange,
  onReuse,
  onCopyPrompt,
}: PopoverDetailProps): React.ReactElement {
  const metadataTime = formatRelativeTime(generation.createdAt);
  const metadataParts = [
    generation.model,
    resolveTierLabel(generation).toLowerCase(),
    generation.duration ?? null,
    metadataTime,
  ].filter(Boolean);
  const promptSegments = useMemo(
    () => buildPromptSegments(generation),
    [generation],
  );

  return (
    <aside className="border-tool-rail-border bg-tool-panel-inner flex h-full w-[320px] flex-shrink-0 flex-col overflow-hidden border-l">
      <div className="px-5 pb-0 pt-6">
        <h2 className="text-ui text-foreground line-clamp-3 font-semibold leading-[1.5]">
          {generation.prompt}
        </h2>
        <div className="text-meta text-tool-text-subdued mt-2.5 flex flex-wrap items-center gap-1">
          <span>{generation.model}</span>
          <span>·</span>
          <span style={{ color: resolveTierColor(generation) }}>
            {resolveTierLabel(generation)}
          </span>
          {generation.duration ? (
            <>
              <span>·</span>
              <span>{generation.duration}</span>
            </>
          ) : null}
          <span>·</span>
          <span>{metadataParts[metadataParts.length - 1]}</span>
        </div>
      </div>

      <div className="bg-tool-rail-border mx-5 mt-[18px] h-px" />

      <div className="px-5 pb-0 pt-[14px]">
        <div className="flex items-center">
          <span className="text-meta text-tool-text-dim font-semibold">
            Prompt
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => {
              void copyText(generation.prompt);
              onCopyPrompt();
            }}
            className="text-tool-text-subdued hover:text-tool-text-dim inline-flex h-5 w-5 items-center justify-center transition-colors"
            aria-label="Copy prompt text"
          >
            <CopyIcon />
          </button>
        </div>

        <div className="text-ui text-tool-text-dim mt-2 max-h-[100px] overflow-auto leading-[1.65]">
          {promptSegments.map((segment, index) => (
            <span
              key={`${generation.id}-segment-${index}`}
              style={segment.color ? { color: segment.color } : undefined}
            >
              {segment.text}
            </span>
          ))}
        </div>
      </div>

      <div className="bg-tool-rail-border mx-5 mt-4 h-px" />

      <div className="px-5 py-4">
        <button
          type="button"
          onClick={onReuse}
          className="bg-foreground text-ui text-tool-surface-deep inline-flex h-[42px] w-full items-center justify-center rounded-md font-bold transition-opacity hover:opacity-90"
        >
          Reuse prompt and settings
        </button>
      </div>

      <div className="bg-tool-rail-border mx-5 h-px" />

      <PopoverThumbnailRail
        generations={generations}
        activeId={activeId}
        onChange={onChange}
      />
    </aside>
  );
}
