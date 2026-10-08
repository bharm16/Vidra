import React from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import { cn } from "@/utils/cn";
import type { FailureKind } from "../utils/deriveWorkspaceStage";
import { failureCopy } from "../utils/failureCopy";

export interface FailureNoticeProps {
  failure: FailureKind;
  onRetry: () => void;
}

/**
 * The single designed failure surface (ADR-0010 / M4 "nothing punishes"). States
 * what failed, reassures nothing was charged for the paid generation stages, and
 * offers one retry verb — all from the shared {@link failureCopy} map, driven by
 * the derived `{stage, failure}` flag rather than a parallel error machine.
 */
export function FailureNotice({
  failure,
  onRetry,
}: FailureNoticeProps): React.ReactElement {
  const copy = failureCopy(failure);
  return (
    <div
      role="alert"
      data-testid="failure-notice"
      className={cn(
        "mx-auto flex w-fit max-w-[520px] flex-col items-center gap-3",
        "rounded-card bg-[var(--vidra-stage-placeholder)] px-6 py-8 text-center ring-[0.5px] ring-inset ring-white",
      )}
    >
      <div className="flex flex-col gap-1">
        <p className="text-foreground m-0 text-ui font-normal">
          {copy.message}
        </p>
        {copy.notCharged ? (
          <p className="m-0 text-meta font-normal text-muted">
            Nothing was charged.
          </p>
        ) : null}
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
        {copy.retryLabel}
      </Button>
    </div>
  );
}
