import React, { useCallback, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import {
  uploadPreviewImage,
  validatePreviewImageFile,
} from "../api/previewApi";

export interface ImageUploadResult {
  imageUrl: string;
  storagePath?: string | undefined;
  viewUrlExpiresAt?: string | undefined;
  sizeBytes?: number | undefined;
  contentType?: string | undefined;
}

interface ImageUploadProps {
  onUploadComplete?: (payload: ImageUploadResult) => void;
  disabled?: boolean;
  className?: string;
}

export function ImageUpload({
  onUploadComplete,
  disabled = false,
  className,
}: ImageUploadProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      const validation = validatePreviewImageFile(file);
      if (!validation.valid) {
        setError(validation.error);
        return;
      }

      setIsUploading(true);
      setError(null);
      try {
        const response = await uploadPreviewImage(file);
        if (!response.success) {
          throw new Error(
            response.error || response.message || "Failed to upload image",
          );
        }
        const imageUrl = response.data.viewUrl || response.data.imageUrl;
        if (!imageUrl) {
          throw new Error("Upload did not return an image URL");
        }

        onUploadComplete?.({
          imageUrl,
          storagePath: response.data.storagePath,
          viewUrlExpiresAt: response.data.viewUrlExpiresAt,
          sizeBytes: response.data.sizeBytes,
          contentType: response.data.contentType,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setIsUploading(false);
      }
    },
    [onUploadComplete],
  );

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || disabled) return;
      void handleFile(file);
      event.target.value = "";
    },
    [disabled, handleFile],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);
      if (disabled) return;

      const file = event.dataTransfer.files?.[0];
      if (file) {
        void handleFile(file);
      }
    },
    [disabled, handleFile],
  );

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-dashed px-3 py-4 text-xs transition-colors",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        isDragging
          ? "border-accent bg-accent/10"
          : "border-border bg-surface-1",
        className,
      )}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!disabled) {
          setIsDragging(true);
        }
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(false);
      }}
      onDrop={handleDrop}
      onClick={() => {
        if (disabled) return;
        inputRef.current?.click();
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      aria-disabled={disabled}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleInputChange}
        disabled={disabled || isUploading}
        aria-label="Upload keyframe image"
      />
      <div className="text-foreground font-semibold">
        {isUploading ? "Uploading image..." : "Upload a keyframe image"}
      </div>
      <div className="text-muted">
        Drag and drop or click to select. PNG, JPEG, or WebP up to 10MB.
      </div>
      {error && <div className="text-error">{error}</div>}
    </div>
  );
}

export default ImageUpload;
