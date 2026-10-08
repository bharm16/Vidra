import React from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import { cn } from "@/utils/cn";
import type { KeyframeTile } from "@/features/generation-controls/types";
import {
  usePromptResultsActions,
  usePromptResultsData,
} from "@/features/prompt-optimizer/context/PromptResultsActionsContext";
import expandingIcon from "@/assets/design-system/frame-expanding.svg";
import framingIcon from "@/assets/design-system/frame-framing.svg";
import failureIcon from "@/assets/design-system/frame-failed.svg";

export interface FrameStageProps {
  startFrame: KeyframeTile | null;
  prompt: string;
}

interface FrameStageViewProps extends FrameStageProps {
  data: Pick<
    ReturnType<typeof usePromptResultsData>,
    | "ideaBoxStage"
    | "isExpanding"
    | "hasExpandedPrompt"
    | "unattachedFrameTake"
    | "pendingReference"
  >;
  actions: Pick<
    ReturnType<typeof usePromptResultsActions>,
    | "onIdeaBoxAccept"
    | "onIdeaBoxRegenerate"
    | "onRetryFrameAttachment"
    | "onAdmitPendingReference"
  >;
}

const CARD_CLASS =
  "relative w-full max-w-[656px] overflow-hidden rounded-card bg-[var(--vidra-stage-panel)] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:ring-[0.5px] after:ring-inset after:ring-white after:content-['']";

function StageCopy({
  headline,
  detail,
}: {
  headline: string;
  detail?: string | undefined;
}): React.ReactElement {
  return (
    <>
      <p className="m-0 text-ui font-normal text-foreground">{headline}</p>
      {detail ? (
        <p className="m-0 text-meta font-normal text-foreground">{detail}</p>
      ) : (
        <div className="h-[18px]" />
      )}
    </>
  );
}

