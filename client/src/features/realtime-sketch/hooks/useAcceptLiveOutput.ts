import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { acceptLiveOutput } from "../api/acceptLiveOutput";
import { retryPictureAttachment } from "@/features/generations/api/takeAttachment";
import type { TakeAttachment } from "@shared/schemas/attachment.schemas";
import type { LiveOutput } from "./generationReducer";

/**
 * Pressing "Use this" — ADR-0022 decision 5, issue #87.
 *
 * The action takes the output it is accepting AS AN ARGUMENT. That is the
 * whole mechanism: the component that shows the picture hands over the object
 * it is showing, and nothing in here reads the sketchpad, the settings, or
 * "the current live output" afterwards. A newer result may land while the
 * request is in flight; it changes what the editor displays and nothing about
 * what was accepted.
 *
 * The outcome is reported, never assumed (issue #134): the response's
 * attachment fact decides what the creator is told. `attached` is the only
 * state that moves them into the session; `pending` or `failed` is a picture
 * that was MADE but not SAVED — shown truthfully as such, with a retry that
 * re-attaches the same take through the shared record door (never a re-accept,
 * never a second take). The schema requires the fact, so a response that
 * cannot state its outcome is refused at the wire and lands here as a
 * failure — never silently read as "attached".
 *
 * The verb is accept, never "Keep" — Keep ends the clip loop (ADR-0010).
 */

export type AcceptanceStatus =
  | { state: "idle" }
  | { state: "accepting" }
  /**
   * Made-but-not-saved (ADR-0022 decision 6): the take exists — media durable,
   * identity minted — and its session does not have it yet. `attachment` is
   * exactly what the retry re-sends. `message` carries a retry failure's
   * reason while the debt itself stays retryable.
   */
  | { state: "unattached"; attachment: TakeAttachment; message?: string }
  /** The retry's record-POST is in flight; the same take, nothing else. */
  | { state: "saving"; attachment: TakeAttachment }
  | { state: "failed"; message: string };

export interface UseAcceptLiveOutputReturn {
  status: AcceptanceStatus;
  accept: (output: LiveOutput) => void;
  /** Re-attach the made-but-not-saved take — the SAME take, no re-accept. */
  retryAttachment: () => void;
}

/**
 * One acceptance key per picture, stable across re-presses.
 *
 * The editor's request ids restart at 1 on every mount, so they are scoped by
 * a per-mount token before they can name an acceptance. A second press on the
 * same picture then replays the first through the admission boundary instead
 * of minting a second session and a second take.
 */
