import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { CaretDown, X } from "@promptstudio/system/components/ui";
import { FEATURES } from "@/config/features.config";
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
import { ModelRecommendationDropdown } from "@/components/ToolSidebar/components/panels/GenerationControlsPanel/components/ModelRecommendationDropdown";
import type { ModelRecommendation } from "@/features/model-intelligence/types";
import { trackModelRecommendationEvent } from "@/features/model-intelligence/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@promptstudio/system/components/ui/dropdown-menu";
import { cn } from "@/utils/cn";
import { useAuthUser } from "@hooks/useAuthUser";
import { authGateController, runWhenAuthenticated } from "@features/auth-gate";

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
  /** Whether to show the storyboard-preview eye button. Hidden in the empty
   *  moment so the chip row matches the screenshot's clean 5-chip layout. */
  showPreviewButton?: boolean;
  /**
   * `sheet` is the Anchor's pre-work glass-sheet layout: only the aspect +
   * duration selectors and a circular submit (the handoff's minimal input —
   * REBUILD.md: "two inline selectors on the input, 16:9 ▾ · 6s ▾"). `docked`
   * is the full workspace chrome. Defaults to `docked`.
   */
  variant?: "docked" | "sheet";
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

// Ghost-text chip trigger for the aspect/duration menus — matches the
// retired MiniDropdown's quiet trigger, while the menu itself is the system
// DropdownMenu (opaque popover surface on the named z-index scale).
const MENU_TRIGGER_CLASS =
  "inline-flex h-[28px] items-center gap-[5px] whitespace-nowrap rounded-md px-2 text-xs text-tool-text-muted transition-colors hover:text-foreground data-[state=open]:text-foreground";

// Docked variant (the composer handoff): icon-only 42px control buttons —
// aspect · duration · model · preview — styled as a compact canvas toolbar.
// The accessible name carries the current VALUE (e.g. "16:9", "10s") so the
// setting is announced; the title names the control.
const ICON_TRIGGER_CLASS =
  "inline-flex h-[42px] w-[42px] items-center justify-center rounded-[12px] text-tool-text-dim transition-colors hover:bg-white/[0.07] hover:text-foreground data-[state=open]:bg-white/[0.13] data-[state=open]:text-foreground";

/* Control glyphs copied VERBATIM from the composer handoff
   (design_handoff_composer/Composer States.dc.html) — 21px, 1.7 stroke,
   sparkle filled. Kept as literal SVGs so the bar matches the frames
   exactly instead of approximating with library icons. */

function AspectGlyph(): React.ReactElement {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="7" width="18" height="10" rx="1.8" />
    </svg>
  );
}

function DurationGlyph(): React.ReactElement {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </svg>
  );
}

function ModelGlyph(): React.ReactElement {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" />
    </svg>
  );
}

