import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { VersionShare } from "@shared/schemas/workflow/sharing.schemas";
import { OwnedSharesApi, SharingApiError, type OwnedSharesPort } from "../api/sharingApi";
import { clearPublication, readPublication, writePublication, type PublicationCheckpoint, type ShareScope } from "../checkpoint";

type Phase = "loading" | "private" | "published" | "publishing" | "revoking" | "error";
interface State { phase: Phase; shares: VersionShare[]; pending: PublicationCheckpoint | undefined; error: string | undefined; localOnly: boolean; revokeIds: string[] }
type Event = { type: "loading" } | { type: "loaded"; shares: VersionShare[]; pending: PublicationCheckpoint | undefined } | { type: "publishing"; pending: PublicationCheckpoint; localOnly: boolean } | { type: "published"; share: VersionShare } | { type: "revoking"; ids: string[] } | { type: "error"; message: string };
function reducer(state: State, event: Event): State {
  if (event.type === "loading") return { ...state, phase: "loading", error: undefined };
  if (event.type === "loaded") return { ...state, shares: event.shares, pending: event.pending, revokeIds: [], error: event.pending ? "The link was not confirmed. Retry uses the same publication." : undefined, phase: event.pending ? "error" : event.shares.some(share => !share.revoked) ? "published" : "private" };
  if (event.type === "publishing") return { ...state, phase: "publishing", pending: event.pending, localOnly: event.localOnly, error: undefined };
  if (event.type === "published") {
    const shares = [...state.shares.filter(share => share.id !== event.share.id), event.share];
    return { ...state, shares, pending: undefined, phase: shares.some(share => !share.revoked) ? "published" : "private", error: undefined };
  }
  if (event.type === "revoking") return { ...state, phase: "revoking", revokeIds: event.ids, error: undefined };
  return { ...state, phase: "error", error: event.message };
}
export function useVersionSharing(scope: ShareScope, suppliedApi?: OwnedSharesPort): {
  state: State; share: VersionShare | undefined; thumbnail: string | undefined; refresh(): Promise<void>; publish(): Promise<void>; revoke(): Promise<void>;
} {
  const { ownerId, projectId, versionId } = scope;
  const api = useMemo(() => suppliedApi ?? new OwnedSharesApi(ownerId), [suppliedApi, ownerId]);
  const [state, dispatch] = useReducer(reducer, undefined, (): State => ({ phase: "loading", shares: [], pending: readPublication(scope), error: undefined, localOnly: false, revokeIds: [] }));
  const mounted = useRef(true);
  const operation = useRef(false);
  const readVersion = useRef(0);
  const pending = useRef(state.pending);
  const thumbnail = useRef<string | undefined>(undefined);
  const [previewRevision, updatePreview] = useReducer((revision: number): number => revision + 1, 0);
  const send = useCallback((event: Event): void => { if (mounted.current) dispatch(event); }, []);
  const refresh = useCallback(async (): Promise<void> => {
    const token = ++readVersion.current;
    send({ type: "loading" });
    try {
      const shares = (await api.list(projectId)).filter(share => share.versionId === versionId);
      if (!mounted.current || readVersion.current !== token) return;
      if (pending.current && shares.some(share => share.id === pending.current?.id)) { clearPublication({ ownerId, projectId, versionId }); pending.current = undefined; }
      send({ type: "loaded", shares, pending: pending.current });
    } catch { if (readVersion.current === token) send({ type: "error", message: "Sharing could not be checked. Try again before changing access." }); }
  }, [api, projectId, versionId, ownerId, send]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const controller = new AbortController();
    void api.access(projectId, versionId, controller.signal).then(access => { if (mounted.current && !controller.signal.aborted) { thumbnail.current = access.url; updatePreview(); } }).catch(() => undefined);
    return () => { mounted.current = false; readVersion.current += 1; controller.abort(); };
  }, [api, projectId, versionId, refresh]);
  const publish = async (): Promise<void> => {
    if (operation.current || state.phase === "loading" || state.revokeIds.length) return;
    operation.current = true; readVersion.current += 1;
    const checkpoint = pending.current ?? { ownerId, projectId, versionId, id: crypto.randomUUID() };
    pending.current = checkpoint;
    const persisted = writePublication(checkpoint);
    send({ type: "publishing", pending: checkpoint, localOnly: !persisted });
    try {
      const share = await api.publish(projectId, versionId, checkpoint.id);
      clearPublication(checkpoint); pending.current = undefined;
      send({ type: "published", share });
    } catch (failure) {
      send({ type: "error", message: failure instanceof SharingApiError && (failure.status === 401 || failure.status === 403) ? "Sign in with the original account to confirm this link." : failure instanceof SharingApiError && failure.status === 422 ? "This exact version is not ready to share. Check the media, then retry." : "The publication was not confirmed. Retry uses the same link and exact version." });
    } finally { operation.current = false; }
  };
  const revoke = async (): Promise<void> => {
    if (operation.current || pending.current || state.phase === "loading") return;
    operation.current = true; readVersion.current += 1;
    const ids = [...new Set([...state.shares.filter(share => !share.revoked).map(share => share.id), ...state.revokeIds])];
    send({ type: "revoking", ids });
    try {
      await Promise.allSettled(ids.map(id => api.revoke(projectId, id)));
      const shares = (await api.list(projectId)).filter(share => share.versionId === versionId);
      if (shares.some(share => !share.revoked)) send({ type: "error", message: "Access is not confirmed off. Try again to stop sharing these links." });
      else send({ type: "loaded", shares, pending: undefined });
    } catch { send({ type: "error", message: "Access is not confirmed off. Retry checks the same links." }); }
    finally { operation.current = false; }
  };
  void previewRevision;
  return { state, share: [...state.shares].reverse().find(share => !share.revoked), thumbnail: thumbnail.current, refresh, publish, revoke };
}
