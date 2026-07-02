import React from "react";
import { cn } from "@/utils/cn";
import type { KeyframeTile } from "@/features/generation-controls/types";
import {
  usePromptResultsActions,
  usePromptResultsData,
} from "@/features/prompt-optimizer/context/PromptResultsActionsContext";

export interface FrameStageProps {
  /** Current start frame, if the loop has produced (or been given) one. */
  startFrame: KeyframeTile | null;
  /** Current composer text — quoted while the idea is being expanded. */
  prompt: string;
}

const TILE_CLASS =
  "relative mx-auto aspect-video w-full max-w-[720px] overflow-hidden rounded-xl border border-tool-rail-border";

function StageCopy({
  headline,
  detail,
}: {
  headline: string;
  detail?: string | undefined;
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <p className="text-foreground m-0 text-[14px] font-medium">{headline}</p>
      {detail ? (
        <p className="text-tool-text-subdued m-0 max-w-[520px] truncate text-[12.5px]">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The stage's single designed notice: one tile, one message, at most one
 * action — all inside the frame slot, so the no-frame beat still reads as
 * "the frame owns the canvas" rather than copy floating over a void.
 */
function StageNoticeTile({
  headline,
  detail,
  actionLabel,
  onAction,
}: {
  headline: string;
  detail?: string | undefined;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
}): React.ReactElement {
  return (
    <div
      className={cn(
        TILE_CLASS,
        "bg-tool-surface-card flex flex-col items-center justify-center gap-3 px-6",
      )}
      data-testid="frame-stage-notice"
    >
      <StageCopy headline={headline} detail={detail} />
      {actionLabel && onAction ? (
        <button
          type="button"
          className={cn(
            "border-tool-rail-border rounded-md border px-3 py-1.5 text-[12.5px]",
            "text-foreground transition-colors hover:bg-white/10",
          )}
          onClick={onAction}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function SkeletonTile(): React.ReactElement {
  return (
    <div className={cn(TILE_CLASS, "bg-tool-surface-card")} aria-hidden>
      <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/[0.04] via-transparent to-white/[0.02]" />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/15 border-t-white/60" />
      </div>
    </div>
  );
}

/**
 * The canvas stage for the expansion loop. The first frame — or its pending
 * or failed state — owns the canvas at every beat; the prompt stays in the
 * composer as its editable caption (CONTEXT.md, "First frame").
 *
 * Renders nothing once real generations exist (ShotRows own the canvas) and
 * nothing on the untouched empty canvas (EmptyHero owns it).
 */
export function FrameStage({
  startFrame,
  prompt,
}: FrameStageProps): React.ReactElement | null {
  const { ideaBoxStage, isExpanding, hasExpandedPrompt } =
    usePromptResultsData();
  const { onIdeaBoxAccept, onIdeaBoxRegenerate } = usePromptResultsActions();

  const stageKind = ideaBoxStage?.kind ?? "idle";
  const quotedIdea = prompt.trim() ? `“${prompt.trim()}”` : undefined;

  const gateButtonClass = cn(
    "rounded-md border border-tool-rail-border px-3 py-1.5 text-[12.5px]",
    "text-foreground transition-colors hover:bg-white/10",
  );

  let body: React.ReactElement | null = null;

  if (isExpanding) {
    body = (
      <>
        <SkeletonTile />
        <StageCopy headline="Expanding your idea…" detail={quotedIdea} />
      </>
    );
  } else if (stageKind === "framing") {
    body = (
      <>
        <SkeletonTile />
        <StageCopy headline="Painting your first frame…" />
      </>
    );
  } else if (stageKind === "failed") {
    const failedStage = ideaBoxStage?.kind === "failed" ? ideaBoxStage : null;
    // After repeated identical failures, retrying is clearly not working —
    // acknowledge a systemic problem instead of looping the same copy (B7).
    const isRepeatedFailure = (failedStage?.consecutiveFailures ?? 1) >= 2;
    const headline = isRepeatedFailure
      ? "Still couldn’t create a frame"
      : "Couldn’t create a frame";
    const message = isRepeatedFailure
      ? "This looks like a problem on our side — give it a minute and try again."
      : (failedStage?.message ?? "Image generation failed");
    // One designed state: the message and its single retry live inside the
    // frame slot — no competing "No frame yet" placeholder beside the error.
    body = (
      <StageNoticeTile
        headline={headline}
        detail={message}
        {...(onIdeaBoxRegenerate
          ? {
              actionLabel: "Try again",
              onAction: () => void onIdeaBoxRegenerate(),
            }
          : {})}
      />
    );
  } else if (startFrame) {
    const isGate = stageKind === "ready";
    body = (
      <>
        <div className={TILE_CLASS}>
          <img
            src={startFrame.url}
            alt="Your first frame"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
        {isGate ? (
          <div className="flex flex-col items-center gap-2">
            <StageCopy headline="Does this frame match your idea?" />
            <div className="flex items-center gap-2">
              {onIdeaBoxAccept ? (
                <button
                  type="button"
                  className={cn(
                    gateButtonClass,
                    "bg-foreground text-tool-surface-deep hover:opacity-90",
                  )}
                  onClick={onIdeaBoxAccept}
                >
                  Looks right
                </button>
              ) : null}
              {onIdeaBoxRegenerate ? (
                <button
                  type="button"
                  className={gateButtonClass}
                  onClick={() => void onIdeaBoxRegenerate()}
                >
                  Try a different frame
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <StageCopy
            headline="Your first frame"
            detail="Describe its motion below, then Make it."
          />
        )}
      </>
    );
  } else if (hasExpandedPrompt) {
    // Restored session with an expanded prompt but no frame asset: the
    // stage's no-frame state owns the canvas (never the first-run hero).
    // The single action re-runs frame generation from the current prompt.
    body = (
      <StageNoticeTile
        headline="No frame yet"
        detail="Create a first frame to put this prompt on the canvas."
        {...(onIdeaBoxRegenerate
          ? {
              actionLabel: "Create frame",
              onAction: () => void onIdeaBoxRegenerate(),
            }
          : {})}
      />
    );
  }

  if (!body) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto flex min-h-[calc(100vh-var(--workspace-topbar-h)-240px)] max-w-[840px] flex-col items-center justify-center gap-5 py-8"
      data-testid="frame-stage"
    >
      {body}
    </div>
  );
}
