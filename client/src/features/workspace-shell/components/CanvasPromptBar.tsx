import React, { useEffect } from "react";
import { cn } from "@/utils/cn";
import { MotionIdeasPanel } from "@/features/prompt-optimizer/components/MotionIdeasPanel";
import {
  usePromptResultsActions,
  usePromptResultsData,
} from "@/features/prompt-optimizer/context/PromptResultsActionsContext";
import { useSelectedSpan } from "@/features/prompt-optimizer/context/SelectedSpanContext";
import { PromptEditorSurface } from "./PromptEditorSurface";
import type { PromptEditorSurfaceProps } from "./PromptEditorSurface";
import { addContinueSceneListener } from "../events";

export interface CanvasPromptBarProps {
  surfaceProps: PromptEditorSurfaceProps;
  /** Called when a featured tile dispatches CONTINUE_SCENE. */
  onContinueScene?: (fromGenerationId: string) => void;
  /** TuneDrawer slot — renders above the editor when open. */
  tuneSlot?: React.ReactNode;
  /** Settings row below the editor (chip set + Make-it pill). */
  chromeSlot?: React.ReactNode;
  /** "Your words" restore control — renders above the editor post-expansion. */
  yourWordsSlot?: React.ReactNode;
}

/**
 * Floating glass composer for the unified workspace.
 *
 * Always docked at bottom-center; never reflows between WorkspaceMoments.
 * The Tune drawer renders above the editor surface; the surface grows
 * upward while the bottom edge stays pinned at --workspace-composer-bottom
 * from the canvas bottom.
 *
 * The glass is conditional: while the bar is expanded (Tune drawer or the
 * suggestion tray open) it grows over canvas content, and translucency
 * would smear whatever sits behind it into unreadable blur — so the
 * expanded surface goes fully opaque and the blur comes off.
 */
export function CanvasPromptBar({
  surfaceProps,
  onContinueScene,
  tuneSlot = null,
  chromeSlot = null,
  yourWordsSlot = null,
}: CanvasPromptBarProps): React.ReactElement {
  useEffect(() => {
    if (!onContinueScene) return;
    return addContinueSceneListener((event) => {
      onContinueScene(event.detail.fromGenerationId);
    });
  }, [onContinueScene]);

  const { motionIdeas, isMotionIdeasLoading, i2vContext } =
    usePromptResultsData();
  const { onMotionIdeaSelect, onMotionIdeasReroll } = usePromptResultsActions();
  const { selectedSpanId } = useSelectedSpan();
  const showMotionIdeas =
    Boolean(i2vContext?.isI2VMode) &&
    Boolean(onMotionIdeaSelect) &&
    Boolean(onMotionIdeasReroll);
  const isExpanded = Boolean(tuneSlot) || Boolean(selectedSpanId);

  return (
    <div
      className={cn(
        "absolute left-1/2 z-10 -translate-x-1/2",
        "w-[min(100%-48px,var(--workspace-composer-max-w))]",
        "rounded-[14px] border border-white/[0.08]",
        isExpanded
          ? "bg-tool-surface-prompt-compact"
          : "bg-tool-surface-prompt/[0.72] backdrop-blur-[18px] backdrop-saturate-150",
        "shadow-[0_16px_48px_-8px_rgba(0,0,0,0.6),0_2px_8px_rgba(0,0,0,0.4)]",
        "transition-[transform,box-shadow,bottom] duration-[240ms]",
      )}
      style={{ bottom: "var(--workspace-composer-bottom)" }}
    >
      {tuneSlot}
      {yourWordsSlot}
      <PromptEditorSurface {...surfaceProps} variant="active" />
      {/* Idea Box progress/gate renders on the canvas stage (FrameStage),
          not in the composer — the frame owns the canvas. */}
      {showMotionIdeas && onMotionIdeaSelect && onMotionIdeasReroll ? (
        <div className="px-3 pb-2">
          <MotionIdeasPanel
            ideas={[...(motionIdeas ?? [])]}
            isLoading={Boolean(isMotionIdeasLoading)}
            onChipClick={onMotionIdeaSelect}
            onReroll={onMotionIdeasReroll}
          />
        </div>
      ) : null}
      {chromeSlot}
    </div>
  );
}
