import React, { useCallback, useState } from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import { cn } from "@/utils/cn";
import { retryClipAttachment } from "@/features/generations/api/takeAttachment";

/**
 * "Made, but not saved" — ADR-0022 decision 6.
 *
 * The clip is real, it is in durable storage, and the creator already paid for
 * it; what failed was filing it under their session. Saying so on the node is
 * the alternative to drawing a settled take that disappears on the next
 * refresh. It is never the failed-generation treatment: nothing here suggests
 * the render went wrong, because it did not.
 *
 * The retry re-attaches THIS take — a clip's take identity is its job id, so
 * the server rebuilds nothing and the request carries no media. It never reruns
 * generation and never touches credits.
 */
type RetryState = "idle" | "saving" | "saved" | "error";

const LABEL: Record<RetryState, string> = {
  idle: "Made, not saved",
  saving: "Saving…",
  saved: "Saved",
  error: "Still not saved",
};

export function UnattachedTakeBadge({
  takeId,
}: {
  /** The clip's take identity, which is also its job id. */
  takeId: string;
}): React.ReactElement {
  const [state, setState] = useState<RetryState>("idle");

  const onRetry = useCallback(
    (event: React.MouseEvent): void => {
      // The node itself is a button; saving is not selecting.
      event.stopPropagation();
      setState("saving");
      void retryClipAttachment(takeId)
        .then((attachment) => {
          setState(attachment?.state === "attached" ? "saved" : "error");
        })
        .catch(() => setState("error"));
    },
    [takeId],
  );

  return (
    <span
      data-testid={`take-unattached-${takeId}`}
      className={cn(
        "text-meta absolute bottom-2 left-2 inline-flex items-center gap-1.5",
        "border-tool-rail-border bg-tool-surface-deep/90 rounded-md border px-2 py-1",
        "text-tool-text-subdued",
      )}
    >
      {LABEL[state]}
      {state === "idle" || state === "error" ? (
        <Button
          type="button"
          variant="link"
          className="text-foreground !h-auto p-0 text-inherit underline underline-offset-2 hover:opacity-80"
          onClick={onRetry}
        >
          Save it
        </Button>
      ) : null}
    </span>
  );
}
