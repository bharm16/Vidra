import { useCallback, useEffect, useRef, useState } from "react";

interface OpenConversation { id: string; acceptanceSequence: number; }
interface SelectionOptions {
  scopeKey: string;
  initialConversationId: string | undefined;
  initialDraftId: string | undefined;
  opened(): OpenConversation | undefined;
  hasRequests(): boolean;
  leave(reloadHome: boolean): void;
}
/** Owns URL/hydration selection and opaque async intent guards; callers never manipulate counters. */
export function useWorkspaceSelection(options: SelectionOptions): {
  requestedId: string | undefined;
  request(id: string | undefined): void;
  isHome(): boolean;
  targetDraftId(): string | undefined;
  matchesTarget(conversationId: string): boolean;
  clearTarget(): void;
  begin(): () => boolean;
  capture(): () => boolean;
} {
  const latest = useRef(options); latest.current = options;
  const [requestedId, setRequestedId] = useState(options.initialConversationId);
  const requested = useRef(requestedId); requested.current = requestedId;
  const target = useRef({ scope: options.scopeKey, draftId: options.initialDraftId, conversationId: options.initialConversationId });
  const token = useRef({});
  const capture = useCallback((): (() => boolean) => { const captured = token.current; return () => token.current === captured; }, []);
  const begin = useCallback((): (() => boolean) => { target.current.draftId = undefined; token.current = {}; return capture(); }, [capture]);
  const request = useCallback((id: string | undefined): void => { requested.current = id; setRequestedId(id); }, []);
  const urlConversation = useRef(options.initialConversationId);
  useEffect(() => {
    const previous = urlConversation.current; urlConversation.current = options.initialConversationId;
    const current = latest.current; const opened = current.opened();
    const leftForHome = options.initialConversationId === undefined && previous !== undefined && opened !== undefined && (opened.acceptanceSequence > 0 || current.hasRequests());
    if (!leftForHome && (options.initialConversationId === requested.current || options.initialConversationId === opened?.id)) return;
    begin(); current.leave(leftForHome); request(options.initialConversationId);
  }, [begin, options.initialConversationId, request]);
  useEffect(() => {
    if (target.current.scope === options.scopeKey) return;
    token.current = {}; target.current = { scope: options.scopeKey, draftId: latest.current.initialDraftId, conversationId: latest.current.initialConversationId };
    request(latest.current.initialConversationId);
  }, [options.scopeKey, request]);
  const isHome = useCallback((): boolean => requested.current === undefined, []);
  const targetDraftId = useCallback((): string | undefined => target.current.scope === latest.current.scopeKey ? target.current.draftId : undefined, []);
  const matchesTarget = useCallback((id: string): boolean => target.current.conversationId === id, []);
  const clearTarget = useCallback((): void => { target.current.draftId = undefined; }, []);
  return { requestedId, request, begin, capture, isHome, targetDraftId, matchesTarget, clearTarget };
}
