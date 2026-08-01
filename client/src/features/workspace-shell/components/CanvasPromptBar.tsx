import React, { useEffect } from "react";
import { cn } from "@/utils/cn";
import { useSelectedSpan } from "@/features/prompt-optimizer/context/SelectedSpanContext";
import { PromptEditorSurface } from "./PromptEditorSurface";
import type { PromptEditorSurfaceProps } from "./PromptEditorSurface";
import { AnchorSheet } from "./AnchorSheet";
import { addContinueSceneListener } from "../events";
import "./composer.css";

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
  /**
   * ADR-0015: media has focus — the text area goes and the control row
   * survives as a slim toolbar hugging its controls at the same dock anchor.
   * Text is only ever edited in the open box, so the bar shows no prompt.
   */
  collapsed?: boolean;
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
  collapsed = false,
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
    // fill-only starter pills below it, plus its entrance / focus flourishes.
    return (
      <AnchorSheet
        surfaceProps={surfaceProps}
        chromeSlot={chromeSlot}
        yourWordsSlot={yourWordsSlot}
        footerSlot={footerSlot}
      />
    );
  }

  // One composer, two states (ADR-0015). The collapsed toolbar and the open
  // box share ONE root and ONE mounted editor: the managed contenteditable
  // re-initializes on mount, so unmounting it while collapsed would clobber
  // take-restore fills that arrive with the box closed. Collapsing hides the
  // text surface; the control row survives as a hugging pill at the same dock.
  return (
    <div
      data-testid={collapsed ? "composer-toolbar" : undefined}
      className={cn(
        "absolute left-1/2 z-10 -translate-x-1/2",
        // One edge treatment — a hairline, same as the Anchor sheet.
        "border-hairline border-border",
        "transition-[transform,bottom] duration-[240ms]",
        collapsed
          ? cn(
              "inline-flex w-auto items-center rounded-xl",
              // Translucent so the glass has something to work on — an opaque
              // surface behind a backdrop filter renders no glass at all.
              "bg-card/[0.92] [backdrop-filter:var(--blur-glass)]",
            )
          : cn(
              "w-[min(100%-48px,664px)] rounded-xl",
              isExpanded
                ? "bg-card"
                : "bg-card/[0.72] [backdrop-filter:var(--blur-glass)]",
            ),
      )}
      style={{ bottom: "var(--workspace-composer-bottom)" }}
    >
      <div
        hidden={collapsed}
        className={cn(
          // Frame A prompt text: 18px sans at 1.55 with the accent
          // caret; the vars feed the editor's [contenteditable] rules.
          "[caret-color:var(--accent)]",
          !collapsed && "ps-composer-reveal",
        )}
        style={
          {
            "--editor-font-size": "var(--text-body-lg)",
            "--editor-line-height": "var(--text-body-lg-lh)",
            "--editor-letter-spacing": "var(--text-body-lg-ls)",
          } as React.CSSProperties
        }
      >
        {yourWordsSlot}
        <PromptEditorSurface {...surfaceProps} variant="active" />
      </div>
      {/* Idea Box progress/gate renders on the canvas stage (FrameStage),
          not in the composer — the frame owns the canvas. */}
      {chromeSlot}
    </div>
  );
}
