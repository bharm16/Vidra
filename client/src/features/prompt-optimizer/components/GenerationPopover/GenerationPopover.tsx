import React, { useMemo } from "react";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { PopoverDetail } from "./PopoverDetail";
import { PopoverPreview } from "./PopoverPreview";
import type { GenerationPopoverProps } from "./types";

export function GenerationPopover({
  generations,
  activeId,
  onChange,
  onClose,
  onReuse,
  onToggleFavorite,
}: GenerationPopoverProps): React.ReactElement | null {
  const activeGeneration = useMemo(
    () =>
      generations.find((generation) => generation.id === activeId) ??
      generations[0] ??
      null,
    [activeId, generations],
  );

  if (!activeGeneration) return null;

  return (
    <FullscreenDialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
      title="Generation detail viewer"
      description="Preview a generated result, switch versions, and reuse the active prompt and settings."
      contentClassName="bg-[rgba(2,2,4,0.92)] p-0"
    >
      <div className="flex h-full w-full" data-testid="generation-popover">
        <PopoverPreview
          generation={activeGeneration}
          onBack={onClose}
          onToggleFavorite={() =>
            onToggleFavorite(activeGeneration.id, !activeGeneration.isFavorite)
          }
        />
        <PopoverDetail
          generation={activeGeneration}
          generations={generations}
          activeId={activeGeneration.id}
          onChange={onChange}
          onReuse={() => onReuse(activeGeneration.id)}
          onCopyPrompt={() => {
            // no-op hook for analytics when needed
          }}
        />
      </div>
    </FullscreenDialog>
  );
}