function PreviewGlyph(): React.ReactElement {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function MakeItArrowGlyph(): React.ReactElement {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

// Sheet (Anchor) variant: the aspect/duration selectors read as bordered mono
// pills inside the glass sheet, matching the handoff's two inline chips.
const SHEET_MENU_TRIGGER_CLASS =
  "inline-flex h-[34px] items-center gap-2 whitespace-nowrap rounded-[10px] border border-white/[0.12] bg-white/[0.04] px-3 font-mono text-[13px] text-tool-text-dim transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-foreground data-[state=open]:text-foreground";

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
  showPreviewButton = true,
  variant = "docked",
}: CanvasSettingsRowProps): React.ReactElement {
  const isSheet = variant === "sheet";
  const { controls, onInsufficientCredits } = useGenerationControlsContext();
  const { balance: creditBalance } = useCreditBalance();
  // Auth-at-Go (M4): the primary generate action is gated behind sign-in for
  // logged-out users. We read auth state here and resume the action after a
  // successful login rather than clearing the typed draft.
  const authUser = useAuthUser();
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

  const runGenerate = useCallback(() => {
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

  const formatDurationLabel = useCallback((v: number) => `${v}s`, []);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-[6px] px-[10px] py-[9px]",
        isSheet && "gap-2 px-0 py-0",
      )}
      data-testid="canvas-settings-row"
    >
      <div className="flex flex-wrap items-center gap-[6px]">
        {/* The Anchor sheet shows only the two inline selectors (16:9 · 6s).
            The docked row is the handoff's exact control set: aspect ·
            duration · model · preview, then Make it — nothing else. */}
        {isSheet ? null : (
          <>
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
          </>
        )}

        {/* Aspect ratio menu — icon-only in the docked row; the accessible
            name is the current value so tests and readers see "16:9". */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className={isSheet ? SHEET_MENU_TRIGGER_CLASS : ICON_TRIGGER_CLASS}
            aria-label={isSheet ? undefined : aspectRatio}
            title={isSheet ? undefined : "Aspect ratio"}
          >
            {isSheet ? (
              <>
                {aspectRatio}
                <CaretDown
                  size={10}
                  aria-hidden="true"
                  className="opacity-50"
                />
              </>
            ) : (
              <AspectGlyph />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start">
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

        {/* Duration menu (Radix radio values are strings; the store keeps
            duration numeric) */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className={isSheet ? SHEET_MENU_TRIGGER_CLASS : ICON_TRIGGER_CLASS}
            aria-label={isSheet ? undefined : formatDurationLabel(duration)}
            title={isSheet ? undefined : "Duration"}
          >
            {isSheet ? (
              <>
                {formatDurationLabel(duration)}
                <CaretDown
                  size={10}
                  aria-hidden="true"
                  className="opacity-50"
                />
              </>
            ) : (
              <DurationGlyph />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start">
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

        {/* Model picker — replaces the floating ModelCornerSelector. The
            bullseye icon prefix mirrors the screenshot's model chip glyph.
            Hidden in the Anchor sheet (defaults ride the first submit). */}
        {isSheet ? null : (
          <ModelRecommendationDropdown
            renderModelOptions={renderModelOptions}
            renderModelId={renderModelId}
            onModelChange={onModelChange}
            modelRecommendation={modelRecommendation ?? null}
            {...(recommendedModelId ? { recommendedModelId } : {})}
            {...(efficientModelId ? { efficientModelId } : {})}
            triggerAriaLabel="Video model"
            triggerPrefixIcon={<ModelGlyph />}
            triggerLabelHidden
            triggerClassName={ICON_TRIGGER_CLASS}
          />
        )}
      </div>

      <div className="ml-auto flex flex-wrap items-center justify-end gap-[6px]">
        {/* Preview button — hidden in the empty moment per the screenshot's
            clean chip-row layout. Surfaced once there's content to compare
            against (parent passes showPreviewButton=true). */}
        {showPreviewButton ? (
          <button
            type="button"
            data-testid="canvas-preview-button"
            className={cn(
              ICON_TRIGGER_CLASS,
              "disabled:text-tool-text-label disabled:cursor-not-allowed",
            )}
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
            <PreviewGlyph />
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
            isSheet
              ? cn(
                  // 46px circular submit — the handoff's ghost → white → accent
                  // states, scaling in as it fires.
                  "flex h-[46px] w-[46px] flex-none items-center justify-center rounded-full border transition-[transform,background-color,border-color,color,box-shadow] duration-300 disabled:cursor-not-allowed",
                  isGenerationBusy
                    ? "scale-90 border-[color:var(--accent)] bg-[color:var(--accent)] text-white shadow-[0_0_24px_rgba(91,108,255,0.45)]"
                    : generateDisabled
                      ? "text-tool-text-label border-white/[0.12] bg-white/[0.06]"
                      : "text-tool-surface-deep border-white bg-white shadow-[0_6px_22px_-6px_rgba(255,255,255,0.3)]",
                )
              : cn(
                  // The handoff's calm primary: off-white solid, no accent
                  // glow, a trailing arrow. Same button in box and pill.
                  "inline-flex h-[42px] items-center gap-[7px] rounded-[12px] px-[18px] text-sm font-semibold",
                  "bg-foreground text-tool-surface-deep shadow-[0_2px_8px_rgba(0,0,0,0.3)]",
                  "transition-[transform,background-color,opacity] hover:-translate-y-px hover:bg-white",
                  "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0",
                ),
          )}
        >
          {isSheet ? (
            isGenerationBusy ? (
              <svg
                className="animate-spin"
                width={19}
                height={19}
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray="38 18"
                />
              </svg>
            ) : (
              <svg
                width={19}
                height={19}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.1}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 19V5" />
                <path d="M6 11l6-6 6 6" />
              </svg>
            )
          ) : isGenerationBusy ? (
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
              <MakeItArrowGlyph />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
