import React from "react";
import type { ContinuityShot } from "../../types";

interface ShotCardProps {
  shot: ContinuityShot;
  isSelected: boolean;
  onSelect?: (shotId: string) => void;
  onGenerate?: (shotId: string) => void;
  onView?: (assetId: string) => void;
}

const STATUS_STYLES: Record<ContinuityShot["status"], string> = {
  draft: "text-muted",
  "generating-keyframe": "text-accent",
  "generating-video": "text-accent",
  completed: "text-success",
  failed: "text-error",
};

export function ShotCard({
  shot,
  isSelected,
  onSelect,
  onGenerate,
  onView,
}: ShotCardProps): React.ReactElement {
  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        isSelected ? "border-accent bg-accent/10" : "border-border bg-surface-2"
      }`}
    >
      <button
        type="button"
        className="w-full text-left"
        onClick={() => onSelect?.(shot.id)}
      >
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">
            Shot {shot.sequenceIndex + 1}
          </div>
          <div className={`text-xs font-medium ${STATUS_STYLES[shot.status]}`}>
            {shot.status.replace("-", " ")}
          </div>
        </div>
        <div className="mt-1 text-xs text-muted ps-line-clamp-2">
          {shot.userPrompt}
        </div>
        {shot.continuityMechanismUsed && (
          <div className="mt-2 text-meta text-muted">
            Continuity: {shot.continuityMechanismUsed}
          </div>
        )}
        {shot.styleTransferApplied && (
          <div className="mt-1 text-meta text-muted">
            Style transfer applied
          </div>
        )}
        {shot.styleDegraded && (
          <div className="mt-1 text-meta text-warning">
            Style degraded
            {shot.styleDegradedReason ? ` (${shot.styleDegradedReason})` : ""}
          </div>
        )}
        {(shot.styleScore !== undefined ||
          shot.identityScore !== undefined) && (
          <div className="mt-1 text-meta text-muted">
            {shot.styleScore !== undefined && (
              <span className="mr-2">Style {shot.styleScore.toFixed(2)}</span>
            )}
            {shot.identityScore !== undefined && (
              <span>Identity {shot.identityScore.toFixed(2)}</span>
            )}
          </div>
        )}
        {shot.error && (
          <div className="mt-2 text-xs text-error">{shot.error}</div>
        )}
      </button>

      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs text-muted">
          {shot.generatedAt
            ? `Generated ${new Date(shot.generatedAt).toLocaleString()}`
            : ""}
        </div>
        <div className="flex items-center gap-2">
          {shot.videoAssetId && onView && (
            <button
              type="button"
              className="text-xs text-muted hover:text-foreground"
              onClick={() => onView(shot.videoAssetId!)}
            >
              View
            </button>
          )}
          {onGenerate && (
            <button
              type="button"
              className="rounded-md bg-foreground px-2 py-1 text-xs text-white"
              onClick={() => onGenerate(shot.id)}
            >
              Generate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ShotCard;
