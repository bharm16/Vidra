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
        "border-tool-rail-border bg-tool-surface-card mx-auto flex max-w-[520px]",
        "flex-col items-center gap-3 rounded-xl border px-6 py-8 text-center",
      )}
    >
      <div className="flex flex-col gap-1">
        <p className="text-foreground m-0 text-[14px] font-medium">
          {copy.message}
        </p>
        {copy.notCharged ? (
          <p className="text-tool-text-subdued m-0 text-[12.5px]">
            Nothing was charged.
          </p>
        ) : null}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onRetry}
        className="border-tool-rail-border text-foreground rounded-md hover:bg-white/10"
      >
        {copy.retryLabel}
      </Button>
    </div>
  );
}
