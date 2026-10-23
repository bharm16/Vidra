import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactElement } from "react";
import { z } from "zod";
import { FreshButton, FreshIconButton } from "@/components/fresh/FreshButton";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@promptstudio/system/components/ui/dialog";
import { Popover, PopoverAnchor, PopoverContent } from "@promptstudio/system/components/ui/popover";
import { getAuthRepository } from "@/repositories/index";
import type { CreationDraft } from "@shared/schemas/workflow/draft.schemas";
import { ConversationDraftMenu } from "./components/ConversationDraftMenu";
import { isLibraryProject, type Project, type Conversation, type Folder } from "@shared/schemas/workflow/project.schemas";
import { ConversationFolderMenu } from "./components/ConversationFolderMenu";
import { ProjectManagementApi } from "./api/projectManagementApi";
import "./project-management.css";

export interface ProjectManagementPanelProps {
  ownerId: string; project: Project; conversations: Conversation[];
  onOpenDraft?(record: CreationDraft): void | Promise<void>;
  onProjectChange(project: Project): void; onConversationChange(conversation: Conversation): void; onOpenConversation(id: string): void; onClose(): void;
  /** A named project open in the library: rename and trash act on it, and its conversations are listed. */
  folder?: Folder | undefined;
  onFolderChange?(folder: Folder): void;
}
type Panel = "menu" | "rename" | "conversations" | "archived" | "trash";
export function ProjectManagementPanel({ ownerId, project, conversations: allConversations, onProjectChange, onConversationChange, onOpenConversation, onOpenDraft, onClose, folder, onFolderChange }: ProjectManagementPanelProps): ReactElement {
  const library = isLibraryProject(project);
  const filing = library && folder !== undefined && folder.ownerId === ownerId ? folder : undefined;
  const target = filing ?? project;
  const conversations = filing ? allConversations.filter(conversation => conversation.folderId === filing.id) : allConversations;
  const api = useMemo(() => new ProjectManagementApi(ownerId), [ownerId]);
  const [panel, setPanel] = useState<Panel>("menu");
  const [name, setName] = useState(target.name);
  const [baseRevision, setBaseRevision] = useState(target.revision);
  const [editingConversation, setEditingConversation] = useState<{ id: string; name: string; revision: number }>();
  // The last archive or restore, so a row that leaves the list can be put back; focus lands on the row after it.
  const [moved, setMoved] = useState<Conversation>();
  const [focusAfter, setFocusAfter] = useState<{ id: string | undefined }>();
  const [folderNames, setFolderNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [mobile, setMobile] = useState(() => typeof window.matchMedia === "function" && Boolean(window.matchMedia("(max-width: 700px)")?.matches));
  const anchorElement = useRef(typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : undefined);
  const anchor = useRef({ getBoundingClientRect: (): DOMRect => anchorElement.current?.getBoundingClientRect() ?? new DOMRect() });
  useEffect(() => { if (typeof window.matchMedia !== "function") return; const media = window.matchMedia("(max-width: 700px)"); if (!media) return; const change = (): void => setMobile(media.matches); media.addEventListener("change", change); return () => media.removeEventListener("change", change); }, []);
  const operation = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const scope = useRef(`${ownerId}:${project.id}`); scope.current = `${ownerId}:${project.id}`;
  const locked = useRef(false);
  useEffect(() => { operation.current += 1; locked.current = false; setPanel("menu"); setEditingConversation(undefined); setBusy(false); setError(undefined); return () => { operation.current += 1; }; }, [ownerId, project.id]);
  const owned = project.ownerId === ownerId && conversations.every(conversation => conversation.ownerId === ownerId && conversation.projectId === project.id);
  const editable = project.status === "active" && (project.origin.kind === "new" || project.origin.authority === "workflow") && target.status === "active";
  const begin = (next: Panel): void => { setError(undefined); setEditingConversation(undefined); setMoved(undefined); setName(target.name); setBaseRevision(target.revision); setPanel(next); };
  const perform = async (action: () => Promise<void>): Promise<void> => {
    if (locked.current || !owned) return;
    const capturedScope = `${ownerId}:${project.id}`;
    const token = ++operation.current;
    locked.current = true; setBusy(true); setError(undefined);
    try { await action(); }
    catch (failure) { if (token === operation.current && scope.current === capturedScope) setError(failure instanceof Error ? failure.message : "The change was not confirmed. Try again."); }
    finally { if (token === operation.current && scope.current === capturedScope) { locked.current = false; setBusy(false); } }
  };
  const active = (): boolean => mounted.current && scope.current === `${ownerId}:${project.id}` && getAuthRepository().getCurrentUser()?.uid === ownerId;
  const save = (event: FormEvent): void => {
    event.preventDefault();
    const parsed = z.string().trim().min(1).max(200).safeParse(name);
    if (!parsed.success) { setError("Enter a project name from 1 to 200 characters."); return; }
    void perform(async () => {
      if (filing) { const next = await api.changeFolder(filing.id, { expectedRevision: baseRevision, name: parsed.data }); if (active()) { onFolderChange?.(next); setPanel("menu"); } return; }
      const next = await api.changeProject(project.id, { expectedRevision: baseRevision, name: parsed.data }); if (active()) { onProjectChange(next); setPanel("menu"); }
    });
  };
  const setStatus = (status: "active" | "trashed"): void => { void perform(async () => {
    if (filing) { const next = await api.changeFolder(filing.id, { expectedRevision: filing.revision, status }); if (active()) { onFolderChange?.(next); onClose(); } return; }
    const next = await api.changeProject(project.id, { expectedRevision: project.revision, status }); if (active()) { onProjectChange(next); onClose(); }
  }); };
  const renamable = !library || filing !== undefined;
  const displayed = conversations.filter(conversation => panel === "archived" ? conversation.status === "archived" : conversation.status === "active");
  const changeConversation = (conversation: Conversation, patch: { name?: string; status?: "active" | "archived"; folderId?: string | null }, expectedRevision = conversation.revision): void => {
    const index = displayed.findIndex(row => row.id === conversation.id);
    const leaves = patch.status !== undefined && patch.status !== conversation.status;
    void perform(async () => {
      const next = await api.changeConversation(project.id, conversation.id, { expectedRevision, ...patch });
      if (!active()) return;
      onConversationChange(next); setEditingConversation(undefined);
      setMoved(leaves && next.status !== (panel === "archived" ? "archived" : "active") ? next : undefined);
      setFocusAfter({ id: leaves ? (displayed[index + 1] ?? displayed[index - 1])?.id : conversation.id });
    });
  };
  // Focus never falls back to the dialog itself: it lands on the saved row, or the row that took an archived one's place.
  useEffect(() => {
    if (!focusAfter) return;
    setFocusAfter(undefined);
    const target = (focusAfter.id ? document.getElementById(`conversation-open-${focusAfter.id}`) : null) ?? document.getElementById("conversation-list-back");
    target?.focus();
  }, [focusAfter]);
  // "Remove from project" names the project; a named project already open names its own conversations.
  const filedElsewhere = library && !filing && (panel === "conversations" || panel === "archived") && conversations.some(conversation => conversation.folderId && !folderNames[conversation.folderId]);
  useEffect(() => {
    if (!filedElsewhere) return;
    const abort = new AbortController();
    api.listFolders(abort.signal).then(rows => { if (!abort.signal.aborted) setFolderNames(Object.fromEntries(rows.map(row => [row.id, row.name]))); }).catch(() => undefined);
    return () => abort.abort();
  }, [api, filedElsewhere]);
  const titles: Record<Panel, string> = { menu: renamable ? "Project options" : "Conversation options", rename: "Rename project", conversations: "Conversations", archived: "Archived conversations", trash: "Move project to Trash?" };
  const menuIcon = (name: "rename" | "conversations" | "archive" | "trash"): ReactElement => <img src={`/design-assets/fidelity-project-${name}.svg`} alt="" />;
  const menu = <div className="vf-project-options-menu">{!renamable ? null : <FreshButton tone="quiet" disabled={!editable} onClick={() => begin("rename")}>{menuIcon("rename")}Rename project</FreshButton>}<FreshButton tone="quiet" onClick={() => begin("conversations")}>{menuIcon("conversations")}Conversations</FreshButton><FreshButton tone="quiet" onClick={() => begin("archived")}>{menuIcon("archive")}Archived conversations</FreshButton>{target.status === "trashed" ? <FreshButton tone="primary" disabled={busy} onClick={() => setStatus("active")}>{busy ? "Restoring…" : "Restore project"}</FreshButton> : !renamable ? null : <FreshButton tone="quiet" disabled={!editable} onClick={() => begin("trash")}>{menuIcon("trash")}Move to Trash</FreshButton>}</div>;
  if (owned && panel === "menu" && !mobile) return <Popover open modal={false} onOpenChange={open => { if (!open && !busy) onClose(); }}><PopoverAnchor virtualRef={anchor} /><PopoverContent className="vf vf-project-options-popover" sideOffset={6} align="end" collisionPadding={8} aria-label="Project options">{error ? <p className="vf-notice" role="alert">{error}</p> : null}{!editable && target.status !== "trashed" ? <p className="vf-notice">This project is read only. Its saved work remains available.</p> : null}{menu}</PopoverContent></Popover>;
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent hideClose={owned && panel === "menu"} className={`vf vf-dialog vf-project-management-panel${owned && panel === "menu" ? " vf-project-options-sheet" : ""}`}><DialogTitle className={owned && panel === "menu" ? "sr-only" : undefined}>{owned ? titles[panel] : "Project unavailable"}</DialogTitle><DialogDescription className={owned ? "sr-only" : undefined}>{owned ? target.name : "Sign in to the original account to view this project."}</DialogDescription>
    {!owned ? null : <>{error ? <div className="vf-notice" role="alert">{error}</div> : null}{!editable && target.status !== "trashed" ? <p className="vf-notice">This project is read only. Its saved work remains available.</p> : null}
    {panel === "menu" ? <><div className="vf-project-options-sheet-header"><DialogClose asChild><FreshIconButton icon="close" label="Close project options" /></DialogClose></div>{menu}</> : null}
    {panel === "rename" ? <form className="vf-project-management-form" noValidate onSubmit={save}><label htmlFor="project-change-value">Project name</label><input id="project-change-value" className="vf-field" value={name} onChange={event => setName(event.target.value)} maxLength={201} disabled={busy} autoFocus /><div className="vf-project-management-actions"><FreshButton type="submit" tone="primary" disabled={busy || !editable}>{busy ? "Saving…" : "Save changes"}</FreshButton><FreshButton type="button" disabled={busy} onClick={() => begin("menu")}>Cancel</FreshButton></div>{error ? <FreshButton type="button" disabled={busy} onClick={() => { void perform(async () => { const latest = await api.getProject(project.id); if (active()) { onProjectChange(latest); setBaseRevision(latest.revision); } }); }}>Load latest project and keep my edits</FreshButton> : null}</form> : null}
    {panel === "conversations" || panel === "archived" ? <><div className="vf-project-management-conversations">{displayed.length ? displayed.map(conversation => <article key={conversation.id} className="vf-project-conversation-row"><img src="/design-assets/project-conversation.svg" alt="" /><div>{editingConversation?.id === conversation.id ? <form onSubmit={event => { event.preventDefault(); const value = editingConversation.name.trim(); if (!value || value.length > 200) { setError("Enter a conversation name from 1 to 200 characters."); return; } changeConversation(conversation, { name: value }, editingConversation.revision); }}><label className="sr-only" htmlFor={`conversation-name-${conversation.id}`}>Conversation name</label><input className="vf-field" id={`conversation-name-${conversation.id}`} value={editingConversation.name} onChange={event => setEditingConversation(current => current ? { ...current, name: event.target.value } : undefined)} maxLength={201} disabled={busy} autoFocus onFocus={event => event.currentTarget.select()} /><div><FreshButton type="submit" tone="primary" disabled={busy}>Save name</FreshButton><FreshButton type="button" disabled={busy} onClick={() => { setEditingConversation(undefined); setFocusAfter({ id: conversation.id }); }}>Cancel</FreshButton></div></form> : <><FreshButton id={`conversation-open-${conversation.id}`} tone="quiet" onClick={() => { onOpenConversation(conversation.id); onClose(); }}>{conversation.name}</FreshButton><p>Edited {new Date(conversation.updatedAt).toLocaleDateString()}</p><div className="vf-project-conversation-actions">{onOpenDraft ? <ConversationDraftMenu ownerId={ownerId} projectId={project.id} conversation={conversation} disabled={busy} onOpenDraft={onOpenDraft} /> : null}<FreshButton disabled={busy || !editable} aria-label={`Rename ${conversation.name}`} onClick={() => { setError(undefined); setMoved(undefined); setEditingConversation({ id: conversation.id, name: conversation.name, revision: conversation.revision }); }}>Rename</FreshButton><FreshButton disabled={busy || !editable} aria-label={`${conversation.status === "archived" ? "Restore" : "Archive"} ${conversation.name}`} onClick={() => changeConversation(conversation, { status: conversation.status === "archived" ? "active" : "archived" })}>{conversation.status === "archived" ? "Restore" : "Archive"}</FreshButton>{library ? <ConversationFolderMenu ownerId={ownerId} conversation={conversation} folderName={conversation.folderId ? filing?.id === conversation.folderId ? filing.name : folderNames[conversation.folderId] : undefined} disabled={busy || project.status !== "active"} onFile={folderId => changeConversation(conversation, { folderId })} /> : null}</div></>}</div></article>) : <p className="vf-secondary">{panel === "archived" ? "No archived conversations." : "No conversations yet."}</p>}</div>{moved ? <div className="vf-project-conversation-moved" role="status"><p>{moved.status === "archived" ? "Conversation archived" : "Conversation restored"}</p><FreshButton tone="quiet" disabled={busy || !editable} aria-label={`Undo: ${moved.status === "archived" ? "restore" : "archive"} ${moved.name}`} onClick={() => { const target = moved; setMoved(undefined); void perform(async () => { const next = await api.changeConversation(project.id, target.id, { expectedRevision: target.revision, status: target.status === "archived" ? "active" : "archived" }); if (active()) { onConversationChange(next); setFocusAfter({ id: target.id }); } }); }}>Undo</FreshButton></div> : null}<FreshButton id="conversation-list-back" tone="quiet" onClick={() => begin("menu")}>{renamable ? "Back to project options" : "Back to conversation options"}</FreshButton></> : null}
    {panel === "trash" ? <div className="vf-project-management-form"><p>This project becomes read only until you restore it. Its conversations, media and edits are kept.</p><div className="vf-project-management-actions"><FreshButton tone="primary" disabled={busy} onClick={() => setStatus("trashed")}>{busy ? "Moving…" : "Move to Trash"}</FreshButton><FreshButton disabled={busy} onClick={() => begin("menu")}>Keep project</FreshButton></div></div> : null}</>}
  </DialogContent></Dialog>;
}
