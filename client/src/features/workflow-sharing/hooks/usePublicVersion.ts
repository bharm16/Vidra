import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublicVersion } from "@shared/schemas/workflow/sharing.schemas";
import { WorkflowShareIdSchema } from "@shared/schemas/workflow/sharing.schemas";
import { PublicSharesApi, SharingApiError, type PublicSharesPort } from "../api/sharingApi";

type PublicState = { id: string; phase: "loading" } | { id: string; phase: "unavailable" } | { id: string; phase: "error" } | { id: string; phase: "ready"; version: PublicVersion };
export function usePublicVersion(id: string, suppliedApi?: PublicSharesPort): { state: PublicState; retry(): void; unavailable(): void; download(): Promise<void>; downloading: boolean; downloadError: string | undefined } {
  const api = useMemo(() => suppliedApi ?? new PublicSharesApi(), [suppliedApi]);
  const [state, setState] = useState<PublicState>({ id, phase: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string>();
  const mountedId = useRef(id); mountedId.current = id;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; setDownloading(false); return () => { alive.current = false; }; }, [id]);
  const unavailable = useCallback((): void => { setState({ id, phase: "unavailable" }); setDownloadError(undefined); }, [id]);
  useEffect(() => {
    const controller = new AbortController();
    setDownloadError(undefined);
    setState(current => current.id === id && current.phase === "ready" ? current : { id, phase: "loading" });
    if (!WorkflowShareIdSchema.safeParse(id).success) { setState({ id, phase: "unavailable" }); return () => controller.abort(); }
    void api.resolve(id, controller.signal).then(version => { if (!controller.signal.aborted) setState({ id, phase: "ready", version }); }).catch(failure => {
      if (!controller.signal.aborted) setState({ id, phase: failure instanceof SharingApiError && failure.status === 404 ? "unavailable" : "error" });
    });
    return () => controller.abort();
  }, [api, id, attempt]);
  useEffect(() => {
    const refresh = (): void => { if (document.visibilityState === "visible") setAttempt(value => value + 1); };
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); window.clearInterval(timer); };
  }, [id]);
  const download = async (): Promise<void> => {
    if (downloading || state.id !== id || state.phase !== "ready") return;
    setDownloading(true); setDownloadError(undefined);
    try {
      const result = await api.download(id);
      if (!alive.current || mountedId.current !== id) return;
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement("a"); link.href = url; link.download = result.filename; link.rel = "noreferrer"; document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (failure) {
      if (!alive.current || mountedId.current !== id) return;
      if (failure instanceof SharingApiError && failure.status === 404) unavailable();
      else setDownloadError("The download could not start. Try again.");
    } finally { if (alive.current && mountedId.current === id) setDownloading(false); }
  };
  return { state: state.id === id ? state : { id, phase: "loading" }, retry: () => setAttempt(value => value + 1), unavailable, download, downloading, downloadError };
}
