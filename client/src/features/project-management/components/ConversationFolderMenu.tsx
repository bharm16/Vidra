import { useEffect, useMemo, useState, type ReactElement } from "react";
import type {
  Conversation,
  Folder,
} from "@shared/schemas/workflow/project.schemas";
import { FreshButton } from "@/components/fresh/FreshButton";
import { ProjectManagementApi } from "../api/projectManagementApi";

export interface ConversationFolderMenuProps {
  ownerId: string;
  conversation: Conversation;
  disabled?: boolean;
  onFile(folderId: string | null): void;
}

/**
 * Filing is a label on the conversation: its requests and media stay where they are.
 * The choices open inline because this row already sits inside a modal panel.
 */
export function ConversationFolderMenu({
  ownerId,
  conversation,
  disabled = false,
  onFile,
}: ConversationFolderMenuProps): ReactElement {
  const api = useMemo(() => new ProjectManagementApi(ownerId), [ownerId]);
  const [open, setOpen] = useState(false);
  const [folders, setFolders] = useState<Folder[]>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    setError(undefined);
    api
      .listFolders(abort.signal)
      .then((rows) => {
        if (!abort.signal.aborted)
          setFolders(rows.filter((folder) => folder.status === "active"));
      })
      .catch((failure: unknown) => {
        if (!abort.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Your projects could not load.",
          );
      });
    return () => abort.abort();
  }, [api, attempt, open]);
  if (conversation.folderId)
    return (
      <FreshButton disabled={disabled} onClick={() => onFile(null)}>
        Remove from project
      </FreshButton>
    );
  return (
    <>
      <FreshButton
        disabled={disabled}
        aria-expanded={open}
        aria-label={`Add ${conversation.name} to a project`}
        onClick={() => setOpen((value) => !value)}
      >
        Add to project
      </FreshButton>
      {open ? (
        <div
          className="vf-conversation-draft-rows"
          role="group"
          aria-label={`Projects for ${conversation.name}`}
        >
          {error ? (
            <div role="status">
              <p>{error}</p>
              <FreshButton
                tone="quiet"
                onClick={() => setAttempt((value) => value + 1)}
              >
                Try again
              </FreshButton>
            </div>
          ) : !folders ? (
            <p role="status">Opening your projects…</p>
          ) : folders.length ? (
            folders.map((folder) => (
              <FreshButton
                tone="quiet"
                key={folder.id}
                disabled={disabled}
                onClick={() => {
                  setOpen(false);
                  onFile(folder.id);
                }}
              >
                <span className="vf-conversation-draft-label">
                  {folder.name}
                </span>
              </FreshButton>
            ))
          ) : (
            <p>No projects yet. Create one from Projects.</p>
          )}
        </div>
      ) : null}
    </>
  );
}
