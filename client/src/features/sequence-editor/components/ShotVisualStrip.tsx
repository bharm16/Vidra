import React, { useMemo } from "react";
import { Check, Plus } from "@promptstudio/system/components/ui";
import type { ContinuityShot } from "@/features/continuity/types";
import { cn } from "@/utils/cn";
import { useResolvedMediaUrl } from "@/hooks/useResolvedMediaUrl";

interface ShotVisualStripProps {
  shots: ContinuityShot[];
  currentShotId: string | null;
  onShotSelect: (shotId: string) => void;
  onAddShot: () => void;
}

const PLACEHOLDER_GRADIENTS = [
  "linear-gradient(135deg, #1B2434 0%, #151924 100%)",
  "linear-gradient(135deg, #223022 0%, #182018 100%)",
  "linear-gradient(135deg, #2A2235 0%, #1C1825 100%)",
  "linear-gradient(135deg, #2F2422 0%, #201816 100%)",
];

function BridgeIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M1 8c0-3 2-5 5-5s5 2 5 5" />
      <path d="M3 8V6M6 8V3M9 8V6" />
    </svg>
  );
}

function PaintbrushIcon({
  className,
}: {
  className?: string;
}): React.ReactElement {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M7.5 1.5l3 3-5 5H2.5V7.5z" />
      <path d="M6.5 2.5l3 3" />
    </svg>
  );
}

const normalizeCandidateUrl = (
  value: string | null | undefined,
): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const resolveThumbnailCandidates = (
  shot: ContinuityShot,
  referencedShot: ContinuityShot | null,
): string[] => {
  const candidates = [
    shot.sceneProxyRenderUrl,
    shot.frameBridge?.frameUrl,
    shot.styleReference?.frameUrl,
    referencedShot?.frameBridge?.frameUrl,
    referencedShot?.styleReference?.frameUrl,
    shot.generatedKeyframeUrl,
    referencedShot?.generatedKeyframeUrl,
  ]
    .map((candidate) => normalizeCandidateUrl(candidate))
    .filter((candidate): candidate is string => Boolean(candidate));

  return [...new Set(candidates)];
};

const resolveVideoReference = (
  shot: ContinuityShot,
): { storagePath?: string; assetId?: string } => {
  const videoAssetId = shot.videoAssetId?.trim();
  if (!videoAssetId) return {};
  if (videoAssetId.startsWith("users/")) {
    return { storagePath: videoAssetId };
  }
  return { assetId: videoAssetId };
};

const resolvePlaceholderGradient = (sequenceIndex: number): string =>
  PLACEHOLDER_GRADIENTS[
    Math.abs(sequenceIndex) % PLACEHOLDER_GRADIENTS.length
  ] ?? PLACEHOLDER_GRADIENTS[0]!;

const isGeneratingStatus = (status: ContinuityShot["status"]): boolean =>
  status === "generating-keyframe" || status === "generating-video";

const showConnector = (shot: ContinuityShot, index: number): boolean => {
  if (index === 0) return false;
  return (
    shot.continuityMode === "frame-bridge" ||
    shot.continuityMode === "style-match"
  );
};

interface ShotVisualCardProps {
  shot: ContinuityShot;
  referencedShot: ContinuityShot | null;
  isActive: boolean;
  isGenerating: boolean;
  onShotSelect: (shotId: string) => void;
}

