import React, { useEffect } from "react";

import { PromptEditorSurface } from "./PromptEditorSurface";
import type { PromptEditorSurfaceProps } from "./PromptEditorSurface";
import "./composer.css";

interface AnchorSheetProps {
  surfaceProps: PromptEditorSurfaceProps;
  /** Settings row (aspect · duration · circular submit) below the editor. */
  chromeSlot?: React.ReactNode;
  /** "Your words" restore control — renders above the editor. */
  yourWordsSlot?: React.ReactNode;
  /** Fill-only starter pills, below the sheet. */
  footerSlot?: React.ReactNode;
}

/**
 * The Anchor's centered glass prompt sheet — the pre-work face of the composer
 * (design_handoff_vidra). It rises in on entrance, autofocuses shortly after,
 * and wakes an accent bloom + ring while the input holds focus (via the sheet's
 * :focus-within — no focus events needed). The docked composer (CanvasPromptBar's
 * other branch) is untouched.
 */
export function AnchorSheet({
  surfaceProps,
  chromeSlot = null,
  yourWordsSlot = null,
  footerSlot = null,
}: AnchorSheetProps): React.ReactElement {
  const { editorRef } = surfaceProps;

  // Autofocus the input shortly after the entrance settles (handoff ~760ms).
  useEffect(() => {
    const t = window.setTimeout(() => editorRef.current?.focus(), 760);
    return () => window.clearTimeout(t);
  }, [editorRef]);

  return (
    <div
      className="ps-anchor-sheet absolute left-1/2 z-10 flex w-[672px] max-w-[calc(100%-48px)] -translate-x-1/2 flex-col items-center transition-[bottom] duration-[240ms]"
      style={{ bottom: "var(--workspace-composer-bottom)" }}
    >
      {/* The card. Two concentric surfaces: the outer holds the parameter row,
          the inner holds the prompt. The inner is flush to the outer edges, so
          they share a radius rather than needing an inset one — the outer
          therefore carries no padding of its own. A hairline does the
          separating work; no shadow stack, one blur. */}
      <div
        className="ps-rise border-hairline border-border bg-card relative w-full rounded-xl [backdrop-filter:var(--blur-glass)]"
        style={{ animationDelay: "0.44s" }}
      >
        {yourWordsSlot}
        <div className="bg-surface-2 flex flex-col gap-2 rounded-xl p-3">
          <PromptEditorSurface {...surfaceProps} variant="empty" />
        </div>
        <div className="flex flex-col gap-2 p-3">{chromeSlot}</div>
      </div>
      {footerSlot ? (
        <div className="ps-rise w-full" style={{ animationDelay: "0.62s" }}>
          {footerSlot}
        </div>
      ) : null}
    </div>
  );
}
