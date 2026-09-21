import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { acceptLiveOutput } from "../api/acceptLiveOutput";
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
 * The verb is accept, never "Keep" — Keep ends the clip loop (ADR-0010).
 */

export type AcceptanceStatus =
  | { state: "idle" }
  | { state: "accepting" }
  | { state: "failed"; message: string };

export interface UseAcceptLiveOutputReturn {
  status: AcceptanceStatus;
  accept: (output: LiveOutput) => void;
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
  const editorScopeRef = useRef<string | null>(null);
  editorScopeRef.current ??= mintEditorScope();
  // The current attempt; a newer press supersedes an in-flight one.
  const attemptRef = useRef<AcceptanceAttempt | null>(null);
  // The acceptance applies where it was pressed from: the live editor. If the
  // creator has left (the editor unmounted), the acceptance still happened —
  // the take is durable in its session — but nobody is teleported into it.
  // There is nothing client-side to reconcile on return: the live editor keeps
  // nothing (ADR-0017), and a fresh mount's re-press mints a fresh scoped key.
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
      setStatus({ state: "accepting" });
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
          setStatus({ state: "idle" });
          // The creator lands in the session their picture now lives in,
          // armed as its first frame and ready for Make it move. The live
          // editor is left running behind them and keeps nothing (ADR-0017).
          navigate(`/session/${result.sessionId}`);
        })
        .catch((error: unknown) => {
          if (!mountedRef.current || attemptRef.current !== attempt) return;
          setStatus({
            state: "failed",
            message:
              error instanceof Error
                ? error.message
                : "Couldn’t use this picture.",
          });
        });
    },
    [navigate],
  );

  return { status, accept };
}
