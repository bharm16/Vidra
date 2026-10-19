import { useEffect, useRef, useState, type ReactElement } from "react";
import type { CreationDraft } from "@shared/schemas/workflow/draft.schemas";
import type { Conversation } from "@shared/schemas/workflow/project.schemas";
import { Popover, PopoverContent, PopoverTrigger } from "@promptstudio/system/components/ui/popover";
import { FreshButton } from "@/components/fresh/FreshButton";
import { getAuthRepository } from "@/repositories/index";
import { useConversationDrafts } from "../hooks/useConversationDrafts";

export interface ConversationDraftMenuProps {
  ownerId: string;
  projectId: string;
  conversation: Conversation;
  onOpenDraft(record: CreationDraft): void | Promise<void>;
  disabled?: boolean;
}

export function ConversationDraftMenu({ ownerId, projectId, conversation, onOpenDraft, disabled = false }: ConversationDraftMenuProps): ReactElement | null {
  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectionError, setSelectionError] = useState<string>();
  const scope = `${ownerId}:${projectId}:${conversation.id}`;
  const currentScope = useRef(scope); currentScope.current = scope;
  const mounted = useRef(true);
  const locked = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setOpen(false); setSelecting(false); setSelectionError(undefined); locked.current = false; }, [scope]);
  const controller = useConversationDrafts(ownerId, projectId, conversation, open);
  if (conversation.ownerId !== ownerId || conversation.projectId !== projectId) return null;
  const choose = async (record: CreationDraft): Promise<void> => {
    if (locked.current || !mounted.current || currentScope.current !== scope || getAuthRepository().getCurrentUser()?.uid !== ownerId) return;
    locked.current = true; setSelecting(true); setSelectionError(undefined);
    try { await onOpenDraft(record); if (mounted.current && currentScope.current === scope) setOpen(false); }
    catch (failure) { if (mounted.current && currentScope.current === scope) setSelectionError(failure instanceof Error ? failure.message : "This request could not open. Your current words are retained."); }
    finally { if (mounted.current && currentScope.current === scope) { locked.current = false; setSelecting(false); } }
  };
  return <Popover modal={false} open={open} onOpenChange={next => { if (!selecting) { setOpen(next); setSelectionError(undefined); } }}><PopoverTrigger asChild><FreshButton tone="quiet" disabled={disabled} aria-label={`Unfinished requests in ${conversation.name}`}>Unfinished requests</FreshButton></PopoverTrigger><PopoverContent className="vf vf-conversation-draft-menu" align="start" sideOffset={6} collisionPadding={12} aria-label={`Unfinished requests in ${conversation.name}`}>
    {controller.loading ? <p role="status">Opening unfinished requests…</p> : controller.error ? <div role="status"><p>{controller.error}</p><FreshButton tone="quiet" onClick={controller.retry}>Try again</FreshButton></div> : controller.drafts.length ? <div className="vf-conversation-draft-rows">{controller.drafts.map(record => <FreshButton tone="quiet" disabled={selecting} key={record.id} onClick={() => { void choose(record); }}><span className="vf-conversation-draft-label">{record.instructions.trim() || "Empty request"}</span><span className="vf-conversation-draft-date">Edited {new Date(record.updatedAt).toLocaleString()}</span></FreshButton>)}</div> : <p className="vf-secondary">No unfinished requests in this conversation.</p>}
    {selectionError ? <p className="vf-setting-warning" role="status">{selectionError}</p> : null}
  </PopoverContent></Popover>;
}
