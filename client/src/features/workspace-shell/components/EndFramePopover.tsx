import React, { useCallback, useMemo, useRef, useState } from "react";
import { X, Image } from "@promptstudio/system/components/ui";
import type {
  KeyframeTile,
  SidebarUploadedImage,
} from "@features/generation-controls";
import { cn } from "@/utils/cn";
import { useResolvedMediaUrl } from "@/hooks/useResolvedMediaUrl";
import { hasGcsSignedUrlParams } from "@/utils/storageUrl";

interface EndFramePopoverProps {
  endFrame: KeyframeTile | null;
  onSetEndFrame: (tile: KeyframeTile) => void;
  onClearEndFrame: () => void;
  onUploadSidebarImage?:
    | ((file: File) => Promise<SidebarUploadedImage | null>)
    | undefined;
  disabled?: boolean | undefined;
}

export function EndFramePopover({
  endFrame,
  onSetEndFrame,
  onClearEndFrame,
  onUploadSidebarImage,
  disabled = false,
}: EndFramePopoverProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const shouldResolveUrl = Boolean(
    endFrame &&
      (endFrame.storagePath ||
        endFrame.assetId ||
        hasGcsSignedUrlParams(endFrame.url)),
  );

  const { url: resolvedPreviewUrl } = useResolvedMediaUrl({
    kind: "image",
    url: endFrame?.url ?? null,
    storagePath: endFrame?.storagePath ?? null,
    assetId: endFrame?.assetId ?? null,
    enabled: shouldResolveUrl,
  });

  const previewUrl = useMemo(() => {
    if (!endFrame) return null;
    return resolvedPreviewUrl || endFrame.url;
  }, [endFrame, resolvedPreviewUrl]);

  const setFrameFromUpload = useCallback(
    (uploaded: SidebarUploadedImage): void => {
      onSetEndFrame({
        id: `end-frame-upload-${Date.now()}`,
        url: uploaded.url,
        source: "upload",
        ...(uploaded.storagePath ? { storagePath: uploaded.storagePath } : {}),
        ...(uploaded.viewUrlExpiresAt
          ? { viewUrlExpiresAt: uploaded.viewUrlExpiresAt }
          : {}),
      });
    },
    [onSetEndFrame],
  );

  const handleUpload = useCallback(
    async (file: File): Promise<void> => {
      if (disabled) return;

      if (onUploadSidebarImage) {
        setIsUploading(true);
        try {
          const uploaded = await onUploadSidebarImage(file);
          if (!uploaded) return;
          setFrameFromUpload(uploaded);
        } finally {
          setIsUploading(false);
        }
        return;
      }

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });

      onSetEndFrame({
        id: `end-frame-local-${Date.now()}`,
        url: dataUrl,
        source: "upload",
      });
    },
    [disabled, onSetEndFrame, onUploadSidebarImage, setFrameFromUpload],
  );

  return (
    <div className="relative" data-testid="end-frame-popover-root">
      <button
        type="button"
        data-testid="end-frame-trigger"
        className={cn(
          "inline-flex h-[30px] items-center gap-[5px] rounded-full border border-surface-2 px-2.5 text-xs font-semibold transition-colors",
          "bg-tool-nav-hover text-foreground hover:bg-tool-nav-active hover:text-foreground",
          disabled && "cursor-not-allowed opacity-60",
        )}
        onClick={() => {
          if (disabled) return;
          setIsOpen((prev) => !prev);
        }}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        disabled={disabled}
      >
        {previewUrl ? (
          <>
            <div
              className="h-[14px] w-5 flex-shrink-0 rounded-[3px] border border-tool-nav-active bg-cover bg-center"
              style={{ backgroundImage: `url(${previewUrl})` }}
            />
            <span className="text-xs text-foreground">End frame</span>
          </>
        ) : (
          <>
            <span className="flex opacity-60">
              <Image size={13} />
            </span>
            End frame
          </>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleUpload(file);
          event.target.value = "";
        }}
        aria-label="Upload end frame image"
      />

      {isOpen ? (
        <div
          role="dialog"
          data-testid="end-frame-popover"
          className="absolute bottom-[calc(100%+8px)] left-0 z-popover w-[220px] overflow-hidden rounded-xl border border-tool-nav-active bg-tool-surface-card shadow-[0_8px_32px_rgba(0,0,0,0.5)] animate-in fade-in slide-in-from-bottom-2"
          onClick={(event) => event.stopPropagation()}
        >
          {previewUrl ? (
            <>
              <div className="relative aspect-video bg-tool-surface-deep">
                <img
                  src={previewUrl}
                  alt="End frame"
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  data-testid="end-frame-clear-button"
                  className="absolute right-1.5 top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-md bg-black/50 text-white/60 transition-colors hover:text-white/90"
                  onClick={() => onClearEndFrame()}
                >
                  <X size={10} />
                </button>
              </div>
              <div className="px-2.5 py-2 text-[10px] text-tool-text-subdued">
                Used as interpolation end frame.
              </div>
            </>
          ) : (
            <div className="p-4 text-center">
              <button
                type="button"
                className="flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-[1.5px] border-dashed border-tool-nav-active py-5 transition-colors hover:border-tool-text-disabled"
                onClick={() => inputRef.current?.click()}
                disabled={isUploading || disabled}
              >
                <span className="flex text-tool-text-label">
                  <Image size={13} />
                </span>
                <span className="text-[11px] text-tool-text-subdued">
                  {isUploading ? "Uploading…" : "Drop image or click to upload"}
                </span>
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
