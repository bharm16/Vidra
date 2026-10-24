import { useCallback, useEffect, useRef, useState } from "react";
import type { AcceptedRequest } from "@shared/schemas/workflow/request.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import type { WorkspaceServer } from "../api/WorkspaceAdapters";
import { EMPTY_WORKSPACE_VIEW, workspaceViewReducer } from "../state/workspaceState";

interface HistoryState { requests: AcceptedRequest[]; historyProblem: string | undefined; }
const EMPTY: HistoryState = { requests: [], historyProblem: undefined };
interface HistoryOptions {
  ownerId: string; projectId: string; conversationId: string | undefined;
  server: Pick<WorkspaceServer, "history" | "requestStatus">;
  currentConversationId(): string | undefined;
  media: MediaVersion[];
  refreshMedia(): Promise<void>;
  report(problem: string | undefined): void;
}
/** Owns history identity, monotonic observation and polling. Media refresh is an owned-library operation. */
export function useRequestHistory(options: HistoryOptions): {
  state: HistoryState;
  observe(rows: AcceptedRequest[]): HistoryState;
  reset(): HistoryState;
  read(conversationId: string, signal?: AbortSignal): Promise<AcceptedRequest[]>;
} {
  const scopeKey = `${options.ownerId}:${options.projectId}:${options.conversationId ?? ""}`;
  const optionsRef = useRef(options); optionsRef.current = options;
  const scopeRef = useRef(scopeKey); scopeRef.current = scopeKey;
  const [stored, setStored] = useState({ scopeKey, state: EMPTY });
  const state = stored.scopeKey === scopeKey ? stored.state : EMPTY;
  const stateRef = useRef(state); stateRef.current = state;
  const observe = useCallback((rows: AcceptedRequest[]): HistoryState => {
    const current = optionsRef.current;
    if (rows.some(row => row.ownerId !== current.ownerId || row.projectId !== current.projectId || row.conversationId !== current.currentConversationId())) throw new Error("A history update belongs to another account or conversation.");
    const next = workspaceViewReducer({ ...EMPTY_WORKSPACE_VIEW, ...stateRef.current }, { type: "observe-requests", requests: rows });
    const history = { requests: next.requests, historyProblem: next.historyProblem };
    stateRef.current = history; setStored({ scopeKey: `${current.ownerId}:${current.projectId}:${current.currentConversationId() ?? ""}`, state: history }); return history;
  }, []);
  const reset = useCallback((): HistoryState => { stateRef.current = EMPTY; setStored({ scopeKey: scopeRef.current, state: EMPTY }); return EMPTY; }, []);
  const read = useCallback(async (conversationId: string, signal?: AbortSignal): Promise<AcceptedRequest[]> => {
    const rows = await options.server.history(options.projectId, conversationId, signal);
    if (rows.some(row => row.ownerId !== options.ownerId || row.projectId !== options.projectId || row.conversationId !== conversationId)) throw new Error("The history belongs to another account or conversation.");
    return rows;
  }, [options.ownerId, options.projectId, options.server]);
  const pollingIds = state.requests.filter(request => request.slots.some(slot => ["queued", "running", "unknown"].includes(slot.outcome) || ["storing", "stored", "attaching"].includes(slot.delivery))).map(request => request.id).sort().join(",");
  useEffect(() => {
    const conversationId = options.conversationId;
    if (!conversationId || !pollingIds) return;
    const abort = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    let ticks = 0; const landed = new Set<string>();
    const current = (): boolean => !abort.signal.aborted && scopeRef.current === scopeKey && optionsRef.current.currentConversationId() === conversationId;
    const tick = async (): Promise<void> => {
      try {
        const [historyResults, statuses] = await Promise.all([
          Promise.allSettled(ticks++ % 5 === 0 ? [options.server.history(options.projectId, conversationId, abort.signal)] : []),
          Promise.allSettled(pollingIds.split(",").map(id => options.server.requestStatus(options.projectId, id, abort.signal))),
        ]);
        if (!current()) return;
        const observed = [...historyResults.flatMap(result => result.status === "fulfilled" ? result.value : []), ...statuses.flatMap(result => result.status === "fulfilled" ? [result.value] : [])];
        if (observed.some(row => row.ownerId !== options.ownerId || row.projectId !== options.projectId || row.conversationId !== conversationId)) throw new Error("A request update returned a different account or conversation.");
        let arrived = false;
        for (const request of observed) for (const slot of request.slots) {
          if (!slot.versionId) continue;
          const key = `${request.id}:${slot.id}:${slot.delivery}`;
          if (!optionsRef.current.media.some(version => version.id === slot.versionId) || (slot.delivery === "ready" && !landed.has(key))) arrived = true;
          if (slot.delivery === "ready") landed.add(key);
        }
        if (arrived) await optionsRef.current.refreshMedia();
        if (!current()) return;
        const rejected = [...historyResults, ...statuses].some(result => result.status === "rejected");
        optionsRef.current.report(rejected ? "Request updates could not load. Existing work is retained; checking again." : undefined);
        if (observed.length) observe(observed);
      } catch (error) { if (current()) optionsRef.current.report(`Request updates could not load. ${error instanceof Error ? error.message : "Checking again."}`); }
      finally { if (current()) timer = setTimeout(() => { void tick(); }, 2000); }
    };
    void tick(); return () => { abort.abort(); if (timer) clearTimeout(timer); };
  }, [observe, options.conversationId, options.ownerId, options.projectId, options.server, pollingIds, scopeKey]);
  return { state, observe, reset, read };
}
