/**
 * FaceSwapPreviewModal
 */

import React, { useEffect } from "react";
import { Loader2, X } from "@promptstudio/system/components/ui";
import { cn } from "@/utils/cn";
import { ImagePreview } from "@/components/MediaViewer/components/ImagePreview";
import { formatCredits } from "@features/generations/config/generationConfig";

interface FaceSwapPreviewModalProps {
  isOpen: boolean;
  isLoading: boolean;
  imageUrl: string | null;
  error: string | null;
  faceSwapCredits: number;
  videoCredits: number | null;
  totalCredits: number | null;
  onClose: () => void;
  onTryDifferent: () => void;
  onProceed: () => void;
}

export function FaceSwapPreviewModal({
  isOpen,
  isLoading,
  imageUrl,
  error,
  faceSwapCredits,
  videoCredits,
  totalCredits,
  onClose,
  onTryDifferent,
  onProceed,
}: FaceSwapPreviewModalProps): React.ReactElement | null {
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const proceedDisabled = isLoading || !imageUrl || Boolean(error);
  const videoCreditsLabel =
    videoCredits !== null ? formatCredits(videoCredits) : "—";

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className={cn(
          "relative z-10 w-full max-w-4xl max-h-[90vh] overflow-auto",
          "bg-tool-panel-inner rounded-xl border border-tool-border-dark shadow-2xl mx-4",
        )}
      >
        <div className="sticky top-0 z-20 flex items-center justify-between px-6 py-4 bg-tool-panel-inner border-b border-tool-border-dark">
          <h2 className="text-lg font-semibold text-white">
            Face Composition Result
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-ghost hover:text-white hover:bg-surface-1"
            aria-label="Close face swap preview modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-accent-runway mb-4" />
              <p className="text-ghost">Composing face swap…</p>
            </div>
          )}

          {!isLoading && (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border border-tool-border-dark bg-tool-surface-inset p-3">
                <ImagePreview src={imageUrl} className="h-[360px] w-full" />
              </div>

              {error ? (
                <div className="text-sm text-amber-400">{error}</div>
              ) : (
                <div className="text-sm text-ghost">
                  Face composition complete ({formatCredits(faceSwapCredits)}{" "}
                  used).
                </div>
              )}
              <div className="text-xs text-ghost">
                Video cost: {videoCreditsLabel}
                {totalCredits !== null
                  ? ` · Total: ${formatCredits(totalCredits)}`
                  : ""}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 justify-end px-6 py-4 border-t border-tool-border-dark">
          <button
            type="button"
            className="h-9 px-3 rounded-lg border border-tool-border-dark text-ghost text-sm font-semibold hover:bg-surface-1"
            onClick={onTryDifferent}
          >
            Try Different Image
          </button>
          <button
            type="button"
            className="h-9 px-3 rounded-lg border border-tool-border-dark text-ghost text-sm font-semibold hover:bg-surface-1"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="h-9 px-4 rounded-lg bg-accent-runway text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={onProceed}
            disabled={proceedDisabled}
          >
            Proceed to Video ({videoCreditsLabel})
          </button>
        </div>
      </div>
    </div>
  );
}

export default FaceSwapPreviewModal;
