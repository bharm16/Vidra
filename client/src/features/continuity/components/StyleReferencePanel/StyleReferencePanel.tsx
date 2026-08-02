import React, { useMemo, useState } from "react";
import type { ContinuitySession, ContinuityShot } from "../../types";
import { useStyleReference } from "../../hooks/useStyleReference";

interface StyleReferencePanelProps {
  session: ContinuitySession;
  selectedShot?: ContinuityShot | null;
  onUpdateShotStyleReference?: (
    shotId: string,
    styleReferenceId: string | null,
  ) => Promise<void> | void;
  onUpdatePrimaryReference?: (input: {
    sourceVideoId?: string;
    sourceImageUrl?: string;
  }) => Promise<void> | void;
}

export function StyleReferencePanel({
  session,
  selectedShot,
  onUpdateShotStyleReference,
  onUpdatePrimaryReference,
}: StyleReferencePanelProps): React.ReactElement {
  const reference = useStyleReference(session, selectedShot ?? null);
  const [isUpdatingPrimary, setIsUpdatingPrimary] = useState(false);
  const [primaryVideoId, setPrimaryVideoId] = useState("");
  const [primaryImageUrl, setPrimaryImageUrl] = useState("");
  const [isSavingPrimary, setIsSavingPrimary] = useState(false);

  const referenceOptions = useMemo(() => {
    const options: Array<{ label: string; value: string | null }> = [
      { label: "Primary reference", value: null },
    ];
    session.shots.forEach((shot) => {
      options.push({
        label: `Shot ${shot.sequenceIndex + 1}`,
        value: shot.id,
      });
    });
    return options;
  }, [session.shots]);

  const handleUpdateStyleReference = async (
    event: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    if (!selectedShot || !onUpdateShotStyleReference) return;
    const value = event.target.value || "primary";
    const resolved = value === "primary" ? null : value;
    await onUpdateShotStyleReference(selectedShot.id, resolved);
  };

  const handleUpdatePrimaryReference = async () => {
    if (!onUpdatePrimaryReference) return;
    if (!primaryVideoId && !primaryImageUrl) return;
    setIsSavingPrimary(true);
    try {
      await onUpdatePrimaryReference({
        ...(primaryVideoId ? { sourceVideoId: primaryVideoId } : {}),
        ...(primaryImageUrl ? { sourceImageUrl: primaryImageUrl } : {}),
      });
      setPrimaryVideoId("");
      setPrimaryImageUrl("");
      setIsUpdatingPrimary(false);
    } finally {
      setIsSavingPrimary(false);
    }
  };

  const colors = reference?.analysisMetadata?.dominantColors ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">
          Style Reference
        </h2>
        <button
          type="button"
          className="text-xs text-muted hover:text-foreground transition-colors"
          onClick={() => setIsUpdatingPrimary((prev) => !prev)}
        >
          {isUpdatingPrimary ? "Cancel" : "Update primary"}
        </button>
      </div>

      {reference ? (
        <div className="space-y-3">
          <img
            src={reference.frameUrl}
            alt="Style reference"
            className="h-48 w-full rounded-lg object-cover"
          />
          {reference.analysisMetadata && (
            <div className="space-y-2 text-sm text-muted">
              <div>
                Lighting: {reference.analysisMetadata.lightingDescription}
              </div>
              <div>Mood: {reference.analysisMetadata.moodDescription}</div>
              {colors.length > 0 && (
                <div className="flex items-center gap-2">
                  <span>Palette:</span>
                  <div className="flex gap-1">
                    {colors.map((color) => (
                      <span
                        key={color}
                        title={color}
                        className="h-4 w-4 rounded-full border border-border"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted">
          No style reference available.
        </div>
      )}

      {selectedShot && onUpdateShotStyleReference && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted">
            Style source for selected shot
          </label>
          <select
            className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm"
            onChange={handleUpdateStyleReference}
            value={selectedShot.styleReferenceId ?? "primary"}
          >
            {referenceOptions.map((option) => (
              <option
                key={option.value ?? "primary"}
                value={option.value ?? "primary"}
                disabled={option.value === selectedShot.id}
              >
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {isUpdatingPrimary && (
        <div className="space-y-2 rounded-lg border border-border bg-surface-2 p-3">
          <div className="text-xs text-muted">
            Replace the primary style reference.
          </div>
          <input
            type="text"
            value={primaryVideoId}
            onChange={(event) => setPrimaryVideoId(event.target.value)}
            placeholder="Source video asset ID"
            className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm"
          />
          <div className="text-center text-xs text-muted">or</div>
          <input
            type="text"
            value={primaryImageUrl}
            onChange={(event) => setPrimaryImageUrl(event.target.value)}
            placeholder="Source image URL"
            className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleUpdatePrimaryReference}
            disabled={isSavingPrimary || (!primaryVideoId && !primaryImageUrl)}
            className={`w-full rounded-md px-3 py-2 text-sm font-medium ${
              isSavingPrimary || (!primaryVideoId && !primaryImageUrl)
                ? "bg-raise text-muted cursor-not-allowed"
                : "bg-accent text-white"
            }`}
          >
            {isSavingPrimary ? "Updating..." : "Update reference"}
          </button>
        </div>
      )}
    </div>
  );
}

export default StyleReferencePanel;
