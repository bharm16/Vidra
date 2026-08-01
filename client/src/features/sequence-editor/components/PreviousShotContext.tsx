import React from "react";
import type { ContinuityShot } from "@/features/continuity/types";
import type { SessionContinuityMode } from "@shared/types/session";
import { cn } from "@/utils/cn";
import { useResolvedMediaUrl } from "@/hooks/useResolvedMediaUrl";

interface PreviousShotContextProps {
  previousShot: ContinuityShot;
  continuityMode: SessionContinuityMode;
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

const resolveImageUrl = (shot: ContinuityShot): string | null =>
  shot.frameBridge?.frameUrl ??
  shot.styleReference?.frameUrl ??
  shot.generatedKeyframeUrl ??
  null;

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

const resolveBadge = (
  mode: SessionContinuityMode,
): { label: string; className: string; icon: React.ReactNode } => {
  if (mode === "frame-bridge") {
    return {
      label: "Last frame ->",
      className: "border-cyan-400/40 bg-cyan-400/10 text-cyan-400",
      icon: <BridgeIcon className="h-3 w-3" />,
    };
  }

  if (mode === "style-match") {
    return {
      label: "Style ref ->",
      className: "border-accent/40 bg-accent/10 text-accent",
      icon: <PaintbrushIcon className="h-3 w-3" />,
    };
  }

  return {
    label: "Independent",
    className: "border-border bg-black/70 text-muted",
    icon: (
      <span
        className="inline-block h-1.5 w-1.5 rounded-full bg-current"
        aria-hidden="true"
      />
    ),
  };
};

export function PreviousShotContext({
  previousShot,
  continuityMode,
}: PreviousShotContextProps): React.ReactElement {
  const imageUrl = resolveImageUrl(previousShot);
  const { storagePath, assetId } = React.useMemo(
    () => resolveVideoReference(previousShot),
    [previousShot],
  );
  const { url: resolvedVideoUrl } = useResolvedMediaUrl({
    kind: "video",
    storagePath: storagePath ?? null,
    assetId: assetId ?? null,
    enabled: !imageUrl && Boolean(storagePath || assetId),
    preferFresh: false,
  });
  const badge = resolveBadge(continuityMode);

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface-2">
      <header className="flex items-center justify-between border-b border-border bg-black/20 px-3 py-2">
        <span className="text-meta font-semibold uppercase tracking-wide text-muted">
          Previous shot
        </span>
        <span className="text-meta text-muted">
          Shot {previousShot.sequenceIndex + 1}
        </span>
      </header>

      <div className="relative h-[90px] w-full">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`Shot ${previousShot.sequenceIndex + 1} context frame`}
            className="h-full w-full object-cover"
          />
        ) : resolvedVideoUrl ? (
          <video
            src={resolvedVideoUrl}
            className="h-full w-full object-cover"
            muted
            playsInline
            preload="metadata"
            data-testid="previous-shot-video"
            aria-label={`Shot ${previousShot.sequenceIndex + 1} context video`}
          />
        ) : (
          <div
            className="h-full w-full"
            style={{
              backgroundImage: resolvePlaceholderGradient(
                previousShot.sequenceIndex,
              ),
            }}
          />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <span
          className={cn(
            "absolute bottom-2 left-2 inline-flex items-center gap-1 rounded px-2 py-1 text-meta font-semibold backdrop-blur-sm",
            badge.className,
          )}
        >
          {badge.icon}
          {badge.label}
        </span>
      </div>

      <p className="ps-line-clamp-2 px-3 py-2 text-xs text-muted">
        {previousShot.userPrompt || "No prompt yet."}
      </p>
    </section>
  );
}

export default PreviousShotContext;
