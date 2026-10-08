import { useSidebarGenerationDomain } from "@/components/ToolSidebar/context";
import { ReferenceUploadButton } from "./ReferenceUploadButton";
import { useResolvedMediaUrl } from "@/hooks/useResolvedMediaUrl";
import type { PendingFirstFrameView } from "@features/prompt-optimizer/PromptOptimizerContainer/hooks/usePendingFirstFrame";
import type { VideoComposerSlots } from "./VideoComposer";
import sketchIcon from "@/assets/design-system/sketch.svg";
import closeIcon from "@/assets/design-system/composer-close.svg";
import modelIcon from "@/assets/design-system/composer-model.svg";
import downIcon from "@/assets/design-system/composer-down.svg";
import ratioIcon from "@/assets/design-system/composer-ratio.svg";
import clockIcon from "@/assets/design-system/composer-clock.svg";
import generateIcon from "@/assets/design-system/composer-generate.svg";
import React, { useCallback, useMemo } from "react";
import { VIDEO_DRAFT_MODELS } from "@/components/ToolSidebar/config/modelConfig";
import { useGenerationControlsContext } from "@/features/prompt-optimizer/context/GenerationControlsContext";
import { usePromptResultsActionsOptional } from "@/features/prompt-optimizer/context/PromptResultsActionsContext";
import {
  useGenerationControlsStoreActions,
  useGenerationControlsStoreState,
} from "@features/generation-controls";
import {
  DEFAULT_ASPECT_RATIO,
  readAspectRatio,
  resolveDurationSeconds,
} from "@features/generation-controls/resolveGenerationParams";
import { useCapabilitiesClamping } from "../hooks/useCapabilitiesClamping";
import { VideoModelSelect } from "./VideoModelSelect";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@promptstudio/system/components/ui/dropdown-menu";
import { useAuthUser } from "@hooks/useAuthUser";
import { authGateController, runWhenAuthenticated } from "@features/auth-gate";

interface CanvasSettingsRowProps {
  prompt: string;
  hasPendingReference?: boolean;
  pendingReference?: PendingFirstFrameView | null | undefined;
  onClearPendingReference?: (() => void) | undefined;
  isReferenceUploading?: boolean;
  isExpanding?: boolean;
  renderModelId: string;
  renderModelOptions: Array<{ id: string; label: string }>;
  onModelChange: (modelId: string) => void;
  onOpenSketch?: (() => void) | undefined;
  renderComposer?:
    | ((slots: VideoComposerSlots) => React.ReactElement)
    | undefined;
}

