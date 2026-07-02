import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  CaretDown,
  Eye,
  MagicWand,
  Target,
  X,
} from "@promptstudio/system/components/ui";
import { FEATURES } from "@/config/features.config";
import type { SidebarUploadedImage } from "@features/generation-controls";
import {
  VIDEO_DRAFT_MODELS,
  STORYBOARD_COST,
  getVideoCost,
} from "@/components/ToolSidebar/config/modelConfig";
import { getDefaultGenerationDurationSeconds } from "@shared/generationPricing";
import { useGenerationControlsContext } from "@/features/prompt-optimizer/context/GenerationControlsContext";
import { usePromptResultsActionsOptional } from "@/features/prompt-optimizer/context/PromptResultsActionsContext";
import { useCreditBalance } from "@/contexts/CreditBalanceContext";
import {
  useGenerationControlsStoreActions,
  useGenerationControlsStoreState,
} from "@features/generation-controls";
import { useCapabilitiesClamping } from "@/components/ToolSidebar/components/panels/GenerationControlsPanel/hooks/useCapabilitiesClamping";
import { useVideoInputCapabilities } from "@/components/ToolSidebar/components/panels/GenerationControlsPanel/hooks/useVideoInputCapabilities";
import { ModelRecommendationDropdown } from "@/components/ToolSidebar/components/panels/GenerationControlsPanel/components/ModelRecommendationDropdown";
import type { ModelRecommendation } from "@/features/model-intelligence/types";
import { trackModelRecommendationEvent } from "@/features/model-intelligence/api";
import { cn } from "@/utils/cn";
import { StartFramePopover } from "./StartFramePopover";
import { EndFramePopover } from "./EndFramePopover";
import { VideoReferencesPopover } from "./VideoReferencesPopover";
import { MiniDropdown } from "./MiniDropdown";

interface CanvasSettingsRowProps {
  prompt: string;
  renderModelId: string;
  /** Model picker options + recommendation metadata. The picker chip lives
   *  in the chip row now (replaces the floating ModelCornerSelector). The
   *  inner dropdown wants a mutable array, so the type matches its contract
   *  rather than over-tightening to readonly here. */
  renderModelOptions: Array<{ id: string; label: string }>;
  modelRecommendation?: ModelRecommendation | null | undefined;
  recommendedModelId?: string | undefined;
  efficientModelId?: string | undefined;
  recommendationPromptId?: string | undefined;
  recommendationMode?: "t2v" | "i2v" | undefined;
  recommendationAgeMs?: number | null | undefined;
  onModelChange: (modelId: string) => void;
  /** Tune drawer state — lifted from parent so Tune is a chip in the row,
   *  not a separate row above. The drawer itself still renders in the
   *  parent above the editor. */
  tuneOpen: boolean;
  selectedChipCount: number;
  onToggleTune: () => void;
  onOpenMotion: () => void;
  onStartFrameUpload?: ((file: File) => void | Promise<void>) | undefined;
  onUploadSidebarImage?:
    | ((file: File) => Promise<SidebarUploadedImage | null>)
    | undefined;
  /** Whether to show the storyboard-preview eye button. Hidden in the empty
   *  moment so the chip row matches the screenshot's clean 5-chip layout. */
  showPreviewButton?: boolean;
}

const parseAspectRatio = (
  generationParams: Record<string, unknown>,
): string => {
  const ratio = generationParams.aspect_ratio;
  if (typeof ratio === "string" && ratio.trim()) return ratio.trim();
  return "16:9";
};

const parseDuration = (generationParams: Record<string, unknown>): number => {
  const durationValue = generationParams.duration_s;
  if (typeof durationValue === "number" && Number.isFinite(durationValue))
    return durationValue;
  if (typeof durationValue === "string") {
    const parsed = Number.parseFloat(durationValue);
    if (Number.isFinite(parsed)) return parsed;
  }
  return getDefaultGenerationDurationSeconds();
};

// C8 cooldown window: how long after a Preview-storyboard click we drop
// repeat clicks. Sized to outlast the multi-step prelude (optimize →
// session-create) that gates the upstream isSubmittingRef flip.
const PREVIEW_CLICK_COOLDOWN_MS = 2000;

