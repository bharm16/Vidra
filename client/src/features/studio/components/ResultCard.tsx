import React from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import { cn } from "@/utils/cn";
import type { StudioTurn } from "../api/schemas";

/**
 * One turn's images inside the thread: a 2×2 grid for 4-call generates, a
 * single cell for 1-call edits/transforms — a 1-image turn is first-class,
 * never a grid with blanks (plan: "Partial and failed turns").
 */

interface ResultCardProps {
  turn: StudioTurn;
  selectedImageId: string | null;
  onSelect: (imageId: string) => void;
}

export function ResultCard({
  turn,
  selectedImageId,
  onSelect,
}: ResultCardProps): React.ReactElement {
  const single = turn.calls.length === 1;
  return (
    <div
      className={cn(
        "st-result",
        single ? "st-result-single" : "st-result-grid",
      )}
      data-testid={`studio-result-${turn.id}`}
    >
      {turn.calls.map((call) => {
        if (call.status === "succeeded" && call.image) {
          const image = call.image;
          const selected = selectedImageId === image.id;
          return (
            <Button variant="ghost"
              key={call.index}
              type="button"
              className={cn("st-cell", selected && "st-cell-selected")}
              title={image.sourcePrompt}
              aria-pressed={selected}
              onClick={() => onSelect(image.id)}
            >
              {image.viewUrl ? (
                <img
                  className="st-cell-img"
                  src={image.viewUrl}
                  alt={image.sourcePrompt}
                />
              ) : (
                <span className="st-cell-note">Image unavailable</span>
              )}
            </Button>
          );
        }
        if (call.status === "failed") {
          return (
            <div key={call.index} className="st-cell st-cell-failed">
              <span className="st-cell-note">{call.error ?? "Failed"}</span>
            </div>
          );
        }
        return (
          <div key={call.index} className="st-cell st-cell-running">
            <span className="st-pulse" aria-label="Generating" />
          </div>
        );
      })}
    </div>
  );
}
