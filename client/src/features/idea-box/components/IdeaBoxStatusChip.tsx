import React from "react";
import { cn } from "@/utils/cn";
import type { IdeaBoxStage } from "../types";

export interface IdeaBoxStatusChipProps {
  stage: IdeaBoxStage;
  /** Gate accept: dismisses the prompt; rendering stays the explicit next act. */
  onAccept?: (() => void) | undefined;
  /** Gate reject: regenerate the first frame from the current prompt. */
  onRegenerate?: (() => Promise<void> | void) | undefined;
}

/**
 * The Idea Box gate, rendered above the composer. While the chain generates a
 * frame it shows progress; when the frame lands it asks the one gate question
 * (does this match your idea?) with explicit accept/reject; on failure it
 * offers retry. Idle renders nothing.
 */
export function IdeaBoxStatusChip({
  stage,
  onAccept,
  onRegenerate,
}: IdeaBoxStatusChipProps): React.ReactElement | null {
  if (stage.kind === "idle") {
    return null;
  }

  const buttonClass = cn(
    "rounded-md border border-white/15 px-2 py-0.5 text-xs",
    "text-white/80 transition-colors hover:bg-white/10",
  );

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "mx-3 mt-2 flex flex-wrap items-center gap-2 rounded-md px-2.5 py-1.5 text-xs",
        stage.kind === "failed" ? "text-red-300/90" : "text-white/70",
      )}
    >
      {stage.kind === "framing" && (
        <>
          <span
            aria-hidden
            className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white/80"
          />
          Creating your first frame…
        </>
      )}

      {stage.kind === "ready" && (
        <>
          <span>Does this frame match your idea?</span>
          {onAccept ? (
            <button type="button" className={buttonClass} onClick={onAccept}>
              Looks right
            </button>
          ) : null}
          {onRegenerate ? (
            <button
              type="button"
              className={buttonClass}
              onClick={() => void onRegenerate()}
            >
              Try a different frame
            </button>
          ) : null}
        </>
      )}

      {stage.kind === "failed" && (
        <>
          <span>Couldn’t create a frame — {stage.message}.</span>
          {onRegenerate ? (
            <button
              type="button"
              className={buttonClass}
              onClick={() => void onRegenerate()}
            >
              Try again
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
