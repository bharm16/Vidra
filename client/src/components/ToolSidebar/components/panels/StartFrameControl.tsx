import React, { useCallback, useState, type ReactElement } from "react";
import { cn } from "@utils/cn";
import type { KeyframeTile } from "@components/ToolSidebar/types";
import { useResolvedMediaUrl } from "@/hooks/useResolvedMediaUrl";
import { hasGcsSignedUrlParams } from "@/utils/storageUrl";

interface StartFrameControlProps {
  startFrame: KeyframeTile | null;
  isUploadDisabled: boolean;
  onUploadFile: (file: File) => void | Promise<void>;
  onRequestUpload: () => void;
  onClear: () => void;
}

function StartFramePreview({ tile }: { tile: KeyframeTile }): ReactElement {
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
      alt="Start frame"
      className="h-full w-full object-cover rounded-lg"
    />
  );
}

export function StartFrameControl({
  startFrame,
  isUploadDisabled,
  onUploadFile,
  onRequestUpload,
  onClear,
}: StartFrameControlProps): ReactElement {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);
      if (isUploadDisabled) return;
      const file = event.dataTransfer.files?.[0];
      if (file) {
        void onUploadFile(file);
      }
    },
    [isUploadDisabled, onUploadFile],
  );

  return (
    <div className="space-y-1.5">
      {startFrame && (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={onClear}
            className="h-5 rounded-md border border-tool-nav-active bg-tool-surface-deep/90 px-1.5 text-meta text-tool-text-dim transition-colors hover:text-white"
          >
            Clear
          </button>
        </div>
      )}
      <button
        type="button"
        className={cn(
          "relative h-9 w-[116.65px] rounded-lg border bg-tool-surface-card px-3 py-2 transition-colors",
          startFrame
            ? "border-tool-text-disabled"
            : "border-dashed border-tool-nav-active",
          isUploadDisabled && "cursor-not-allowed opacity-60",
          !isUploadDisabled && "cursor-pointer",
          isDragging && !isUploadDisabled && "border-tool-accent-neutral",
        )}
        onClick={() => {
          if (isUploadDisabled) return;
          onRequestUpload();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!isUploadDisabled) {
            setIsDragging(true);
          }
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsDragging(false);
        }}
        onDrop={handleDrop}
        aria-disabled={isUploadDisabled}
      >
        {startFrame ? (
          <>
            <StartFramePreview tile={startFrame} />
            <div className="absolute inset-0 rounded-lg bg-black/15 pointer-events-none" />
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white">
            <span className="text-meta font-medium">Start frame</span>
          </div>
        )}
      </button>
    </div>
  );
}
