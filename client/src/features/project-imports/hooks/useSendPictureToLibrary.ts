import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuthRepository } from "@repositories/index";
import { sendPictureToLibrary } from "../api/sendPictureToLibrary";

export type SendPictureStatus = { state: "idle" } | { state: "sending" } | { state: "failed"; message: string };

/** One press sends the shown picture to the library and opens it in /app. */
export function useSendPictureToLibrary(): { status: SendPictureStatus; send(source: string, name: string): Promise<void> } {
  const navigate = useNavigate();
  const [status, setStatus] = useState<SendPictureStatus>({ state: "idle" });
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const send = useCallback(async (source: string, name: string): Promise<void> => {
    const ownerId = getAuthRepository().getCurrentUser()?.uid;
    if (!ownerId) { setStatus({ state: "failed", message: "Sign in to use this picture" }); return; }
    abort.current?.abort();
    const controller = new AbortController(); abort.current = controller;
    setStatus({ state: "sending" });
    try {
      const destination = await sendPictureToLibrary(ownerId, source, name, controller.signal);
      if (!controller.signal.aborted) navigate(destination);
    } catch (error) {
      if (!controller.signal.aborted) setStatus({ state: "failed", message: error instanceof Error && error.message ? error.message : "Could not send this picture" });
    }
  }, [navigate]);
  return { status, send };
}
