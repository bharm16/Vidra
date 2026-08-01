import React from "react";
import { ChevronDown } from "@promptstudio/system/components/ui";
import type { KeyframeTile } from "@components/ToolSidebar/types";
import type {
  ExtendVideoSource,
  VideoReferenceImage,
} from "@features/generation-controls";
import { StartFrameControl } from "@components/ToolSidebar/components/panels/StartFrameControl";
import { EndFrameControl } from "@components/ToolSidebar/components/panels/EndFrameControl";
import { VideoPromptToolbar } from "./VideoPromptToolbar";
import { ReferencesOnboardingCard } from "./ReferencesOnboardingCard";
import { VideoReferenceSlots } from "./VideoReferenceSlots";
import { formatCredits } from "@features/generations/config/generationConfig";

interface VideoTabContentProps {
  startFrame: KeyframeTile | null;
  endFrame: KeyframeTile | null;
  videoReferenceImages: VideoReferenceImage[];
  extendVideo: ExtendVideoSource | null;
  supportsStartFrame: boolean;
  supportsEndFrame: boolean;
  supportsReferenceImages: boolean;
  supportsExtendVideo: boolean;
  maxReferenceImages: number;
  isUploadDisabled: boolean;
  isEndFrameUploadDisabled: boolean;
  onRequestUpload: () => void;
  onUploadFile: (file: File) => void | Promise<void>;
  onClearStartFrame: () => void;
  onRequestEndFrameUpload: () => void;
  onEndFrameUpload: (file: File) => void | Promise<void>;
  onClearEndFrame: () => void;
  onRequestVideoReferenceUpload: () => void;
  onAddVideoReference: (file: File) => void | Promise<void>;
  onRemoveVideoReference: (id: string) => void;
  onUpdateVideoReferenceType: (id: string, type: "asset" | "style") => void;
  onClearExtendVideo: () => void;
  promptLength: number;
  faceSwapMode: "direct" | "face-swap";
  faceSwapCharacterOptions: Array<{ id: string; label: string }>;
  selectedCharacterId: string;
  onFaceSwapCharacterChange: (assetId: string) => void;
  onFaceSwapPreview: () => void;
  isFaceSwapPreviewDisabled: boolean;
  faceSwapPreviewReady: boolean;
  faceSwapPreviewLoading: boolean;
  faceSwapError: string | null;
  faceSwapCredits: number;
  videoCredits: number | null;
  totalCredits: number | null;
  canCopy: boolean;
  canClear: boolean;
  onCopy: () => void;
  onClear: () => void;
  canGeneratePreviews: boolean;
  onGenerateSinglePreview: () => void;
  onGenerateFourPreviews: () => void;
}

