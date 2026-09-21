import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@promptstudio/system/components/ui/button";
import { Input } from "@promptstudio/system/components/ui/input";
import type { TakeAttachment } from "@shared/schemas/attachment.schemas";
import type { UseInSessionOutcome } from "../api/studioApi";

/**
 * "Use this in the session" — the studio's one return door (ADR-0022
 * decision 4, issues #89 and #131).
 *
 * Bound to the project's SELECTION rather than to a per-image control, for the
 * same reason an edit turn is: the selection is already the project's
 * persisted "this one", and one explicit action on it is the handoff the ADR
 * asks for — explicit, creator-invoked, one image at a time.
 *
 * It has three pieces of judgement, none of them errors:
 *
 *  - When the project's origin session is gone, the server refuses rather than
 *    recreating it, and the creator chooses whether to start a new one.
 *  - When a new session is owed, its associated words are the creator's to
 *    confirm (decision 2). The server never restores the edit instruction or
 *    the transform label as a session's words; it offers a from-scratch
 *    generate's prompt as an editable suggestion and requires an explicit
 *    confirmation. The `new-session` choice, once made, rides the confirmation
 *    so the same picture lands in the same one session.
 *  - The attachment outcome (decision 6, issue #135) decides what "returned"
 *    looks like. Only `attached` reads as added; `pending` reads as saving;
 *    `failed` reads as made-but-not-saved, with a retry that re-sends the
 *    take's own record under the same identity — no re-upload, no second
 *    take. A response with no attachment fact at all is an unknown, not a
 *    success, and says so.
 */

interface UseInSessionActionProps {
  /** Null when nothing is selected — the action has no subject then. */
  selectedImageId: string | null;
  onUse: (options?: {
    onMissingOriginSession?: "new-session";
    confirmedWords?: string;
  }) => Promise<UseInSessionOutcome>;
  /** The same-take retry, wired by the hook to the shared retry contract. */
  onRetryAttachment?: (
    imageId: string | null,
    attachment: TakeAttachment,
  ) => Promise<{ ok: boolean; message?: string }>;
}

export function UseInSessionAction({
  selectedImageId,
  onUse,
  onRetryAttachment,
}: UseInSessionActionProps): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<UseInSessionOutcome | null>(null);
  const [words, setWords] = useState("");
  const [retryFailure, setRetryFailure] = useState<string | null>(null);
  // The image the shown outcome belongs to, captured at press time — the
  // client half of the attempt binding (issue #129). The retry addresses the
  // pressed selection, never whatever is selected when the retry is pressed.
  const [pressedImageId, setPressedImageId] = useState<string | null>(null);
  // Sticky once the creator answers a gone origin session with "new session",
  // so the follow-up confirmation carries the same choice and does not resolve
  // to a second session.
  const [chooseNewSession, setChooseNewSession] = useState(false);

  const run = async (options?: {
    onMissingOriginSession?: "new-session";
    confirmedWords?: string;
  }): Promise<void> => {
    setBusy(true);
    setRetryFailure(null);
    setPressedImageId(selectedImageId);
    try {
      const next = await onUse(options);
      setOutcome(next);
      if (next.state === "needs-confirmed-words") {
        // Prefill the editable suggestion when the server offered one; leave
        // the field empty when it did not, so the creator types their own.
        setWords(next.suggestion ?? "");
      }
    } finally {
      setBusy(false);
    }
  };

  const retryAttachment = async (attachment: TakeAttachment): Promise<void> => {
    if (!onRetryAttachment) return;
    setBusy(true);
    setRetryFailure(null);
    try {
      const result = await onRetryAttachment(pressedImageId, attachment);
      if (result.ok) {
        // The take is in its session — the truthful end state, presented
        // exactly like a return that attached the first time.
        setOutcome((current) =>
          current?.state === "returned"
            ? {
                ...current,
                result: {
                  ...current.result,
                  attachment: { ...attachment, state: "attached" },
                },
              }
            : current,
        );
      } else {
        setRetryFailure(result.message ?? "Could not save this picture");
      }
    } finally {
      setBusy(false);
    }
  };

  if (outcome?.state === "returned") {
    const attachment = outcome.result.attachment;
    if (attachment?.state === "failed") {
      return (
        <div className="st-topbar-right flex items-center gap-2">
          <span className="st-topbar-label">
            Made, but not saved — the session is missing this picture.
          </span>
          {retryFailure ? (
            <span className="st-topbar-label">{retryFailure}</span>
          ) : null}
          {attachment.record && onRetryAttachment ? (
            <Button
              variant="ghost"
              type="button"
              disabled={busy}
              onClick={() => void retryAttachment(attachment)}
            >
              {busy ? "Saving…" : "Save it"}
            </Button>
          ) : null}
          <Link
            className="st-topbar-label underline"
            to={`/session/${outcome.result.sessionId}`}
          >
            Open it
          </Link>
        </div>
      );
    }
    if (attachment?.state === "pending") {
      return (
        <div className="st-topbar-right flex items-center gap-2">
          <span className="st-topbar-label">Saving to the session…</span>
        </div>
      );
    }
    if (attachment?.state !== "attached") {
      // No attachment fact — the outcome is unknown, which is not a success.
      return (
        <div className="st-topbar-right flex items-center gap-2">
          <span className="st-topbar-label">
            Couldn’t confirm whether it saved.
          </span>
          <Link
            className="st-topbar-label underline"
            to={`/session/${outcome.result.sessionId}`}
          >
            Open it
          </Link>
        </div>
      );
    }
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
          onClick={() => {
            setChooseNewSession(true);
            void run({ onMissingOriginSession: "new-session" });
          }}
        >
          Start a new session
        </Button>
      </div>
    );
  }

  if (outcome?.state === "needs-confirmed-words") {
    const trimmed = words.trim();
    const confirm = (): void => {
      if (trimmed.length === 0) return;
      void run({
        confirmedWords: trimmed,
        ...(chooseNewSession
          ? { onMissingOriginSession: "new-session" as const }
          : {}),
      });
    };
    return (
      <div className="st-topbar-right flex items-center gap-2">
        <span className="st-topbar-label">{outcome.message}</span>
        <Input
          value={words}
          disabled={busy}
          placeholder="Words this session starts from"
          onChange={(event) => setWords(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") confirm();
          }}
        />
        <Button
          variant="ghost"
          type="button"
          disabled={busy || trimmed.length === 0}
          onClick={confirm}
        >
          {busy ? "Adding…" : "Start the session"}
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
