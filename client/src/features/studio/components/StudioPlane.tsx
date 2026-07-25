import React from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import { cn } from "@/utils/cn";
import type { StudioTurn } from "../api/schemas";
import {
  computeStudioLayout,
  STUDIO_CELL_SIZE,
} from "../lib/computeStudioLayout";

/**
 * The plane's contents: every succeeded image, grouped per turn by the
 * derived layout — computed positions, nothing draggable, nothing stored
 * (ADR-0019 §4). The newest group carries data-live so the shared camera
 * centers on it.
 */

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
          style={{ width: STUDIO_CELL_SIZE * 2, height: STUDIO_CELL_SIZE }}
        >
          Generations land here as groups — pan and zoom to browse.
        </div>
      ) : null}
    </div>
  );
}
