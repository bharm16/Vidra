import React from "react";
import { GalleryThumbnail } from "./GalleryThumbnail";
import type { GalleryPanelProps } from "./types";

export function GalleryPanel({
  generations,
  activeGenerationId,
  onSelectGeneration,
  onClose: _onClose,
}: GalleryPanelProps): React.ReactElement {
  return (
    <aside
      className="pointer-events-none flex h-full w-[128px] flex-none flex-col items-center bg-transparent pb-[3px] pr-[3px] pt-[3px]"
      aria-label="Generations gallery"
      data-testid="gallery-panel"
    >
      <div className="my-auto mr-[3px] flex w-[120px] min-h-96 max-h-[648px] flex-col rounded-md bg-black p-2.5 ps-animate-fade-in">
        <div className="mb-3 h-[100px] w-[100px]" aria-hidden="true" />

        <div className="flex h-5 w-full items-center justify-center pr-2">
          <hr className="h-[3px] w-5 rounded-full border-0 bg-neutral-800" />
        </div>

        <div className="scrollbar-hide pointer-events-none relative -left-1.5 -top-1.5 mb-[-4px] w-[500px] flex-1 snap-y overflow-y-auto pb-1 pl-1.5 pr-0">
          <div className="pointer-events-auto flex w-[100px] flex-col gap-1.5">
            {generations.map((generation) => (
              <GalleryThumbnail
                key={generation.id}
                generation={generation}
                isActive={generation.id === activeGenerationId}
                onClick={() => onSelectGeneration(generation.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
