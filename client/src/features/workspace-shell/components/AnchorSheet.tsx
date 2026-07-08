import React, { useEffect } from "react";

import { PromptEditorSurface } from "./PromptEditorSurface";
import type { PromptEditorSurfaceProps } from "./PromptEditorSurface";

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
      {/* Accent bloom behind the sheet (first in DOM → paints under the card).
          Opacity/scale animate via the sheet's :focus-within (see index.css). */}
      <div
        aria-hidden
        className="ps-focus-bloom absolute left-1/2 top-[-90px] h-[440px] w-[820px]"
      />
      {/* The glass card. */}
      <div
        className="ps-rise relative w-full rounded-[20px] border border-white/[0.10] bg-white/[0.045] px-7 pb-4 pt-6 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.8),0_8px_26px_rgba(0,0,0,0.5)] backdrop-blur-[16px] backdrop-saturate-150"
        style={{ animationDelay: "0.44s" }}
      >
        {yourWordsSlot}
        <PromptEditorSurface {...surfaceProps} variant="empty" />
        {chromeSlot}
        <div
          aria-hidden
          className="ps-focus-ring absolute inset-[-1px] rounded-[21px]"
        />
      </div>
      {footerSlot ? (
        <div className="ps-rise" style={{ animationDelay: "0.62s" }}>
          {footerSlot}
        </div>
      ) : null}
    </div>
  );
}
