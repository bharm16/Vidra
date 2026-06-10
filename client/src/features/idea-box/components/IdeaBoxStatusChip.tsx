import React from "react";
import { cn } from "@/utils/cn";
import type { IdeaBoxStage } from "../types";

export interface IdeaBoxStatusChipProps {
  stage: IdeaBoxStage;
}

/**
 * Small status line shown above the composer while the Idea Box chain is
 * generating the first frame (or when it failed). Idle/ready render nothing —
 * "ready" is communicated by the start frame itself appearing.
 */
export function IdeaBoxStatusChip({
  stage,
}: IdeaBoxStatusChipProps): React.ReactElement | null {
  if (stage.kind !== "framing" && stage.kind !== "failed") {
    return null;
  }

  const isFraming = stage.kind === "framing";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "mx-3 mt-2 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs",
        isFraming ? "text-white/70" : "text-red-300/90",
      )}
    >
      {isFraming ? (
        <>
          <span
            aria-hidden
            className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white/80"
          />
          Creating your first frame…
        </>
      ) : (
        <>
          Couldn’t create a frame — {stage.message}. Edit the prompt and try
          again.
        </>
      )}
    </div>
  );
}