function mintEditorScope(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * One acceptance attempt, immutable once built at the press (issue #129): the
 * identity the server de-duplicates on, bound to the exact output it was
 * pressed for. A newer press replaces the attempt; a response is applied only
 * while its own attempt is still the current one.
 */
interface AcceptanceAttempt {
  readonly idempotencyKey: string;
  readonly output: LiveOutput;
}

export function useAcceptLiveOutput(): UseAcceptLiveOutputReturn {
  const navigate = useNavigate();
  const [status, setStatus] = useState<AcceptanceStatus>({ state: "idle" });
  // The mirror the callbacks read: an updater must stay pure (no request
  // kicked off inside it — StrictMode would fire it twice), so the side
  // effects live out here and judge the freshest state through the ref.
  const statusRef = useRef<AcceptanceStatus>({ state: "idle" });
  /** The one writer: resolves through setState AND keeps the mirror honest. */
  const apply = useCallback(
    (
      next:
        | AcceptanceStatus
        | ((latest: AcceptanceStatus) => AcceptanceStatus),
    ): void => {
      if (typeof next !== "function") {
        // Written synchronously, so a guard reading the ref in the same tick
        // — a second click on the retry, say — sees the new state, not the
        // one a queued updater has not produced yet.
        statusRef.current = next;
        setStatus(next);
        return;
      }
      setStatus((latest) => {
        const resolved = next(latest);
        statusRef.current = resolved;
        return resolved;
      });
    },
    [],
  );
  const editorScopeRef = useRef<string | null>(null);
  editorScopeRef.current ??= mintEditorScope();
  // The current attempt; a newer press supersedes an in-flight one.
  const attemptRef = useRef<AcceptanceAttempt | null>(null);
  // The acceptance applies where it was pressed from: the live editor. If the
  // creator has left (the editor unmounted), the acceptance still happened —
  // the take is durable server-side, and its outcome, whatever it is, is the
  // session's to surface on return (issue #134's recovery). There is nothing
  // client-side to reconcile on return: the live editor keeps nothing
  // (ADR-0017), and a fresh mount's re-press mints a fresh scoped key.
  const mountedRef = useRef(true);
  useEffect((): (() => void) => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const accept = useCallback(
    (output: LiveOutput): void => {
      const attempt: AcceptanceAttempt = {
        idempotencyKey: `${editorScopeRef.current}:${output.requestId}`,
        output,
      };
      attemptRef.current = attempt;
      // A newer press owns the surface: any made-but-not-saved state an older
      // press was holding is superseded, not silently kept alongside.
      apply({ state: "accepting" });
      acceptLiveOutput({
        liveOutputDataUri: output.imageUrl,
        sketchSnapshotDataUri: output.sketchDataUri,
        inputs: output.inputs,
        idempotencyKey: attempt.idempotencyKey,
      })
        .then((result) => {
          // Late-response discipline (issue #129): only the CURRENT attempt,
          // from a live editor still on screen, may move the creator. A
          // response for a superseded attempt — or one whose editor is gone —
          // is dropped; the take itself is already safe server-side.
          if (!mountedRef.current || attemptRef.current !== attempt) return;
          // Issue #134: the attachment fact decides what "accepted" means
          // here. Only `attached` lands the creator in the session; an
          // unresolved attachment is a picture made but not saved — the
          // truthful state, with its retry — never a navigation into a
          // session whose space does not hold the take.
          if (result.attachment.state === "attached") {
            apply({ state: "idle" });
            // The creator lands in the session their picture now lives in,
            // armed as its first frame and ready for Make it move. The live
            // editor is left running behind them and keeps nothing
            // (ADR-0017).
            navigate(`/session/${result.sessionId}`);
            return;
          }
          apply({ state: "unattached", attachment: result.attachment });
        })
        .catch((error: unknown) => {
          if (!mountedRef.current || attemptRef.current !== attempt) return;
          apply({
            state: "failed",
            message:
              error instanceof Error
                ? error.message
                : "Couldn’t use this picture.",
          });
        });
    },
    [apply, navigate],
  );

  /**
   * The creator's side of a made-but-not-saved outcome (ADR-0022 decision 6,
   * the same door the first-frame path uses): re-send the record the server
   * handed back, under the SAME take identity, to the de-duplicating session
   * append. Never a re-accept, never new media, never a second take. The
   * destination rides the attachment itself, so nothing read from the screen
   * can retarget it (issue #129). A failure keeps the debt and says why —
   * the retry stays usable.
   */
  const retryAttachment = useCallback((): void => {
    const current = statusRef.current;
    if (current.state !== "unattached") return;
    const { attachment } = current;
    apply({ state: "saving", attachment });
    void retryPictureAttachment(attachment)
      .then(() => {
        // Apply the outcome only while this retry still owns the surface —
        // a newer press has since replaced an older debt's state.
        const ownsSurface = (): boolean => {
          const latest = statusRef.current;
          return latest.state === "saving" && latest.attachment === attachment;
        };
        if (!ownsSurface()) return;
        apply({ state: "idle" });
        // The take is in its session now — the landing "Use this" always
        // promised. Only a creator still looking at the editor is moved; the
        // editor stays behind them, keeping nothing (ADR-0017).
        if (mountedRef.current) navigate(`/session/${attachment.sessionId}`);
      })
      .catch((error: unknown) => {
        const latest = statusRef.current;
        if (latest.state !== "saving" || latest.attachment !== attachment) {
          return;
        }
        apply({
          state: "unattached",
          attachment,
          message:
            error instanceof Error
              ? error.message
              : "Could not save this picture",
        });
      });
  }, [apply, navigate]);

  return { status, accept, retryAttachment };
}
