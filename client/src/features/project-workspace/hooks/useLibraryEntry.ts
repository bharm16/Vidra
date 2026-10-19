import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Project } from "@shared/schemas/workflow/project.schemas";
import { GuestDraftStore } from "@/repositories/workflow/GuestDraftStore";
import { WorkflowApi } from "../api/workflowApi";
import { wordsDraftContent } from "../state/inputBinding";

export type LibraryClaim =
  | { state: "claimed"; conversationId: string; draftId: string }
  | { state: "missing" };

export interface LibraryEntry {
  library: Project | undefined;
  /** Present only when the entry carried a claim: what became of the signed-out draft. */
  claim: LibraryClaim | undefined;
  error: { message: string; status: number | undefined } | undefined;
  retry(): void;
}

type LibraryPorts = Pick<
  WorkflowApi,
  "ensureLibrary" | "createConversation" | "createDraft"
>;

/**
 * Opens the owner's library, the home for work that is not filed in a project.
 * A claim moves the matching signed-out draft into it. It is never submitted:
 * the writer presses Create again once the draft has a real destination.
 */
export function useLibraryEntry(
  ownerId: string,
  claim?: string,
  api?: LibraryPorts,
  store?: GuestDraftStore,
): LibraryEntry {
  const client = useMemo(
    () => api ?? new WorkflowApi(undefined, ownerId),
    [api, ownerId],
  );
  const guests = useRef(store ?? new GuestDraftStore());
  const [state, setState] = useState<{
    ownerId: string;
    library?: Project;
    claim?: LibraryClaim;
    error?: LibraryEntry["error"];
  }>({ ownerId });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setState({ ownerId });
    void (async (): Promise<void> => {
      try {
        const library = await client.ensureLibrary(abort.signal);
        if (abort.signal.aborted) return;
        if (claim === undefined) {
          setState({ ownerId, library });
          return;
        }
        const kept = guests.current.read();
        if (kept?.id !== claim) {
          setState({ ownerId, library, claim: { state: "missing" } });
          return;
        }
        // Both creates are idempotent by id, so a retry or a second tab lands on the same records.
        const conversation = await client.createConversation(
          library.id,
          kept.conversationId,
          "New conversation",
        );
        const content = wordsDraftContent(
          kept.action,
          kept.instructions,
          kept.settings,
          library.id,
          conversation.id,
          library.instructions.revision,
        );
        const draft = await client.createDraft(
          library.id,
          conversation.id,
          kept.draftId,
          content,
        );
        if (abort.signal.aborted) return;
        guests.current.clear();
        setState({
          ownerId,
          library,
          claim: {
            state: "claimed",
            conversationId: conversation.id,
            draftId: draft.id,
          },
        });
      } catch (failure) {
        if (abort.signal.aborted) return;
        const status =
          failure instanceof Error &&
          "status" in failure &&
          typeof failure.status === "number"
            ? failure.status
            : undefined;
        setState({
          ownerId,
          error: {
            message:
              failure instanceof Error
                ? failure.message
                : "Your work could not open.",
            status,
          },
        });
      }
    })();
    return () => abort.abort();
  }, [attempt, claim, client, ownerId]);
  const retry = useCallback((): void => setAttempt((value) => value + 1), []);
  const current = state.ownerId === ownerId ? state : { ownerId };
  return {
    library: current.library,
    claim: current.claim,
    error: current.error,
    retry,
  };
}
