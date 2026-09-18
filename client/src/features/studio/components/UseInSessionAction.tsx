import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@promptstudio/system/components/ui/button";
import type { UseInSessionOutcome } from "../api/studioApi";

/**
 * "Use this in the session" — the studio's one return door (ADR-0022
 * decision 4, issue #89).
 *
 * Bound to the project's SELECTION rather than to a per-image control, for the
 * same reason an edit turn is: the selection is already the project's
 * persisted "this one", and one explicit action on it is the handoff the ADR
 * asks for — explicit, creator-invoked, one image at a time.
 *
 * It has exactly one piece of judgement: when the project's origin session is
 * gone, the server refuses rather than recreating it, and the creator is
 * offered the choice here. The refusal is not shown as an error, because it is
 * a question.
 */

interface UseInSessionActionProps {
  /** Null when nothing is selected — the action has no subject then. */
  selectedImageId: string | null;
  onUse: (options?: {
    onMissingOriginSession?: "new-session";
  }) => Promise<UseInSessionOutcome>;
}

export function UseInSessionAction({
  selectedImageId,
  onUse,
}: UseInSessionActionProps): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<UseInSessionOutcome | null>(null);

  const run = async (options?: {
    onMissingOriginSession?: "new-session";
  }): Promise<void> => {
    setBusy(true);
    try {
      setOutcome(await onUse(options));
    } finally {
      setBusy(false);
    }
  };

  if (outcome?.state === "returned") {
    return (
      <div className="st-topbar-right flex items-center gap-2">
        <span className="st-topbar-label">Added to the session.</span>
        <Link
          className="st-topbar-label underline"
          to={`/session/${outcome.result.sessionId}`}
        >
          Open it
        </Link>
      </div>
    );
  }

  if (outcome?.state === "origin-session-missing") {
    return (
      <div className="st-topbar-right flex items-center gap-2">
        <span className="st-topbar-label">{outcome.message}</span>
        <Button
          variant="ghost"
          type="button"
          disabled={busy}
          onClick={() => void run({ onMissingOriginSession: "new-session" })}
        >
          Start a new session
        </Button>
      </div>
    );
  }

  return (
    <div className="st-topbar-right">
      <Button
        variant="ghost"
        type="button"
        disabled={busy || !selectedImageId}
        onClick={() => void run()}
      >
        {busy ? "Adding…" : "Use this in the session"}
      </Button>
    </div>
  );
}
