import React, { useEffect } from "react";
import { cn } from "@/utils/cn";
import { useSelectedSpan } from "@/features/prompt-optimizer/context/SelectedSpanContext";
import { PromptEditorSurface } from "./PromptEditorSurface";
import type { PromptEditorSurfaceProps } from "./PromptEditorSurface";
import { addContinueSceneListener } from "../events";

export interface CanvasPromptBarProps {
  surfaceProps: PromptEditorSurfaceProps;
  /** Called when a featured tile dispatches CONTINUE_SCENE. */
  onContinueScene?: (fromGenerationId: string) => void;
  /** Settings row below the editor (chip set + Make-it pill). */
  chromeSlot?: React.ReactNode;
  /** "Your words" restore control — renders above the editor post-expansion. */
  yourWordsSlot?: React.ReactNode;
  /**
   * Pre-work (empty state): the composer becomes the Anchor's centered glass
   * prompt sheet — wider, softer glass, its own padding, a 26px editor — with
   * the starter pills below it. The docked/working form is untouched.
   */
  isPreWork?: boolean;
  /** Rendered below the sheet in pre-work — the fill-only starter pills. */
  footerSlot?: React.ReactNode;
}

/**
 * Floating glass composer for the unified workspace.
 *
 * Always docked at bottom-center; never reflows between WorkspaceMoments.
 * The surface grows upward while the bottom edge stays pinned at
 * --workspace-composer-bottom from the canvas bottom.
 *
 * The glass is conditional: while the bar is expanded (the suggestion
 * tray open) it grows over canvas content, and translucency
 * would smear whatever sits behind it into unreadable blur — so the
 * expanded surface goes fully opaque and the blur comes off.
 */
export function CanvasPromptBar({
  surfaceProps,
  onContinueScene,
  chromeSlot = null,
  yourWordsSlot = null,
  isPreWork = false,
  footerSlot = null,
}: CanvasPromptBarProps): React.ReactElement {
  useEffect(() => {
    if (!onContinueScene) return;
    return addContinueSceneListener((event) => {
      onContinueScene(event.detail.fromGenerationId);
    });
  }, [onContinueScene]);

  const { selectedSpanId } = useSelectedSpan();
  const isExpanded = Boolean(selectedSpanId);

  if (isPreWork) {
    // The Anchor sheet: a centered glass card (the input, at 26px) with the
    // fill-only starter pills below it. Its bottom is pinned at the raised
    // --workspace-composer-bottom and it grows upward as words arrive.
    return (
      <div
        className="absolute left-1/2 z-10 flex w-[672px] max-w-[calc(100%-48px)] -translate-x-1/2 flex-col items-center transition-[bottom] duration-[240ms]"
        style={{ bottom: "var(--workspace-composer-bottom)" }}
      >
        <div className="w-full rounded-[20px] border border-white/[0.10] bg-white/[0.045] px-7 pb-4 pt-6 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.8),0_8px_26px_rgba(0,0,0,0.5)] backdrop-blur-[16px] backdrop-saturate-150">
          {yourWordsSlot}
          <PromptEditorSurface {...surfaceProps} variant="empty" />
          {chromeSlot}
        </div>
        {footerSlot}
      </div>
    );
  }

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
      {yourWordsSlot}
      <PromptEditorSurface {...surfaceProps} variant="active" />
      {/* Idea Box progress/gate renders on the canvas stage (FrameStage),
          not in the composer — the frame owns the canvas. */}
      {chromeSlot}
    </div>
  );
}
