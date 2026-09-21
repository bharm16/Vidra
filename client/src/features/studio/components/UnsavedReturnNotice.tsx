import React, { useState } from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import type { TakeAttachment } from "@shared/schemas/attachment.schemas";
import type { StudioUnresolvedReturn } from "../api/schemas";

/**
 * Recovery after refresh (ADR-0022 decision 6, issue #135): pictures of this
 * project whose return to a session was made but never attached, read from
 * the server's receipts when the project opened. Nothing here invents a
 * state — the server said the session is still owed the take, and the one
 * action offered is the same-take retry: re-send the record the receipt
 * holds, under the same identity. No re-upload, no second take, no
 * generation.
 *
 * A return pressed (and failed) during THIS visit is not shown here — the
 * return action itself carries that outcome; this surface is for what a
 * reload could otherwise lose.
 */
interface UnsavedReturnNoticeProps {
  returns: StudioUnresolvedReturn[];
  onRetry: (
    imageId: string,
    attachment: TakeAttachment,
  ) => Promise<{ ok: boolean; message?: string }>;
}

export function UnsavedReturnNotice({
  returns,
  onRetry,
}: UnsavedReturnNoticeProps): React.ReactElement | null {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  if (returns.length === 0) return null;

  const retry = async (
    imageId: string,
    attachment: TakeAttachment,
  ): Promise<void> => {
    setBusyId(imageId);
    setFailure(null);
    try {
      const result = await onRetry(imageId, attachment);
      if (!result.ok) {
        setFailure(result.message ?? "Could not save this picture");
      }
      // Success clears the entry through the reducer — the list is the
      // server's truth, and the server no longer owes this take.
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="st-topbar-right flex flex-col items-end gap-1">
      {returns.map(({ imageId, attachment }) => (
        <div key={imageId} className="flex items-center gap-2">
          <span className="st-topbar-label">
            A picture you sent to the session didn’t save.
          </span>
          {failure ? (
            <span className="st-topbar-label">{failure}</span>
          ) : null}
          {attachment.record ? (
            <Button
              variant="ghost"
              type="button"
              disabled={busyId !== null}
              onClick={() => void retry(imageId, attachment)}
            >
              {busyId === imageId ? "Saving…" : "Save it"}
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