export function CanvasSettingsRow({
  prompt,
  renderModelId,
  renderModelOptions,
  modelRecommendation,
  recommendedModelId,
  efficientModelId,
  recommendationPromptId,
  recommendationMode,
  recommendationAgeMs,
  onModelChange,
  tuneOpen,
  selectedChipCount,
  onToggleTune,
  onOpenMotion,
  onStartFrameUpload,
  onUploadSidebarImage,
  showPreviewButton = true,
}: CanvasSettingsRowProps): React.ReactElement {
  const { controls, onInsufficientCredits } = useGenerationControlsContext();
  const { balance: creditBalance } = useCreditBalance();
  const { domain } = useGenerationControlsStoreState();
  const storeActions = useGenerationControlsStoreActions();
  // Tolerant: this chrome also mounts outside the prompt-results tree
  // (and in credit-gate tests); no provider simply means no idea-box routing.
  const onIdeaBoxExpand = usePromptResultsActionsOptional()?.onIdeaBoxExpand;

  const aspectRatio = useMemo(
    () => parseAspectRatio(domain.generationParams as Record<string, unknown>),
    [domain.generationParams],
  );
  const duration = useMemo(
    () => parseDuration(domain.generationParams as Record<string, unknown>),
    [domain.generationParams],
  );

  const hasPrompt = Boolean(prompt.trim());
  const hasStartFrame = Boolean(domain.startFrame);
  const isGenerating = controls?.isGenerating ?? false;
  const isSubmitting = controls?.isSubmitting ?? false;
  const isGenerationBusy = isGenerating || isSubmitting;

  // C8 guard: rapid Preview-storyboard double-clicks fire `onStoryboard`
  // multiple times because the upstream isSubmittingRef inside
  // useGenerationActions only flips AFTER the workspace-level prelude
  // (optimize -> session-create) completes. During that prelude, the button
  // looks enabled and a second click would silently re-charge credits.
  // Hold a short cooldown ref so each Preview click fires the handler at
  // most once per ~2s window.
  const previewClickCooldownRef = useRef(false);
  const previewCooldownTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (previewCooldownTimerRef.current !== null) {
        window.clearTimeout(previewCooldownTimerRef.current);
        previewCooldownTimerRef.current = null;
      }
    };
  }, []);

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

  const { aspectRatioOptions, durationOptions, schema } =
    useCapabilitiesClamping({
      activeTab: "video",
      selectedModel: domain.selectedModel,
      videoTier: domain.videoTier,
      renderModelId,
      aspectRatio,
      duration,
      setVideoTier: storeActions.setVideoTier,
      onAspectRatioChange: handleAspectRatioChange,
      onDurationChange: handleDurationChange,
    });
  const videoInputCapabilities = useVideoInputCapabilities(schema ?? null);

  const selectedDraftModel = useMemo(
    () =>
      VIDEO_DRAFT_MODELS.find((model) => model.id === domain.selectedModel) ??
      null,
    [domain.selectedModel],
  );
  const isDraftModelSelected = selectedDraftModel !== null;

  const creditCost = getVideoCost(
    selectedDraftModel?.id ?? renderModelId,
    duration,
  );
  // ADR-0002: with BILLING_UI frozen, credits never gate generation —
  // validation-phase renders run as a hard-capped passthrough.
  const hasInsufficientCredits =
    FEATURES.BILLING_UI &&
    typeof creditBalance === "number" &&
    creditBalance < creditCost;
  const hasInsufficientPreviewCredits =
    FEATURES.BILLING_UI &&
    typeof creditBalance === "number" &&
    creditBalance < STORYBOARD_COST;
  const operationLabel = isDraftModelSelected
    ? `${selectedDraftModel?.label ?? "Draft"} preview`
    : "Video render";

  const previewDisabled =
    !controls?.onStoryboard ||
    isGenerationBusy ||
    (!hasPrompt && !hasStartFrame) ||
    hasInsufficientPreviewCredits;
  const generateDisabled = isDraftModelSelected
    ? !controls?.onDraft ||
      isGenerationBusy ||
      !hasPrompt ||
      hasInsufficientCredits
    : !controls?.onRender ||
      isGenerationBusy ||
      !hasPrompt ||
      hasInsufficientCredits;

  const trackGenerationStart = useCallback(
    (selectedModelId: string) => {
      if (!FEATURES.MODEL_INTELLIGENCE_UI) return;
      void trackModelRecommendationEvent({
        event: "generation_started",
        ...(recommendationPromptId
          ? {
              recommendationId: recommendationPromptId,
              promptId: recommendationPromptId,
            }
          : {}),
        ...(recommendedModelId ? { recommendedModelId } : {}),
        selectedModelId,
        ...(recommendationMode ? { mode: recommendationMode } : {}),
        durationSeconds: duration,
        ...(typeof recommendationAgeMs === "number"
          ? {
              timeSinceRecommendationMs: Math.max(
                0,
                Math.round(recommendationAgeMs),
              ),
            }
          : {}),
      });
    },
    [
      duration,
      recommendationAgeMs,
      recommendationMode,
      recommendationPromptId,
      recommendedModelId,
    ],
  );

  const handleGenerate = useCallback(() => {
    // Idea Box: with no start frame, generate means "run the expansion loop"
    // (expand -> first frame -> gate). Render happens on the next press,
    // after the frame gate — never on the first action from a bare prompt.
    if (!hasStartFrame && onIdeaBoxExpand) {
      void onIdeaBoxExpand();
      return;
    }
    if (hasInsufficientCredits) {
      onInsufficientCredits?.(creditCost, operationLabel);
      return;
    }
    if (selectedDraftModel) {
      trackGenerationStart(selectedDraftModel.id);
      controls?.onDraft?.(selectedDraftModel.id);
    } else {
      trackGenerationStart(renderModelId);
      controls?.onRender?.(renderModelId);
    }
  }, [
    controls,
    creditCost,
    hasInsufficientCredits,
    hasStartFrame,
    onIdeaBoxExpand,
    onInsufficientCredits,
    operationLabel,
    renderModelId,
    selectedDraftModel,
    trackGenerationStart,
  ]);

  const formatDurationLabel = useCallback((v: number) => `${v}s`, []);

  return (
    <div
      className="flex flex-wrap items-center gap-1 px-3 py-2"
      data-testid="canvas-settings-row"
    >
      <div className="flex flex-wrap items-center gap-1">
        {/* Start frame (with popover) — leftmost chip, the "image upload"
            affordance from the screenshot. */}
        <StartFramePopover
          startFrame={domain.startFrame}
          cameraMotion={domain.cameraMotion}
          onSetStartFrame={storeActions.setStartFrame}
          onClearStartFrame={storeActions.clearStartFrame}
          onOpenMotion={onOpenMotion}
          onStartFrameUpload={onStartFrameUpload}
          disabled={isGenerating}
        />

        {videoInputCapabilities.supportsEndFrame ? (
          <EndFramePopover
            endFrame={domain.endFrame}
            onSetEndFrame={storeActions.setEndFrame}
            onClearEndFrame={storeActions.clearEndFrame}
            onUploadSidebarImage={onUploadSidebarImage}
            disabled={isGenerating}
          />
        ) : null}

        {videoInputCapabilities.supportsReferenceImages ? (
          <VideoReferencesPopover
            references={domain.videoReferenceImages}
            maxSlots={videoInputCapabilities.maxReferenceImages}
            onAddReference={storeActions.addVideoReference}
            onRemoveReference={storeActions.removeVideoReference}
            onUpdateReferenceType={storeActions.updateVideoReferenceType}
            onUploadSidebarImage={onUploadSidebarImage}
            disabled={isGenerating}
          />
        ) : null}

        {domain.extendVideo ? (
          <div className="border-surface-2 bg-tool-nav-hover text-foreground inline-flex h-[28px] items-center gap-1 rounded-full border pl-2.5 pr-1 text-xs font-semibold">
            <svg
              width="11"
              height="11"
              viewBox="0 0 11 11"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="1.2" y="2.2" width="6.4" height="6" rx="1" />
              <path d="M7.6 4.2 9.8 3v5L7.6 6.8" />
            </svg>
            Extending
            <button
              type="button"
              className="text-tool-text-dim hover:bg-tool-nav-active hover:text-foreground ml-0.5 flex h-5 w-5 items-center justify-center rounded transition-colors"
              onClick={() => storeActions.clearExtendVideo()}
              aria-label="Clear extend mode"
            >
              <X size={10} />
            </button>
          </div>
        ) : null}

        {/* Tune chip — opens the drawer above the editor. The visible text
            ("Tune" or "Tune · N") IS the chip's accessible name; aria-pressed
            reflects open/closed state. The format matches the regression
            test that pins `Tune · 2` after two chips toggled. */}
        <button
          type="button"
          data-testid="canvas-tune-chip"
          aria-pressed={tuneOpen}
          onClick={onToggleTune}
          className={cn(
            "inline-flex h-[28px] items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
            tuneOpen
              ? "border-tool-accent-neutral/50 bg-tool-accent-neutral/10 text-foreground"
              : "border-tool-rail-border text-tool-text-dim hover:border-tool-text-label hover:text-foreground bg-transparent",
          )}
        >
          <MagicWand size={12} aria-hidden="true" />
          Tune{selectedChipCount > 0 ? ` · ${selectedChipCount}` : ""}
          <CaretDown size={10} aria-hidden="true" />
        </button>

        {/* Aspect ratio dropdown */}
        <MiniDropdown
          value={aspectRatio}
          options={aspectRatioOptions}
          onChange={handleAspectRatioChange}
        />

        {/* Duration dropdown */}
        <MiniDropdown
          value={duration}
          options={durationOptions}
          onChange={handleDurationChange}
          formatLabel={formatDurationLabel}
        />

        {/* Model picker — replaces the floating ModelCornerSelector. The
            bullseye icon prefix mirrors the screenshot's model chip glyph. */}
        <ModelRecommendationDropdown
          renderModelOptions={renderModelOptions}
          renderModelId={renderModelId}
          onModelChange={onModelChange}
          modelRecommendation={modelRecommendation ?? null}
          {...(recommendedModelId ? { recommendedModelId } : {})}
          {...(efficientModelId ? { efficientModelId } : {})}
          triggerAriaLabel="Video model"
          triggerPrefixLabel="Model ·"
          triggerPrefixIcon={<Target size={12} aria-hidden="true" />}
          triggerClassName="inline-flex h-[28px] items-center gap-1.5 rounded-full border border-tool-rail-border bg-transparent px-2.5 text-xs font-normal text-tool-text-dim transition-colors hover:border-tool-text-label hover:text-foreground"
        />
      </div>

      <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
        {/* Preview button — hidden in the empty moment per the screenshot's
            clean chip-row layout. Surfaced once there's content to compare
            against (parent passes showPreviewButton=true). */}
        {showPreviewButton ? (
          <button
            type="button"
            data-testid="canvas-preview-button"
            className="text-tool-text-muted hover:text-foreground disabled:text-tool-text-label inline-flex h-[28px] w-[28px] items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed"
            onClick={() => {
              if (hasInsufficientPreviewCredits) {
                onInsufficientCredits?.(STORYBOARD_COST, "Storyboard preview");
                return;
              }
              if (previewClickCooldownRef.current) {
                return;
              }
              previewClickCooldownRef.current = true;
              controls?.onStoryboard?.();
              previewCooldownTimerRef.current = window.setTimeout(() => {
                previewClickCooldownRef.current = false;
                previewCooldownTimerRef.current = null;
              }, PREVIEW_CLICK_COOLDOWN_MS);
            }}
            disabled={previewDisabled}
            aria-label={
              isSubmitting
                ? "Starting storyboard generation"
                : hasInsufficientPreviewCredits
                  ? `Need ${STORYBOARD_COST} credits for preview — top up in billing`
                  : FEATURES.BILLING_UI
                    ? `Preview storyboard ${STORYBOARD_COST} credits`
                    : "Preview storyboard"
            }
            title={
              isSubmitting
                ? "Starting..."
                : hasInsufficientPreviewCredits
                  ? `Need ${STORYBOARD_COST} credits`
                  : FEATURES.BILLING_UI
                    ? `Preview · ${STORYBOARD_COST} cr`
                    : "Preview"
            }
          >
            <Eye size={14} />
          </button>
        ) : null}

        {/* Make it pill — primary submit. Replaces the small + icon button.
            The ⌘↵ badge mirrors the screenshot's keyboard hint. */}
        <button
          type="button"
          data-testid="canvas-generate-button"
          onClick={handleGenerate}
          disabled={generateDisabled}
          aria-busy={isGenerationBusy}
          aria-label={
            isGenerationBusy
              ? "Starting generation"
              : hasInsufficientCredits
                ? `Need ${creditCost} credits — top up in billing`
                : FEATURES.BILLING_UI
                  ? `${isDraftModelSelected ? "Draft" : "Generate"} ${creditCost} credits`
                  : isDraftModelSelected
                    ? "Draft"
                    : "Generate"
          }
          title={
            isGenerationBusy
              ? "Starting..."
              : hasInsufficientCredits
                ? `Need ${creditCost} credits`
                : FEATURES.BILLING_UI
                  ? `${isDraftModelSelected ? "Draft" : "Generate"} · ${creditCost} cr`
                  : isDraftModelSelected
                    ? "Draft"
                    : "Generate"
          }
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-opacity",
            "bg-foreground text-tool-surface-deep",
            "hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {isGenerationBusy ? (
            <>
              <svg
                className="animate-spin"
                width={14}
                height={14}
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  cx="7"
                  cy="7"
                  r="5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeDasharray="22 10"
                />
              </svg>
              Rendering…
            </>
          ) : (
            <>
              Make it
              <kbd
                aria-hidden="true"
                className="bg-tool-surface-deep/15 text-tool-surface-deep/70 ml-1 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold"
              >
                ⌘↵
              </kbd>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
