import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { CreationDraftSchema, type CreationDraft } from "@shared/schemas/workflow/draft.schemas";
import type { Conversation } from "@shared/schemas/workflow/project.schemas";
import { getAuthRepository } from "@/repositories/index";
import { WorkflowApi } from "@/features/project-workspace/api";
import { canonicalJson } from "@shared/workflow/canonicalJson";

/** Requests a person wrote: an empty one is a composer's scratch, and the same setup saved twice is listed once (newest). */
export function writtenDrafts(rows: CreationDraft[]): CreationDraft[] {
  const seen = new Set<string>();
  return rows.filter(record => record.status === "open" || record.status === "parked").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).filter(record => {
    if (!record.instructions.trim() && !record.inputs.length) return false;
    const key = canonicalJson({ action: record.action, instructions: record.instructions.trim(), inputs: record.inputs, settings: record.settings });
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

interface DraftList { scope: string; rows: CreationDraft[]; loading: boolean; error: string | undefined; }
export interface ConversationDraftsController { drafts: CreationDraft[]; loading: boolean; error: string | undefined; retry(): void; }
/** A conversation menu loads owned current records; closing it cancels admission of late replies. */
export function useConversationDrafts(ownerId: string, projectId: string, conversation: Conversation, open: boolean): ConversationDraftsController {
  const api = useMemo(() => new WorkflowApi(undefined, ownerId), [ownerId]);
  const scope = `${ownerId}:${projectId}:${conversation.id}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DraftList>({ scope, rows: [], loading: false, error: undefined });
  const owned = conversation.ownerId === ownerId && conversation.projectId === projectId;
  useEffect(() => {
    if (!open || !owned) return;
    const abort = new AbortController();
    setState({ scope, rows: [], loading: true, error: undefined });
    void (async (): Promise<void> => {
      try {
        if (getAuthRepository().getCurrentUser()?.uid !== ownerId) throw new Error("Sign in to the original account to open this conversation.");
        const response = await api.listDrafts(projectId, conversation.id, abort.signal);
        if (abort.signal.aborted || currentScope.current !== scope) return;
        if (getAuthRepository().getCurrentUser()?.uid !== ownerId) throw new Error("The account changed while these requests were loading.");
        const rows = z.array(CreationDraftSchema.refine(record => record.ownerId === ownerId && record.projectId === projectId && record.conversationId === conversation.id, "This request belongs to another account or conversation.")).parse(response);
        setState({ scope, rows: writtenDrafts(rows), loading: false, error: undefined });
      } catch (failure) { if (!abort.signal.aborted && currentScope.current === scope) setState({ scope, rows: [], loading: false, error: failure instanceof Error ? failure.message : "These requests could not load. Try again." }); }
    })();
    return () => abort.abort();
  }, [api, attempt, conversation.id, open, owned, ownerId, projectId, scope]);
  return { drafts: state.scope === scope && owned ? state.rows : [], loading: state.scope !== scope || state.loading, error: state.scope === scope ? state.error : undefined, retry: useCallback(() => setAttempt(value => value + 1), []) };
}