function StageNoticeTile({
  headline,
  detail,
  icon,
  actionLabel,
  onAction,
  actionDisabled = false,
}: {
  headline: string;
  detail?: string | undefined;
  icon?: string | undefined;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
  actionDisabled?: boolean;
}): React.ReactElement {
  return (
    <div className={CARD_CLASS} data-testid="frame-stage-notice">
      <div className="flex aspect-[164/125] min-h-[226px] w-full flex-col items-center justify-center bg-[var(--vidra-stage-placeholder)] p-6">
        <div className="flex w-full max-w-[584px] flex-col items-center gap-3 text-center">
          {icon ? <img src={icon} alt="" draggable={false} /> : null}
          <p className="m-0 text-body font-normal text-foreground">
            {headline}
          </p>
          {detail ? (
            <p className="m-0 text-ui font-normal text-foreground">{detail}</p>
          ) : null}
          {actionLabel && onAction ? (
            <Button
              type="button"
              variant="secondary"
              onClick={onAction}
              disabled={actionDisabled}
            >
              {actionLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MediaCard({
  url,
  label,
  contain = false,
  children,
}: {
  url: string;
  label: string;
  contain?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className={CARD_CLASS} data-testid="frame-stage-media">
      <div className="relative aspect-video w-full bg-[var(--vidra-stage-panel)]">
        <img
          src={url}
          alt={label}
          className={cn(
            "absolute inset-0 h-full w-full",
            contain ? "object-contain" : "object-cover",
          )}
        />
      </div>
      <div className="flex min-h-[131px] flex-col items-start gap-1 bg-[var(--vidra-stage-panel)] p-4">
        {children}
      </div>
    </div>
  );
}

/** The real loop state and callbacks feed the same Page 21 compound in every beat. */
export function FrameStage({
  startFrame,
  prompt,
}: FrameStageProps): React.ReactElement | null {
  const data = usePromptResultsData();
  const actions = usePromptResultsActions();
  return (
    <FrameStageView
      startFrame={startFrame}
      prompt={prompt}
      data={data}
      actions={actions}
    />
  );
}

/** Presentation seam for the ready, unsaved, reference, pending and failed states. */
export function FrameStageView({
  startFrame,
  prompt,
  data,
  actions,
}: FrameStageViewProps): React.ReactElement | null {
  const {
    ideaBoxStage,
    isExpanding,
    hasExpandedPrompt,
    unattachedFrameTake,
    pendingReference,
  } = data;
  const {
    onIdeaBoxAccept,
    onIdeaBoxRegenerate,
    onRetryFrameAttachment,
    onAdmitPendingReference,
  } = actions;
  const stageKind = ideaBoxStage?.kind ?? "idle";
  const quotedIdea = prompt.trim() ? "“" + prompt.trim() + "”" : undefined;
  let body: React.ReactElement | null = null;

  if (pendingReference) {
    const headline = pendingReference.uploading
      ? "Uploading your reference…"
      : pendingReference.attachmentFailed
        ? "Made, but not saved"
        : pendingReference.attempted
          ? "Reference waiting to be saved"
          : "Reference waiting for your words";
    const detail = pendingReference.uploading
      ? "Wait for the picture to finish uploading before expanding your words."
      : pendingReference.attempted
        ? "Retry saving this picture with its original words."
        : "Write and expand your words below, then use this picture with them.";
    if (pendingReference.uploading || !pendingReference.url) {
      body = (
        <StageNoticeTile
          headline={headline}
          detail={detail}
          {...(!pendingReference.uploading && onAdmitPendingReference
            ? {
                actionLabel: pendingReference.busy
                  ? "Saving…"
                  : pendingReference.attempted
                    ? "Retry saving"
                    : "Use with these words",
                onAction: () => void onAdmitPendingReference(),
                actionDisabled: pendingReference.busy,
              }
            : {})}
        />
      );
    } else {
      body = (
        <MediaCard
          url={pendingReference.url}
          label="Pending reference picture"
          contain
        >
          <StageCopy headline={headline} detail={detail} />
          <div className="min-h-0 flex-1" />
          {onAdmitPendingReference ? (
            <div className="flex w-full justify-end">
              <Button
                type="button"
                className="w-[192px]"
                disabled={pendingReference.busy}
                onClick={() => void onAdmitPendingReference()}
              >
                {pendingReference.busy
                  ? "Saving…"
                  : pendingReference.attempted
                    ? "Retry saving"
                    : "Use with these words"}
              </Button>
            </div>
          ) : null}
        </MediaCard>
      );
    }
  } else if (isExpanding) {
    body = (
      <StageNoticeTile
        headline="Expanding your idea…"
        detail={quotedIdea}
        icon={expandingIcon}
      />
    );
  } else if (stageKind === "framing") {
    body = (
      <StageNoticeTile
        headline="Painting your first frame…"
        icon={framingIcon}
      />
    );
  } else if (stageKind === "failed") {
    const failedStage = ideaBoxStage?.kind === "failed" ? ideaBoxStage : null;
    const repeated = (failedStage?.consecutiveFailures ?? 1) >= 2;
    body = (
      <StageNoticeTile
        headline={
          repeated ? "Still couldn’t create a frame" : "Couldn’t create a frame"
        }
        detail={
          repeated
            ? "This looks like a problem on our side — give it a minute and try again."
            : (failedStage?.message ?? "Image generation failed")
        }
        icon={failureIcon}
        {...(onIdeaBoxRegenerate
          ? {
              actionLabel: "Try again",
              onAction: () => void onIdeaBoxRegenerate(),
            }
          : {})}
      />
    );
  } else if (startFrame) {
    const gate = stageKind === "ready";
    body = (
      <MediaCard url={startFrame.url} label="Your first frame">
        <StageCopy
          headline={
            gate ? "Does this frame match your idea?" : "Your first frame"
          }
          {...(!gate && !unattachedFrameTake
            ? { detail: "Describe its motion below, then Make it." }
            : {})}
        />
        <div className="min-h-0 flex-1" />
        {gate ? (
          <div className="flex w-full flex-wrap items-center gap-3">
            {onIdeaBoxRegenerate ? (
              <Button
                type="button"
                variant="secondary"
                className="w-[192px]"
                onClick={() => void onIdeaBoxRegenerate()}
              >
                Try a different frame
              </Button>
            ) : null}
            {onIdeaBoxAccept ? (
              <Button
                type="button"
                className="ml-auto w-28"
                onClick={onIdeaBoxAccept}
              >
                Looks right
              </Button>
            ) : null}
          </div>
        ) : null}
        {unattachedFrameTake ? (
          <div className="flex w-full items-center gap-3">
            <span className="text-meta font-normal text-foreground">
              Made, but not saved
            </span>
            {onRetryFrameAttachment ? (
              <Button
                type="button"
                className="ml-auto w-[88px]"
                onClick={() => void onRetryFrameAttachment()}
              >
                Save it
              </Button>
            ) : null}
          </div>
        ) : null}
      </MediaCard>
    );
  } else if (unattachedFrameTake) {
    body = (
      <StageNoticeTile
        headline="Made, but not saved"
        detail="Your picture already exists. Save it to this session without making it again."
        {...(onRetryFrameAttachment
          ? {
              actionLabel: "Save it",
              onAction: () => void onRetryFrameAttachment(),
            }
          : {})}
      />
    );
  } else if (hasExpandedPrompt) {
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
      className="mx-auto w-full max-w-[656px] py-4"
      data-testid="frame-stage"
    >
      {body}
    </div>
  );
}