function ShotVisualCard({
  shot,
  referencedShot,
  isActive,
  isGenerating,
  onShotSelect,
}: ShotVisualCardProps): React.ReactElement {
  const thumbnailCandidates = React.useMemo(
    () => resolveThumbnailCandidates(shot, referencedShot),
    [referencedShot, shot],
  );
  const thumbnailCandidateKey = thumbnailCandidates.join("|");
  const [thumbnailIndex, setThumbnailIndex] = React.useState(0);
  const thumbnailUrl =
    thumbnailIndex >= 0 && thumbnailIndex < thumbnailCandidates.length
      ? (thumbnailCandidates[thumbnailIndex] ?? null)
      : null;
  React.useEffect(() => {
    setThumbnailIndex(0);
  }, [thumbnailCandidateKey]);
  const handleThumbnailError = React.useCallback((): void => {
    setThumbnailIndex((current) => {
      const next = current + 1;
      return next < thumbnailCandidates.length
        ? next
        : thumbnailCandidates.length;
    });
  }, [thumbnailCandidates.length]);

  const { storagePath, assetId } = resolveVideoReference(shot);
  const { url: resolvedVideoUrl } = useResolvedMediaUrl({
    kind: "video",
    storagePath: storagePath ?? null,
    assetId: assetId ?? null,
    enabled: !thumbnailUrl && Boolean(storagePath || assetId),
    preferFresh: false,
  });
  const shotLabel = `Shot ${shot.sequenceIndex + 1}`;

  return (
    <button
      type="button"
      onClick={() => onShotSelect(shot.id)}
      className={cn(
        "relative h-[52px] w-20 shrink-0 overflow-hidden rounded-lg border-2 transition-all",
        isActive && "border-accent",
        !isActive &&
          !isGenerating &&
          "border-border hover:border-border-strong",
        isGenerating && "animate-pulse border-amber-400",
      )}
      style={
        isActive ? { boxShadow: "0 0 12px rgba(108, 92, 231, 0.2)" } : undefined
      }
      aria-label={shotLabel}
      data-testid={`shot-thumb-${shot.id}`}
    >
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={`${shotLabel} thumbnail`}
          className="h-full w-full object-cover"
          onError={handleThumbnailError}
        />
      ) : resolvedVideoUrl ? (
        <video
          src={resolvedVideoUrl}
          className="h-full w-full object-cover"
          muted
          playsInline
          preload="metadata"
          data-testid={`shot-video-${shot.id}`}
          aria-label={`${shotLabel} video preview`}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center"
          style={{
            backgroundImage: resolvePlaceholderGradient(shot.sequenceIndex),
          }}
          data-testid={`shot-placeholder-${shot.id}`}
        >
          <span className="text-xs font-semibold text-white/70">
            {shot.sequenceIndex + 1}
          </span>
        </div>
      )}

      <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-[1px] text-meta font-semibold text-white">
        {shot.sequenceIndex + 1}
      </span>

      {shot.status === "completed" && (
        <span
          className="absolute bottom-1 right-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-success/40 bg-success/15 text-success"
          aria-label={`${shotLabel} completed`}
          data-testid={`completed-badge-${shot.id}`}
        >
          <Check className="h-2.5 w-2.5" />
        </span>
      )}
    </button>
  );
}

export function ShotVisualStrip({
  shots,
  currentShotId,
  onShotSelect,
  onAddShot,
}: ShotVisualStripProps): React.ReactElement | null {
  const orderedShots = useMemo(
    () => [...shots].sort((a, b) => a.sequenceIndex - b.sequenceIndex),
    [shots],
  );
  const shotsById = useMemo(
    () => new Map(orderedShots.map((shot) => [shot.id, shot])),
    [orderedShots],
  );

  if (!orderedShots.length) return null;

  return (
    <div className="border-b border-border bg-surface-1 px-3 py-2">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {orderedShots.map((shot, index) => {
          const isActive = currentShotId === shot.id;
          const isGenerating = isGeneratingStatus(shot.status);

          return (
            <React.Fragment key={shot.id}>
              {showConnector(shot, index) && (
                <div
                  className={cn(
                    "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                    shot.continuityMode === "frame-bridge"
                      ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-400"
                      : "border-accent/40 bg-accent/10 text-accent",
                  )}
                  data-testid={`shot-connector-${shot.id}`}
                  aria-hidden="true"
                >
                  {shot.continuityMode === "frame-bridge" ? (
                    <BridgeIcon className="h-3 w-3" />
                  ) : (
                    <PaintbrushIcon className="h-3 w-3" />
                  )}
                </div>
              )}

              <ShotVisualCard
                shot={shot}
                referencedShot={
                  shot.styleReferenceId
                    ? (shotsById.get(shot.styleReferenceId) ?? null)
                    : null
                }
                isActive={isActive}
                isGenerating={isGenerating}
                onShotSelect={onShotSelect}
              />
            </React.Fragment>
          );
        })}

        <button
          type="button"
          onClick={onAddShot}
          className="inline-flex h-[52px] w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-surface-2 text-muted transition-colors hover:border-border-strong hover:text-foreground"
          aria-label="Add shot"
          data-testid="add-shot-button"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default ShotVisualStrip;