export function VideoTabContent({
  startFrame,
  endFrame,
  videoReferenceImages,
  extendVideo,
  supportsStartFrame,
  supportsEndFrame,
  supportsReferenceImages,
  supportsExtendVideo,
  maxReferenceImages,
  isUploadDisabled,
  isEndFrameUploadDisabled,
  onRequestUpload,
  onUploadFile,
  onClearStartFrame,
  onRequestEndFrameUpload,
  onEndFrameUpload,
  onClearEndFrame,
  onRequestVideoReferenceUpload,
  onAddVideoReference,
  onRemoveVideoReference,
  onUpdateVideoReferenceType,
  onClearExtendVideo,
  promptLength,
  faceSwapMode,
  faceSwapCharacterOptions,
  selectedCharacterId,
  onFaceSwapCharacterChange,
  onFaceSwapPreview,
  isFaceSwapPreviewDisabled,
  faceSwapPreviewReady,
  faceSwapPreviewLoading,
  faceSwapError,
  faceSwapCredits,
  videoCredits,
  totalCredits,
  canCopy,
  canClear,
  onCopy,
  onClear,
  canGeneratePreviews,
  onGenerateSinglePreview,
  onGenerateFourPreviews,
}: VideoTabContentProps): React.ReactElement {
  const showStartFrame = supportsStartFrame || !supportsEndFrame;
  const isVideoReferenceLimitReached =
    maxReferenceImages <= 0 ||
    videoReferenceImages.length >= maxReferenceImages;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-[14px] py-3">
      <div className="border-tool-nav-active bg-tool-surface-card focus-within:border-tool-accent-neutral overflow-hidden rounded-xl border transition-colors">
        <div className="px-3 py-3">
          <div className="flex gap-2">
            {showStartFrame && (
              <StartFrameControl
                startFrame={startFrame}
                isUploadDisabled={isUploadDisabled}
                onRequestUpload={onRequestUpload}
                onUploadFile={onUploadFile}
                onClear={onClearStartFrame}
              />
            )}
            {supportsEndFrame && (
              <EndFrameControl
                endFrame={endFrame}
                isUploadDisabled={isEndFrameUploadDisabled}
                onRequestUpload={onRequestEndFrameUpload}
                onUploadFile={onEndFrameUpload}
                onClear={onClearEndFrame}
              />
            )}
          </div>
        </div>

        <VideoPromptToolbar
          canCopy={canCopy}
          canClear={canClear}
          canGeneratePreviews={canGeneratePreviews}
          onCopy={onCopy}
          onClear={onClear}
          onGenerateSinglePreview={onGenerateSinglePreview}
          onGenerateFourPreviews={onGenerateFourPreviews}
          promptLength={promptLength}
          isI2VMode={Boolean(startFrame)}
        />
      </div>

      {faceSwapMode === "face-swap" && (
        <div className="border-tool-nav-active bg-tool-surface-card space-y-3 rounded-xl border px-3 py-3">
          <div className="text-tool-text-dim text-meta uppercase tracking-wide">
            Face Swap
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-tool-text-dim text-xs">Character</label>
            <select
              value={selectedCharacterId}
              onChange={(event) =>
                onFaceSwapCharacterChange(event.target.value)
              }
              className="bg-tool-surface-deep border-tool-nav-active h-9 rounded-md border px-2 text-sm text-white"
            >
              <option value="">Select a character</option>
              {faceSwapCharacterOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            {!faceSwapCharacterOptions.length && (
              <div className="text-tool-text-dim text-xs">
                No character assets available yet.
              </div>
            )}
          </div>

          <div className="text-tool-text-dim text-xs">
            Face swap: {formatCredits(faceSwapCredits)} · Video:{" "}
            {videoCredits !== null ? formatCredits(videoCredits) : "—"} · Total:{" "}
            {totalCredits !== null ? formatCredits(totalCredits) : "—"}
          </div>

          <button
            type="button"
            className="border-tool-nav-active text-tool-text-dim hover:bg-tool-nav-active h-9 rounded-lg border px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onFaceSwapPreview}
            disabled={isFaceSwapPreviewDisabled}
          >
            {faceSwapPreviewReady
              ? "View Face Swap Preview"
              : "Preview Face Swap"}
          </button>

          {faceSwapPreviewLoading && (
            <div className="text-tool-text-dim text-xs">
              Composing face swap…
            </div>
          )}
          {!faceSwapPreviewLoading && faceSwapPreviewReady && (
            <div className="text-success-400 text-xs">Preview ready.</div>
          )}
          {!faceSwapPreviewLoading && faceSwapError && (
            <div className="text-xs text-amber-400">{faceSwapError}</div>
          )}
        </div>
      )}

      {supportsReferenceImages && (
        <div>
          <div className="flex items-center gap-2 px-0.5">
            <ChevronDown className="text-tool-text-subdued h-2.5 w-2.5" />
            <span className="text-tool-text-dim text-xs font-semibold">
              References
            </span>
            <div className="bg-tool-nav-active mx-2 h-px flex-1" />
            <span className="text-tool-text-label text-meta">
              {videoReferenceImages.length} / {maxReferenceImages}
            </span>
          </div>
          <div className="mt-1 rounded-md" role="tabpanel">
            {videoReferenceImages.length === 0 ? (
              <ReferencesOnboardingCard
                onUpload={onRequestVideoReferenceUpload}
                isUploadDisabled={isVideoReferenceLimitReached}
              />
            ) : (
              <VideoReferenceSlots
                references={videoReferenceImages}
                maxSlots={maxReferenceImages}
                isUploadDisabled={isVideoReferenceLimitReached}
                onRequestUpload={onRequestVideoReferenceUpload}
                onUploadFile={onAddVideoReference}
                onRemove={onRemoveVideoReference}
                onUpdateType={onUpdateVideoReferenceType}
              />
            )}
          </div>
        </div>
      )}

      {supportsExtendVideo && extendVideo && (
        <div className="border-tool-nav-active bg-tool-surface-card flex items-center gap-2 rounded-xl border px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-foreground truncate text-meta font-medium">
              Extending video
            </div>
            <div className="text-tool-text-subdued text-meta">
              Generation will continue from this clip
            </div>
          </div>
          <button
            type="button"
            onClick={onClearExtendVideo}
            className="text-tool-text-dim text-meta hover:text-white"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
