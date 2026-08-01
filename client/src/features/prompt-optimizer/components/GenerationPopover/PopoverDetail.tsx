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

const resolveTierLabel = (generation: GalleryGeneration): string => {
  if (generation.tier === "preview") return "Preview";
  if (generation.tier === "draft") return "Draft";
  return "Final";
};

const resolveTierColor = (generation: GalleryGeneration): string => {
  if (generation.tier === "draft") return "#4ADE80";
  if (generation.tier === "preview") return "#6C5CE7";
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
    <aside className="flex h-full w-[320px] flex-shrink-0 flex-col overflow-hidden border-l border-tool-rail-border bg-tool-panel-inner">
      <div className="px-5 pb-0 pt-6">
        <h2 className="line-clamp-3 text-ui font-semibold leading-[1.5] text-foreground">
          {generation.prompt}
        </h2>
        <div className="mt-2.5 flex flex-wrap items-center gap-1 text-meta text-tool-text-subdued">
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

      <div className="mx-5 mt-[18px] h-px bg-tool-rail-border" />

      <div className="px-5 pb-0 pt-[14px]">
        <div className="flex items-center">
          <span className="text-meta font-semibold text-tool-text-dim">
            Prompt
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => {
              void copyText(generation.prompt);
              onCopyPrompt();
            }}
            className="inline-flex h-5 w-5 items-center justify-center text-tool-text-subdued transition-colors hover:text-tool-text-dim"
            aria-label="Copy prompt text"
          >
            <CopyIcon />
          </button>
        </div>

        <div className="mt-2 max-h-[100px] overflow-auto text-ui leading-[1.65] text-tool-text-dim">
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

      <div className="mx-5 mt-4 h-px bg-tool-rail-border" />

      <div className="px-5 py-4">
        <button
          type="button"
          onClick={onReuse}
          className="inline-flex h-[42px] w-full items-center justify-center rounded-md bg-foreground text-ui font-bold text-tool-surface-deep transition-opacity hover:opacity-90"
        >
          Reuse prompt and settings
        </button>
      </div>

      <div className="mx-5 h-px bg-tool-rail-border" />

      <PopoverThumbnailRail
        generations={generations}
        activeId={activeId}
        onChange={onChange}
      />
    </aside>
  );
}
