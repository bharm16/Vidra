import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";

export interface VideoSource { url?: string; frames?: number; expiresAt?: string; error?: string; loading: boolean; }
export function useVideoSources(media: MediaVersion[], access: (id: string) => Promise<{ url: string; frames?: number; expiresAt?: string | undefined }>, scope: string, normalizedIds = ""): { sources: Record<string, VideoSource>; refresh(id: string): void; failed(id: string): void } {
  const [sources, setSources] = useState<Record<string, VideoSource>>({}); const requested = useRef(new Set<string>()); const accessRef = useRef(access); accessRef.current = access;
  const epoch = useRef(0); const mounted = useRef(true); const policies = useRef(new Map<string,string>()); const requests = useRef(new Map<string,number>());
  const mediaRef = useRef(media); mediaRef.current=media;
  useEffect(() => { epoch.current += 1; requested.current.clear(); policies.current.clear(); requests.current.clear(); setSources({}); mounted.current = true; return () => { mounted.current = false; epoch.current += 1; }; }, [scope]);
  const load = useCallback((id: string): void => {
    const token = epoch.current; const sequence=(requests.current.get(id)??0)+1; requests.current.set(id,sequence); requested.current.add(id); setSources(rows => {const next={...rows[id],loading:true};delete next.error;return{...rows,[id]:next};});
    void accessRef.current(id).then(result => { if (mounted.current && epoch.current === token && requests.current.get(id) === sequence) setSources(rows => ({ ...rows, [id]: { url: result.url, ...(result.frames === undefined ? {} : { frames: result.frames }), ...(result.expiresAt ? { expiresAt: result.expiresAt } : {}), loading: false } })); }).catch((failure: unknown) => { if (mounted.current && epoch.current === token && requests.current.get(id) === sequence) setSources(rows => ({ ...rows, [id]: { loading: false, error: failure instanceof Error ? failure.message : "This source is unavailable." } })); });
  }, []);
  const ids = media.map(version => version.id).join("|");
  useEffect(() => { const normalized=new Set(normalizedIds.split("|")); for (const id of ids.split("|").filter(Boolean)) { const kind=mediaRef.current.find(version=>version.id === id)?.kind; const policy=normalized.has(id) && (kind === "video" || kind === "export") ? "normalized" : "original"; if (!requested.current.has(id) || policies.current.get(id) !== policy) { policies.current.set(id,policy); load(id); } } }, [ids, load, scope, normalizedIds]);
  useEffect(() => {
    const expiring = Object.entries(sources).filter(([, source]) => !source.loading && source.url && source.expiresAt && Number.isFinite(Date.parse(source.expiresAt))).sort((a, b) => Date.parse(a[1].expiresAt ?? "") - Date.parse(b[1].expiresAt ?? ""))[0];
    if (!expiring) return; const [id, source] = expiring;
    const timer = window.setTimeout(() => load(id), Math.min(2_147_483_647, Math.max(1000, Date.parse(source.expiresAt ?? "") - Date.now() - 15000)));
    return () => window.clearTimeout(timer);
  }, [sources, load]);
  return { sources, refresh: load, failed: id => setSources(rows => ({ ...rows, [id]: { loading: false, error: "This source could not play. Retry access to the same version." } })) };
}
