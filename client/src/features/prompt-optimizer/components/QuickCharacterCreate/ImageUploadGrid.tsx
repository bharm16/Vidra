import React, { useCallback } from "react";
import { Plus, Star, X } from "@promptstudio/system/components/ui";
import { cn } from "@/utils/cn";
import type { UploadImageItem } from "./hooks/useQuickCharacterCreate";

interface ImageUploadGridProps {
  images: UploadImageItem[];
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  onSetPrimary: (index: number) => void;
  maxImages: number;
}

export function ImageUploadGrid({
  images,
  onAdd,
  onRemove,
  onSetPrimary,
  maxImages,
}: ImageUploadGridProps): React.ReactElement {
  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const files = Array.from(event.dataTransfer.files || []).filter((file) =>
        file.type.startsWith("image/"),
      );
      if (files.length > 0) {
        onAdd(files.slice(0, maxImages - images.length));
      }
    },
    [images.length, maxImages, onAdd],
  );

  return (
    <div
      className="space-y-2"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="grid grid-cols-4 gap-2">
        {images.map((image, index) => (
          <div
            key={index}
            className="bg-surface-2 relative aspect-square overflow-hidden rounded-lg"
          >
            <img
              src={image.preview}
              alt=""
              className="h-full w-full object-cover"
            />
            <button
              type="button"
              onClick={() => onSetPrimary(index)}
              className={cn(
                "absolute left-1 top-1 rounded bg-black/50 p-1 text-white/60 transition",
                image.isPrimary && "text-foreground",
              )}
              title={image.isPrimary ? "Primary image" : "Set as primary"}
            >
              <Star
                className="h-4 w-4"
                fill={image.isPrimary ? "currentColor" : "none"}
              />
            </button>
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="hover:bg-danger absolute right-1 top-1 rounded bg-black/50 p-1 text-white/70 transition"
              title="Remove image"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}

        {images.length < maxImages && (
          <label className="border-border text-muted hover:border-border-strong hover:bg-surface-2 flex aspect-square cursor-pointer items-center justify-center rounded-lg border-2 border-dashed transition">
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(event) =>
                onAdd(
                  Array.from(event.target.files || []).slice(
                    0,
                    maxImages - images.length,
                  ),
                )
              }
              className="hidden"
            />
            <Plus className="h-6 w-6" />
          </label>
        )}
      </div>

      {images.length === 0 && (
        <p className="text-muted text-center text-xs">
          Drop images here or click to upload
        </p>
      )}
    </div>
  );
}

export default ImageUploadGrid;
