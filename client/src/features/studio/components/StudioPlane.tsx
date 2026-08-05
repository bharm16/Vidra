import React from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import { cn } from "@/utils/cn";
import { CANVAS_FOCUS_ATTR } from "@/components/canvas/CanvasViewport";
import type { StudioTurn } from "../api/schemas";
import {
  computeStudioLayout,
  STUDIO_CELL_SIZE,
} from "../lib/computeStudioLayout";

/**
 * The plane's contents: every succeeded image, grouped per turn by the
 * derived layout — computed positions, nothing draggable, nothing stored
 * (ADR-0019 §4).
 *
 * Every cell carries its turn's id as the camera's focus key, so the viewport
 * centers a batch as a whole: a generate lands four siblings, and the group —
 * not whichever cell happens to be first in the DOM — is what the creator sees.
 * `data-live` stays, but only as the studio's own visual mark on the newest
 * batch; the camera no longer reads it.
 */

/** The focus key while the plane is empty — the greeting is the camera target. */
export const STUDIO_EMPTY_FOCUS_ID = "studio-empty";

interface StudioPlaneProps {
  turns: StudioTurn[];
  selectedImageId: string | null;
  onSelectImage: (imageId: string) => void;
}

export function StudioPlane({
  turns,
  selectedImageId,
  onSelectImage,
}: StudioPlaneProps): React.ReactElement {
  const viewUrlByImageId = new Map<string, string>();
  const promptByImageId = new Map<string, string>();
  const groups = turns
    .map((turn) => ({
      turnId: turn.id,
      imageIds: turn.calls.flatMap((call) => {
        if (call.status !== "succeeded" || !call.image) return [];
        if (call.image.viewUrl) {
          viewUrlByImageId.set(call.image.id, call.image.viewUrl);
        }
        promptByImageId.set(call.image.id, call.image.sourcePrompt);
        return [call.image.id];
      }),
    }))
    .filter((group) => group.imageIds.length > 0);

  const items = computeStudioLayout(groups);
  const liveTurnId = groups.at(-1)?.turnId ?? null;

  return (
    <div className="st-plane" data-testid="studio-plane">
      {items.map((item) => {
        const viewUrl = viewUrlByImageId.get(item.imageId);
        const selected = selectedImageId === item.imageId;
        return (
          <Button
            variant="ghost"
            key={item.imageId}
            type="button"
            className={cn("st-plane-cell", selected && "st-cell-selected")}
            data-live={item.turnId === liveTurnId ? "true" : undefined}
            {...{ [CANVAS_FOCUS_ATTR]: item.turnId }}
            style={{
              left: item.x,
              top: item.y,
              width: item.size,
              height: item.size,
            }}
            title={promptByImageId.get(item.imageId)}
            aria-pressed={selected}
            onClick={() => onSelectImage(item.imageId)}
          >
            {viewUrl ? (
              <img
                className="st-cell-img"
                src={viewUrl}
                alt={promptByImageId.get(item.imageId) ?? "Generated image"}
                draggable={false}
              />
            ) : (
              <span className="st-cell-note">Image unavailable</span>
            )}
          </Button>
        );
      })}
      {items.length === 0 ? (
        <div
          className="st-plane-empty"
          data-live="true"
          {...{ [CANVAS_FOCUS_ATTR]: STUDIO_EMPTY_FOCUS_ID }}
          style={{ width: STUDIO_CELL_SIZE * 2, height: STUDIO_CELL_SIZE }}
        >
          Generations land here as groups — pan and zoom to browse.
        </div>
      ) : null}
    </div>
  );
}
