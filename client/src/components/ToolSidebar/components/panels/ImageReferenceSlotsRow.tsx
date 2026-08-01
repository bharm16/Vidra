import React, { useMemo, type ReactElement } from "react";
import { Highlighter, Plus, Upload } from "@promptstudio/system/components/ui";
import { cn } from "@utils/cn";
import type { KeyframeTile } from "@components/ToolSidebar/types";
import { useResolvedMediaUrl } from "@/hooks/useResolvedMediaUrl";
import { hasGcsSignedUrlParams } from "@/utils/storageUrl";

interface ImageReferenceSlotsRowProps {
  keyframes: KeyframeTile[];
  isUploadDisabled: boolean;
  onRequestUpload: () => void;
  onRemoveKeyframe: (id: string) => void;
}

function ReferenceSlotImage({
  tile,
  index,
}: {
  tile: KeyframeTile;
  index: number;
}): ReactElement {
  const shouldResolveUrl = Boolean(
    tile.storagePath ||
      tile.assetId ||
      (tile.url && hasGcsSignedUrlParams(tile.url)),
  );

  const { url: resolvedUrl } = useResolvedMediaUrl({
    kind: "image",
    url: tile.url,
    storagePath: tile.storagePath ?? null,
    assetId: tile.assetId ?? null,
    enabled: shouldResolveUrl,
  });

  return (
    <img
      src={resolvedUrl || tile.url}
      alt={`Reference ${index + 1}`}
      className="w-full h-full object-cover rounded-lg"
    />
  );
}

export function ImageReferenceSlotsRow({
  keyframes,
  isUploadDisabled,
  onRequestUpload,
  onRemoveKeyframe,
}: ImageReferenceSlotsRowProps): ReactElement {
  const keyframeSlots = useMemo(
    () => Array.from({ length: 3 }, (_, index) => keyframes[index] ?? null),
    [keyframes],
  );

  return (
    <div className="flex gap-1.5 pt-3 px-3" data-layout-mode="single-row">
      {keyframeSlots.map((tile, index) => {
        const isEmpty = !tile;
        const canUpload = isEmpty && !isUploadDisabled;
        return (
          <div
            key={tile?.id ?? `reference-slot-${index}`}
            className="relative block min-w-[62px] w-[110px] h-[62px] group"
          >
            <button
              type="button"
              className={cn(
                "w-full h-full flex items-center justify-center",
                "bg-surface-1 rounded-lg shadow-[inset_0_0_0_1px_#2C3037]",
                "overflow-hidden",
                isEmpty && "cursor-pointer",
                isEmpty && !canUpload && "opacity-60 cursor-not-allowed",
              )}
              onClick={() => {
                if (!canUpload) return;
                onRequestUpload();
              }}
              aria-label="Add an image reference"
              aria-disabled={!canUpload}
            >
              {tile ? (
                <ReferenceSlotImage tile={tile} index={index} />
              ) : (
                <Plus className="w-4 h-4 text-white" />
              )}
            </button>

            {tile ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemoveKeyframe(tile.id);
                }}
                className="absolute right-1 top-1 rounded-md bg-surface-1 px-2 py-1 text-meta text-ghost shadow-[inset_0_0_0_1px_#2C3037]"
              >
                Clear
              </button>
            ) : (
              <div className="absolute inset-0 hidden items-center justify-center gap-2 bg-surface-1 rounded-lg shadow-[inset_0_0_0_1px_#2C3037] group-hover:flex">
                <button
                  type="button"
                  className="w-6 h-6 flex items-center justify-center bg-transparent border border-tool-border-primary rounded text-ghost cursor-pointer hover:bg-tool-panel-inner"
                  aria-label="Sketch your scene"
                  onClick={() => {
                    // placeholder for future sketch flow
                  }}
                  disabled={!canUpload}
                >
                  <Highlighter className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  className="w-6 h-6 flex items-center justify-center bg-white rounded text-black cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Add an image reference"
                  onClick={() => {
                    if (!canUpload) return;
                    onRequestUpload();
                  }}
                  disabled={!canUpload}
                >
                  <Upload className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