export function CanvasSettingsRow({
  prompt,
  hasPendingReference = false,
  pendingReference,
  onClearPendingReference,
  isReferenceUploading = false,
  isExpanding = false,
  renderModelId,
  renderModelOptions,
  onModelChange,
  onOpenSketch,
  renderComposer,
}: CanvasSettingsRowProps): React.ReactElement {
  const { controls } = useGenerationControlsContext();
  // Auth-at-Go (M4): the primary generate action is gated behind sign-in for
  // logged-out users. We read auth state here and resume the action after a
  // successful login rather than clearing the typed draft.
  const authUser = useAuthUser();
  const onStartFrameUpload = useSidebarGenerationDomain()?.onStartFrameUpload;
  const { domain } = useGenerationControlsStoreState();
  const storeActions = useGenerationControlsStoreActions();
  const reference = useResolvedMediaUrl({
    kind: "image",
    url: pendingReference
      ? (pendingReference.url ?? null)
      : (domain.startFrame?.url ?? null),
    assetId: pendingReference ? null : (domain.startFrame?.assetId ?? null),
    storagePath: pendingReference
      ? null
      : (domain.startFrame?.storagePath ?? null),
    enabled: pendingReference
      ? Boolean(pendingReference.url)
      : Boolean(domain.startFrame),
    deferUntilResolved: true,
  });

  const videoReference = useResolvedMediaUrl({
    kind: "video",
    url: domain.extendVideo?.url ?? null,
    enabled: Boolean(domain.extendVideo),
    deferUntilResolved: true,
  });

  // Tolerant: this chrome also mounts outside the prompt-results tree
  // (and in credit-gate tests); no provider simply means no idea-box routing.
  const onIdeaBoxExpand = usePromptResultsActionsOptional()?.onIdeaBoxExpand;

  const aspectRatio = useMemo(
    () => readAspectRatio(domain.generationParams) ?? DEFAULT_ASPECT_RATIO,
    [domain.generationParams],
  );
  const duration = useMemo(
    () => resolveDurationSeconds(domain.generationParams, domain.selectedModel),
    [domain.generationParams, domain.selectedModel],
  );

  const hasPrompt = Boolean(prompt.trim());
  const hasStartFrame = Boolean(domain.startFrame);
  const isGenerating = controls?.isGenerating ?? false;
  const isSubmitting = controls?.isSubmitting ?? false;
  const isGenerationBusy = isGenerating || isSubmitting;

  const handleAspectRatioChange = useCallback(
    (value: string) => {
      storeActions.mergeGenerationParams({ aspect_ratio: value });
    },
    [storeActions],
  );

  const handleDurationChange = useCallback(
    (value: number) => {
      storeActions.mergeGenerationParams({ duration_s: value });
    },
    [storeActions],
  );

  const { aspectRatioOptions, durationOptions } = useCapabilitiesClamping({
    selectedModel: domain.selectedModel,
    videoTier: domain.videoTier,
    renderModelId,
    aspectRatio,
    duration,
    setVideoTier: storeActions.setVideoTier,
    onAspectRatioChange: handleAspectRatioChange,
    onDurationChange: handleDurationChange,
  });

  const selectedDraftModel = useMemo(
    () =>
      VIDEO_DRAFT_MODELS.find((model) => model.id === domain.selectedModel) ??
      null,
    [domain.selectedModel],
  );
  const isDraftModelSelected = selectedDraftModel !== null;

  const generateDisabled =
    isGenerationBusy ||
    isExpanding ||
    !hasPrompt ||
    (isDraftModelSelected ? !controls?.onDraft : !controls?.onRender);

  const runGenerate = useCallback(() => {
    // Idea Box: with no start frame, generate means "run the expansion loop"
    // (expand -> first frame -> gate). Render happens on the next press,
    // after the frame gate — never on the first action from a bare prompt.
    if ((hasPendingReference || !hasStartFrame) && onIdeaBoxExpand) {
      void onIdeaBoxExpand();
      return;
    }
    if (selectedDraftModel) {
      controls?.onDraft?.(selectedDraftModel.id);
    } else {
      controls?.onRender?.(renderModelId);
    }
  }, [
    controls,
    hasStartFrame,
    hasPendingReference,
    onIdeaBoxExpand,
    renderModelId,
    selectedDraftModel,
  ]);

  const handleGenerate = useCallback(() => {
    // Pre-Go auth gate (ADR-0009): logged-out users get the sign-in dialog
    // over the page; the generate action resumes after a successful login.
    void runWhenAuthenticated({
      isAuthenticated: authUser !== null,
      reason: "pre-go",
      authGate: authGateController,
      action: runGenerate,
    });
  }, [authUser, runGenerate]);

  const handleReferenceUpload = useCallback(
    async (file: File): Promise<void> => {
      let upload: Promise<void> | undefined;
      await runWhenAuthenticated({
        isAuthenticated: authUser !== null,
        reason: "pre-go",
        authGate: authGateController,
        action: () => {
          upload = Promise.resolve(onStartFrameUpload?.(file));
        },
      });
      await upload;
    },
    [authUser, onStartFrameUpload],
  );

  const formatDurationLabel = useCallback((v: number) => `${v}s`, []);

  const media = (
    <>
      <div className="vidra-media-action">
        <ReferenceUploadButton
          tile
          onUpload={handleReferenceUpload}
          disabled={
            !onStartFrameUpload ||
            isGenerationBusy ||
            isReferenceUploading ||
            isExpanding
          }
        />
      </div>
      <div className="vidra-media-action">
        <button
          type="button"
          className="vidra-media-action__button"
          aria-label="Open Sketch"
          disabled={!onOpenSketch}
          onClick={onOpenSketch}
        >
          <span className="vidra-composer-icon">
            <img src={sketchIcon} alt="" />
          </span>
        </button>
        <span className="vidra-media-action__label">Sketch</span>
      </div>
      {pendingReference || domain.startFrame ? (
        <div className="vidra-reference">
          <div className="vidra-reference__image">
            {reference.url && !pendingReference?.uploading ? (
              <img src={reference.url} alt="Reference picture" />
            ) : null}
            <button
              type="button"
              className="vidra-reference__remove"
              aria-label="Remove reference"
              disabled={pendingReference?.busy || pendingReference?.uploading}
              onClick={() => {
                if (pendingReference) {
                  onClearPendingReference?.();
                  return;
                }
                const frame = domain.startFrame;
                const index = domain.keyframes.findIndex(
                  (entry) =>
                    (frame?.id && entry.id === frame.id) ||
                    (frame?.assetId && entry.assetId === frame.assetId) ||
                    (frame?.storagePath &&
                      entry.storagePath === frame.storagePath) ||
                    (frame?.url && entry.url === frame.url),
                );
                if (index >= 0)
                  storeActions.setKeyframes(
                    domain.keyframes.filter((_, at) => at !== index),
                  );
                storeActions.clearStartFrame();
              }}
            >
              <span className="vidra-composer-icon vidra-composer-icon--close">
                <img src={closeIcon} alt="" />
              </span>
            </button>
          </div>
          <span className="text-meta text-muted">Reference</span>
        </div>
      ) : null}
      {domain.extendVideo ? (
        <div className="vidra-reference">
          <div className="vidra-reference__image">
            {videoReference.url ? (
              <video
                src={videoReference.url}
                aria-label="Video reference"
                muted
                playsInline
                preload="metadata"
              />
            ) : null}
            <button
              type="button"
              className="vidra-reference__remove"
              aria-label="Clear extend mode"
              onClick={storeActions.clearExtendVideo}
            >
              <span className="vidra-composer-icon vidra-composer-icon--close">
                <img src={closeIcon} alt="" />
              </span>
            </button>
          </div>
          <span className="text-meta text-muted">Extending</span>
        </div>
      ) : null}
    </>
  );
  const settings = (
    <>
      <VideoModelSelect
        options={renderModelOptions}
        value={renderModelId}
        onChange={onModelChange}
        icon={
          <span className="vidra-composer-icon">
            <img src={modelIcon} alt="" />
          </span>
        }
      />
      <DropdownMenu>
        <DropdownMenuTrigger
          className="vidra-setting vidra-setting--ratio"
          aria-label={aspectRatio}
          title="Aspect ratio"
        >
          <span className="vidra-composer-icon">
            <img src={ratioIcon} alt="" />
          </span>
          {aspectRatio}
          <span className="vidra-composer-icon">
            <img src={downIcon} alt="" />
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start">
          <DropdownMenuLabel className="mb-1">Aspect ratio</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={aspectRatio}
            onValueChange={handleAspectRatioChange}
          >
            {aspectRatioOptions.map((option) => (
              <DropdownMenuRadioItem key={option} value={option}>
                {option}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="vidra-setting vidra-setting--duration"
          aria-label={formatDurationLabel(duration)}
          title="Duration"
        >
          <span className="vidra-composer-icon">
            <img src={clockIcon} alt="" />
          </span>
          {formatDurationLabel(duration)}
          <span className="vidra-composer-icon">
            <img src={downIcon} alt="" />
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start">
          <DropdownMenuLabel className="mb-1">Duration</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={String(duration)}
            onValueChange={(value) => handleDurationChange(Number(value))}
          >
            {durationOptions.map((option) => (
              <DropdownMenuRadioItem key={option} value={String(option)}>
                {formatDurationLabel(option)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
  const generate = (
    <button
      type="button"
      data-testid="canvas-generate-button"
      className="vidra-generate"
      onClick={handleGenerate}
      disabled={generateDisabled || isReferenceUploading}
      aria-label={isGenerationBusy ? "Starting generation" : "Generate"}
      aria-busy={isGenerationBusy || undefined}
    >
      {isGenerationBusy ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : (
        <span className="vidra-composer-icon">
          <img src={generateIcon} alt="" />
        </span>
      )}
      {isGenerationBusy ? "Generating…" : "Generate"}
    </button>
  );
  if (renderComposer) return renderComposer({ media, settings, generate });
  return (
    <div data-testid="canvas-settings-row" className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">{media}</div>
      <div className="flex flex-wrap gap-2">{settings}</div>
      {generate}
    </div>
  );
}
