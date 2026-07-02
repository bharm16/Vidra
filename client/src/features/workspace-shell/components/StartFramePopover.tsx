import React, { useCallback, useMemo, useRef, useState } from "react";
import { X, Image } from "@promptstudio/system/components/ui";
import type { CameraPath } from "@/features/convergence/types";
import type { KeyframeTile } from "@features/generation-controls";
import { cn } from "@/utils/cn";
import { FEATURES } from "@/config/features.config";
import { useResolvedMediaUrl } from "@/hooks/useResolvedMediaUrl";
import { hasGcsSignedUrlParams } from "@/utils/storageUrl";

interface StartFramePopoverProps {
  startFrame: KeyframeTile | null;
  cameraMotion: CameraPath | null;
  onSetStartFrame: (tile: KeyframeTile) => void;
  onClearStartFrame: () => void;
  onOpenMotion: () => void;
  onStartFrameUpload?: ((file: File) => void | Promise<void>) | undefined;
  disabled?: boolean | undefined;
}

export function StartFramePopover({
  startFrame,
  cameraMotion,
  onSetStartFrame,
  onClearStartFrame,
  onOpenMotion,
  onStartFrameUpload,
  disabled = false,
}: StartFramePopoverProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const shouldResolveUrl = Boolean(
    startFrame &&
      (startFrame.storagePath ||
        startFrame.assetId ||
        hasGcsSignedUrlParams(startFrame.url)),
  );

  const { url: resolvedPreviewUrl } = useResolvedMediaUrl({
    kind: "image",
    url: startFrame?.url ?? null,
    storagePath: startFrame?.storagePath ?? null,
    assetId: startFrame?.assetId ?? null,
    enabled: shouldResolveUrl,
  });

  const previewUrl = useMemo(() => {
    if (!startFrame) return null;
    return resolvedPreviewUrl || startFrame.url;
  }, [resolvedPreviewUrl, startFrame]);

  const handleUpload = useCallback(
    async (file: File): Promise<void> => {
      if (disabled) return;

      if (onStartFrameUpload) {
        const result = onStartFrameUpload(file);
        if (result && typeof (result as Promise<void>).then === "function") {
          setIsUploading(true);
          try {
            await result;
          } finally {
            setIsUploading(false);
          }
        }
        return;
      }

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });

      onSetStartFrame({
        id: `start-frame-local-${Date.now()}`,
        url: dataUrl,
        source: "upload",
      });
    },
    [disabled, onSetStartFrame, onStartFrameUpload],
  );

  return (
    <div className="relative" data-testid="start-frame-popover-root">
      {/*
        Trigger — icon-only when no frame is selected (matches the screenshot's
        leftmost image-icon chip), thumbnail when one is. Camera-motion label
        moves to the popover; the chip stays compact.
        aria-label keeps "Start frame" available to assistive tech / tooltip.
      */}
      <button
        type="button"
        data-testid="start-frame-trigger"
        aria-label={
          previewUrl && cameraMotion?.label
            ? `Start frame — ${cameraMotion.label}`
            : "Start frame"
        }
        title="Start frame"
        className={cn(
          "inline-flex h-[28px] items-center justify-center gap-[5px] rounded-md px-2 text-xs transition-colors",
          "text-tool-text-muted hover:text-foreground",
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
          <div
            className="h-[18px] w-6 flex-shrink-0 rounded-[3px] bg-cover bg-center"
            style={{ backgroundImage: `url(${previewUrl})` }}
            aria-hidden="true"
          />
        ) : (
          <Image size={14} aria-hidden="true" />
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
        aria-label="Upload start frame image"
      />

      {/* Popover — 220px wide, opens upward */}
      {isOpen ? (
        <div
          role="dialog"
          data-testid="start-frame-popover"
          className="border-tool-nav-active bg-tool-surface-card animate-in fade-in slide-in-from-bottom-2 absolute bottom-[calc(100%+8px)] left-0 z-popover w-[220px] overflow-hidden rounded-xl border shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
          onClick={(e) => e.stopPropagation()}
        >
          {previewUrl ? (
            <>
              {/* Thumbnail with close button */}
              <div className="bg-tool-surface-deep relative aspect-video">
                <img
                  src={previewUrl}
                  alt="Start frame"
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  data-testid="start-frame-clear-button"
                  className="absolute right-1.5 top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-md bg-black/50 text-white/60 transition-colors hover:text-white/90"
                  onClick={() => onClearStartFrame()}
                >
                  <X size={10} />
                </button>
              </div>

              {/* Camera motion pills — depth-warp picker is part of the
                  frozen convergence stack (ADR-0002) */}
              {FEATURES.CONVERGENCE_UI ? (
                <div className="px-2.5 py-2">
                  <div className="text-tool-text-label mb-1.5 text-[10px] font-semibold tracking-[0.06em]">
                    CAMERA MOTION
                  </div>
                  <button
                    type="button"
                    data-testid="start-frame-motion-button"
                    className={cn(
                      "h-[26px] rounded-md border px-2 text-[11px] transition-colors",
                      cameraMotion
                        ? "border-tool-accent-neutral/40 bg-tool-accent-neutral/8 text-tool-accent-neutral"
                        : "border-tool-nav-active text-tool-text-dim hover:border-tool-text-disabled",
                    )}
                    onClick={onOpenMotion}
                  >
                    {cameraMotion?.label ?? "Select motion…"}
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            /* Empty upload state */
            <div className="p-4 text-center">
              <button
                type="button"
                className="border-tool-nav-active hover:border-tool-text-disabled flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-[1.5px] border-dashed py-5 transition-colors"
                onClick={() => inputRef.current?.click()}
                disabled={isUploading}
              >
                <span className="text-tool-text-label flex">
                  <Image size={13} />
                </span>
                <span className="text-tool-text-subdued text-[11px]">
                  {isUploading ? "Uploading…" : "Drop image or click to upload"}
                </span>
              </button>
              <span className="text-tool-text-label mt-2 block text-[10px]">
                Or select from storyboard previews
              </span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
