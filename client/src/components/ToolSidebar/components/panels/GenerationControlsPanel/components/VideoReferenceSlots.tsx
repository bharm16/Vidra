import React, { useMemo, useState, type ReactElement } from "react";
import { Plus } from "@promptstudio/system/components/ui";
import { cn } from "@/utils/cn";
import type { VideoReferenceImage } from "@features/generation-controls";
import { useResolvedMediaUrl } from "@/hooks/useResolvedMediaUrl";
import { hasGcsSignedUrlParams } from "@/utils/storageUrl";

interface VideoReferenceSlotsProps {
  references: VideoReferenceImage[];
  maxSlots: number;
  isUploadDisabled: boolean;
  onRequestUpload: () => void;
  onUploadFile: (file: File) => void | Promise<void>;
  onRemove: (id: string) => void;
  onUpdateType: (id: string, type: "asset" | "style") => void;
}

function VideoReferenceThumbnail({
  reference,
  index,
}: {
  reference: VideoReferenceImage;
  index: number;
}): ReactElement {
  const shouldResolveUrl = Boolean(
    reference.storagePath ||
      reference.assetId ||
      (reference.url && hasGcsSignedUrlParams(reference.url)),
  );

  const { url: resolvedUrl } = useResolvedMediaUrl({
    kind: "image",
    url: reference.url,
    storagePath: reference.storagePath ?? null,
    assetId: reference.assetId ?? null,
    enabled: shouldResolveUrl,
  });

  return (
    <img
      src={resolvedUrl || reference.url}
      alt={`Video reference ${index + 1}`}
      className="h-full w-full object-cover rounded-md"
    />
  );
}

export function VideoReferenceSlots({
  references,
  maxSlots,
  isUploadDisabled,
  onRequestUpload,
  onUploadFile,
  onRemove,
  onUpdateType,
}: VideoReferenceSlotsProps): ReactElement {
  const [draggingSlot, setDraggingSlot] = useState<number | null>(null);

  const slots = useMemo(
    () =>
      Array.from({ length: maxSlots }, (_, index) => references[index] ?? null),
    [maxSlots, references],
  );

  return (
    <div className="px-1.5 pt-2 pb-1.5 flex gap-2">
      {slots.map((reference, index) => {
        const isEmpty = !reference;
        const canUpload = isEmpty && !isUploadDisabled;

        return (
          <div
            key={reference?.id ?? `video-reference-slot-${index}`}
            className="w-[66px] shrink-0"
          >
            <button
              type="button"
              className={cn(
                "relative h-[62px] w-[62px] rounded-md border bg-surface-1 overflow-hidden transition-colors",
                reference
                  ? "border-tool-border-primary"
                  : "border-dashed border-tool-border-primary",
                canUpload && "cursor-pointer hover:border-tool-text-disabled",
                !canUpload && isEmpty && "opacity-60 cursor-not-allowed",
                draggingSlot === index &&
                  canUpload &&
                  "border-tool-accent-neutral",
              )}
              onClick={() => {
                if (!canUpload) return;
                onRequestUpload();
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!canUpload) return;
                setDraggingSlot(index);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (draggingSlot === index) {
                  setDraggingSlot(null);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!canUpload) return;
                setDraggingSlot(null);
                const file = event.dataTransfer.files?.[0];
                if (file) {
                  void onUploadFile(file);
                }
              }}
              aria-label={
                reference
                  ? `Video reference ${index + 1}`
                  : "Add video reference image"
              }
              aria-disabled={!canUpload}
            >
              {reference ? (
                <>
                  <VideoReferenceThumbnail
                    reference={reference}
                    index={index}
                  />
                  <div className="absolute inset-0 rounded-md bg-black/10 pointer-events-none" />
                </>
              ) : (
                <div className="h-full w-full flex items-center justify-center text-tool-text-dim">
                  <Plus className="w-4 h-4" />
                </div>
              )}
            </button>

            {reference ? (
              <div className="mt-1 flex flex-col gap-1">
                <select
                  value={reference.referenceType}
                  onChange={(event) =>
                    onUpdateType(
                      reference.id,
                      event.target.value as "asset" | "style",
                    )
                  }
                  className="h-5 rounded border border-tool-border-primary bg-tool-surface-deep px-1 text-meta text-ghost"
                  aria-label={`Reference type ${index + 1}`}
                >
                  <option value="asset">Asset</option>
                  <option value="style">Style</option>
                </select>
                <button
                  type="button"
                  className="h-5 rounded border border-tool-border-primary bg-transparent text-meta text-tool-text-dim hover:text-white"
                  onClick={() => onRemove(reference.id)}
                >
                  Clear
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
