import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { canonicalJson } from "@shared/workflow/canonicalJson";
import { CreationDraftSchema, type CreationAction, type CreationDraft, type DraftContent, type DraftConflict, type DraftInput } from "@shared/schemas/workflow/draft.schemas";
import { ConversationIdSchema, ProjectIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { SubmissionCommandSchema, type AcceptedRequest } from "@shared/schemas/workflow/request.schemas";
import type { Project, Conversation, ConversationListing } from "@shared/schemas/workflow/project.schemas";
import type { CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import type { PreparedAction } from "@shared/schemas/workflow/preparation.schemas";
import { DraftCheckpointStore, type DraftCheckpoint, type SubmissionCheckpoint } from "@/repositories/workflow/DraftCheckpointStore";
import { WorkflowApi, WorkflowApiError } from "../api/workflowApi";
import { acknowledgeDraftBuffer, draftContent, draftHasSafeRetention, openDraftBuffer, redoDraftBuffer, undoDraftBuffer, type DraftBuffer } from "../state/draftBuffer";
import { EMPTY_WORKSPACE_VIEW, workspaceViewReducer, type WorkspaceViewEvent, type WorkspaceViewState } from "../state/workspaceState";
import {
  applyDraftInputSource,
  emptyDraftContent,
  followupDraftForRequest,
  initialDraftId,
  mediaActionDraftContent,
  resolvePendingDraftInputs,
  retrySlotDraftContent,
} from "../state/inputBinding";
import { settingsForOutput, settingsForProfile } from "../state/capabilitySettings";

function message(error: unknown): string { return error instanceof Error ? error.message : "This operation was not confirmed. Your current words are retained."; }
function id(prefix: string): string { return `${prefix}_${crypto.randomUUID()}`; }
/** The newest active conversation with nothing made in it yet. */
export function unusedConversation(rows: ConversationListing[], folderId?: string): ConversationListing | undefined {
  return rows.filter(row => row.status === "active" && row.acceptanceSequence === 0 && row.folderId === folderId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))[0];
}

export interface ProjectWorkspaceController {
  view: WorkspaceViewState;
  project: Project | undefined;
  conversation: Conversation | undefined;
  conversations: ConversationListing[];
  media: MediaVersion[];
  profiles: CapabilityProfile[];
  active: DraftBuffer | undefined;
  loading: boolean;
  error: string | undefined;
  loadFailureStatus: number | undefined;
  resourceErrors: string[];
  deviceCopies: DraftCheckpoint[];
  recoverDeviceCopy(copy: DraftCheckpoint): Promise<void>;
  localErrors: Record<string, string>;
  saveErrors: Record<string, string>;
  conflicts: Record<string, { current: CreationDraft; retained: DraftConflict }>;
  prepared: PreparedAction | undefined;
  preparing: boolean;
  serviceUnavailable?: boolean;
  submissions: SubmissionCheckpoint[];
  resendableSubmissions: string[];
  followupNotice: { kind: "choose-result" | "edit-unavailable"; requestId: string } | undefined;
  reload(): void;
  edit(content: DraftContent, typingGroup?: string): void;
  openDraft(record: CreationDraft): void;
  newDraft(action: CreationAction): Promise<void>;
  chooseProfile(profile: CapabilityProfile): void;
  flush(): Promise<boolean>;
  canLeave(): boolean;
  prepare(): Promise<void>;
  submit(): Promise<void>;
  make(): Promise<void>;
  refreshMedia(): Promise<void>;
  changeAction(action: CreationAction): void;
  newConversation(): Promise<void>;
  openConversation(id: string): Promise<void>;
  openConversationDraft(record: CreationDraft): Promise<void>;
  requestCancel(request: AcceptedRequest): Promise<void>;
  retryRequest(request: AcceptedRequest, slotId: string): Promise<void>;
  applyText(request: AcceptedRequest, text: string): Promise<void>;
  applyMediaInput(version: MediaVersion, role?: DraftInput["role"], replacing?: DraftInput): void;
  observeProject(project: Project): void;
  observeConversation(conversation: Conversation): void;
  recover(submission: SubmissionCheckpoint): Promise<void>;
  resend(submission: SubmissionCheckpoint): Promise<void>;
  viewMedia(versionId: string): void;
  updateMedia(version: MediaVersion): void;
  bindImport(draftId: string, importId: string, kind?: "image" | "video", role?: DraftInput["role"], replacing?: DraftInput): void;
  useMedia(version: MediaVersion): void;
  editMedia(version: MediaVersion): Promise<void>;
  undo(): void;
  redo(): void;
  copyConflict(draftId: string): Promise<void>;
  access(versionId: string): Promise<{ url: string; expiresAt?: string | undefined }>;
}

/** An owner-bound controller: media observation never writes the active composer. */
export interface ProjectWorkspaceOptions {
  /** A library home starts in an unused conversation instead of the newest one. */
  library?: boolean;
  /** The named project a library home files new conversations into. */
  folderId?: string | undefined;
}

export function useProjectWorkspace(ownerId: string, projectId: string, initialConversationId?: string, initialDraftTargetId?: string, options: ProjectWorkspaceOptions = {}): ProjectWorkspaceController {
  const library = options.library === true;
  const folderId = library ? options.folderId : undefined;
  const api = useMemo(() => new WorkflowApi(undefined, ownerId), [ownerId]);
  const device = useMemo(() => new DraftCheckpointStore(), []);
  const [view, dispatch] = useReducer(workspaceViewReducer, EMPTY_WORKSPACE_VIEW);
  const viewRef = useRef(view);
  viewRef.current = view;
  // The model last used for each action, so switching outputs never drops back to "Choose model".
  const rememberedSettings = useRef<Partial<Record<CreationAction, DraftContent["settings"]>>>({});
  // Drafts this tab created; only these take a model automatically, so a draft open in two tabs never races.
  const freshDraftIds = useRef(new Set<string>());
  const mounted = useRef(true);
  const scopeKey = `${ownerId}:${projectId}`;
  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;
  const inScope = useCallback((): boolean => mounted.current && scopeRef.current === scopeKey, [scopeKey]);
  const [requestedConversationId, setRequestedConversationId] = useState(initialConversationId);
  const requestedConversationRef = useRef(requestedConversationId);
  requestedConversationRef.current = requestedConversationId;
  const initialConversationRef = useRef(initialConversationId);
  initialConversationRef.current = initialConversationId;
  const initialDraftTargetRef = useRef(initialDraftTargetId);
  initialDraftTargetRef.current = initialDraftTargetId;
  const hydrationTarget = useRef({ scopeKey, conversationId: initialConversationId, draftId: initialDraftTargetId });
  const selectionIntent = useRef(0);
  const beginSelectionIntent = useCallback((): number => {
    // Retire an arriving return before awaiting saves or creation. A late read
    // must not select the return target while the new intent is still pending.
    hydrationTarget.current.draftId = undefined;
    selectionIntent.current += 1;
    return selectionIntent.current;
  }, []);
  const [project, setProject] = useState<Project>();
  const [conversation, setConversation] = useState<Conversation>();
  const [conversations, setConversations] = useState<ConversationListing[]>([]);
  const [media, setMedia] = useState<MediaVersion[]>([]);
  const [profiles, setProfiles] = useState<CapabilityProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [loadFailureStatus, setLoadFailureStatus] = useState<number>();
  const [resourceErrors, setResourceErrors] = useState<string[]>([]);
  const [deviceCopies, setDeviceCopies] = useState<DraftCheckpoint[]>([]);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const [conflicts, setConflicts] = useState<Record<string, { current: CreationDraft; retained: DraftConflict }>>({});
  const conflictsRef = useRef(conflicts);
  conflictsRef.current = conflicts;
  const [prepared, setPrepared] = useState<PreparedAction>();
  const [preparing, setPreparing] = useState(false);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const [submissions, setSubmissions] = useState<SubmissionCheckpoint[]>([]);
  const [resendableSubmissions, setResendableSubmissions] = useState<string[]>([]);
  const [followupNotice, setFollowupNotice] = useState<{ draftId: string; kind: "choose-result" | "edit-unavailable"; requestId: string }>();
  const [loadVersion, setLoadVersion] = useState(0);
  const saving = useRef(new Map<string, Promise<boolean>>());
  const submitting = useRef(new Set<string>());
  const making = useRef(new Set<string>());
  const retrying = useRef(new Set<string>());
  const requestOperations = useRef(new Set<string>());
  const conversationOperation = useRef(false);
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;
  const mediaRef = useRef(media);
  mediaRef.current = media;
  const mediaEpoch = useRef(0);

  const emit = useCallback((event: WorkspaceViewEvent): void => { viewRef.current = workspaceViewReducer(viewRef.current, event); dispatch(event); }, []);
  useEffect(() => { if (initialConversationId === requestedConversationRef.current || initialConversationId === conversationRef.current?.id) return; beginSelectionIntent(); emit({ type: "conversation" }); setPrepared(undefined); setRequestedConversationId(initialConversationId); }, [beginSelectionIntent, emit, initialConversationId]);
  useEffect(() => {
    if (hydrationTarget.current.scopeKey !== scopeKey) { selectionIntent.current += 1; hydrationTarget.current = { scopeKey, conversationId: initialConversationRef.current, draftId: initialDraftTargetRef.current }; }
    emit({ type: "reset" }); setProject(undefined); setConversation(undefined); setMedia([]); setPrepared(undefined); setRequestedConversationId(initialConversationRef.current); setSubmissions([]); setResourceErrors([]); setLocalErrors({}); setSaveErrors({}); setConflicts({});
  }, [emit, scopeKey]);
  const checkpoint = useCallback(async (buffer: DraftBuffer): Promise<void> => {
    try {
      await device.save({ schemaVersion: "vidra-draft-checkpoint/v2", ownerId, projectId: ProjectIdSchema.parse(projectId), draftId: buffer.record.id, record: buffer.record, content: buffer.content, sequence: buffer.sequence, serverRevision: buffer.serverRevision, updatedAt: new Date().toISOString() });
      if (!inScope()) return;
      const current = viewRef.current.drafts[buffer.record.id];
      if (current) emit({ type: "update-buffer", buffer: { ...current, checkpointSequence: Math.max(current.checkpointSequence ?? -1, buffer.sequence) } });
      setLocalErrors(previous => { const next = { ...previous }; delete next[buffer.record.id]; return next; });
    } catch (failure) { if (inScope()) setLocalErrors(previous => ({ ...previous, [buffer.record.id]: message(failure) })); }
  }, [device, emit, inScope, ownerId, projectId]);

  useEffect(() => {
    mounted.current = true;
    const abort = new AbortController();
    const intent = selectionIntent.current;
    const requestedDraftId = hydrationTarget.current.scopeKey === scopeKey ? hydrationTarget.current.draftId : undefined;
    const selectionCurrent = (): boolean => selectionIntent.current === intent;
    void (async (): Promise<void> => {
      setLoading(true); setError(undefined); setLoadFailureStatus(undefined); setResourceErrors([]);
      try {
        const owned = await api.getProject(projectId, abort.signal);
        if (owned.ownerId !== ownerId) throw new Error("The project belongs to a different account.");
        if (owned.id !== projectId) throw new Error("The project response has a different identity.");
        if (!abort.signal.aborted && inScope()) setProject(owned);
        const rows = await api.listConversations(projectId, abort.signal);
        if (rows.some(row => row.ownerId !== ownerId || row.projectId !== projectId)) throw new Error("The conversation list does not belong to this project and account.");
        let chosen: ConversationListing | undefined = requestedConversationId ? rows.find(row => row.id === requestedConversationId) : library ? unusedConversation(rows, folderId) : rows.find(row => row.status === "active") ?? rows[0];
        if (requestedConversationId && !chosen) throw new Error("This conversation is unavailable in the current project.");
        if (!chosen && library && owned.status === "active") {
          // Reusing an unused conversation keeps repeat visits from piling up empty rows.
          const created = await api.createConversation(projectId, id("conversation"), "New conversation", folderId);
          if (created.ownerId !== ownerId || created.projectId !== projectId || created.folderId !== folderId) throw new Error("The conversation does not belong to this library and account.");
          rows.push(created); chosen = created;
        }
        if (abort.signal.aborted || !inScope()) return;
        setProject(owned); setConversations(rows); setConversation(chosen);
        if (chosen) {
          const drafts = await api.listDrafts(projectId, chosen.id, abort.signal);
          const ownedDrafts = drafts.filter(record => record.ownerId === ownerId && record.projectId === projectId && record.conversationId === chosen.id);
          for (const record of ownedDrafts) {
            let buffer = openDraftBuffer(record);
            try {
              const local = await device.get(ownerId, projectId, record.id);
              if (local && record.status !== "submitted" && record.status !== "discarded" && local.serverRevision === record.revision && canonicalJson(local.content) !== canonicalJson(draftContent(record))) buffer = { ...buffer, content: local.content, sequence: local.sequence, acknowledgedSequence: undefined, checkpointSequence: local.sequence };
            } catch (failure) { setLocalErrors(previous => ({ ...previous, [record.id]: message(failure) })); }
            if (abort.signal.aborted || !inScope()) return;
            // Reload is observation. A slower read cannot replace live authoring.
            if (!viewRef.current.drafts[record.id]) emit({ type: "update-buffer", buffer });
          }
          const open = requestedDraftId
            ? ownedDrafts.find(record => record.id === requestedDraftId && record.status !== "discarded")
            : ownedDrafts.find(record => record.status === "open") ?? ownedDrafts.find(record => record.status === "parked");
          const buffer = open ? viewRef.current.drafts[open.id] : undefined;
          if (selectionCurrent()) {
            if (requestedDraftId && (!open || hydrationTarget.current.conversationId !== chosen.id)) setError("This retained request is unavailable in the opened conversation. Review its history or choose another request.");
            else if (buffer && !viewRef.current.activeDraftId) { emit({ type: "open-draft", buffer }); if (requestedDraftId) hydrationTarget.current.draftId = undefined; }
          }
          try {
            const copies = await device.list(ownerId, projectId);
            if (!abort.signal.aborted && inScope()) setDeviceCopies(copies.filter(copy => {
              const saved = drafts.find(record => record.id === copy.draftId);
              return !saved || canonicalJson(copy.content) !== canonicalJson(draftContent(saved));
            }));
          } catch (failure) { if (!abort.signal.aborted && inScope()) setResourceErrors(previous => [...previous, `Device recovery copies could not load. ${message(failure)}`]); }
          try {
            const history = await api.history(projectId, chosen.id, abort.signal);
            if (abort.signal.aborted || !inScope()) return;
            emit({ type: "observe-requests", requests: history });
            const hasWorkingDraft = Object.values(viewRef.current.drafts).some(candidate => candidate.record.conversationId === chosen.id && ["open", "parked"].includes(candidate.record.status));
            if (selectionCurrent() && !requestedDraftId && !open && !hasWorkingDraft && !history.length && !viewRef.current.requests.length && owned.status === "active" && (owned.origin.kind === "new" || owned.origin.authority === "workflow") && chosen.status === "active") {
              try {
                const draftId = await initialDraftId(ownerId, projectId, chosen.id, drafts.map(record => record.id));
                if (abort.signal.aborted || !inScope() || !selectionCurrent() || viewRef.current.activeDraftId) return;
                const content = emptyDraftContent("make-video", owned.id, chosen.id, owned.instructions.revision);
                const created = await api.createDraft(projectId, chosen.id, draftId, content);
                if (abort.signal.aborted || !inScope() || created.ownerId !== ownerId || created.projectId !== projectId || created.conversationId !== chosen.id) return;
                freshDraftIds.current.add(created.id);
                const initial = viewRef.current.drafts[created.id] ?? openDraftBuffer(created);
                if (selectionCurrent() && !viewRef.current.activeDraftId && ["open", "parked"].includes(created.status)) emit({ type: "open-draft", buffer: initial });
              } catch (failure) { if (!abort.signal.aborted && inScope() && selectionCurrent()) setResourceErrors(previous => [...previous, `The empty request could not open. Retry loading. ${message(failure)}`]); }
            }
          } catch (failure) { if (!abort.signal.aborted && inScope()) setResourceErrors(previous => [...previous, `History could not load. ${message(failure)}`]); }
        }
        const auxiliary = await Promise.allSettled([api.profiles(abort.signal), api.media(projectId, abort.signal), device.submissions(ownerId)]);
        if (abort.signal.aborted || !inScope()) return;
        if (auxiliary[0]?.status === "fulfilled") setProfiles(auxiliary[0].value);
        if (auxiliary[1]?.status === "fulfilled") setMedia(auxiliary[1].value);
        if (auxiliary[2]?.status === "fulfilled") setSubmissions(auxiliary[2].value.filter(item => item.projectId === projectId && item.state === "unknown"));
        auxiliary.forEach((result, index) => { if (result.status === "rejected") setResourceErrors(previous => [...previous, `${["Models", "Media", "Unconfirmed requests"][index]} could not load. ${message(result.reason)}`]); });
      } catch (failure) { if (!abort.signal.aborted && inScope() && selectionCurrent()) { setError(message(failure)); setLoadFailureStatus(failure instanceof Error && "status" in failure && typeof failure.status === "number" ? failure.status : typeof navigator !== "undefined" && navigator.onLine === false || failure instanceof TypeError ? 0 : 502); } }
      finally { if (!abort.signal.aborted && inScope()) setLoading(false); }
    })();
    return () => { abort.abort(); mounted.current = false; };
  }, [api, device, emit, folderId, inScope, library, loadVersion, ownerId, projectId, requestedConversationId, scopeKey]);

  const flushId = useCallback(async (draftId: string): Promise<boolean> => {
    // Recheck after each awaited save: several callers can resume together.
    while (saving.current.has(draftId)) await saving.current.get(draftId);
    const current = viewRef.current.drafts[draftId];
    if (current && (current.record.ownerId !== ownerId || current.record.projectId !== projectId)) return false;
    if (!current || current.acknowledgedSequence === current.sequence) return true;
    if (conflictsRef.current[draftId] || (current.record.status !== "open" && current.record.status !== "parked")) return false;
    const sequence = current.sequence;
    const promise = (async (): Promise<boolean> => {
      try {
        const result = await api.saveDraft(projectId, draftId, current.serverRevision, current.content);
        if (!inScope()) return false;
        const latest = viewRef.current.drafts[draftId];
        if (!latest) return false;
        if (result.state === "conflict") { setConflicts(previous => ({ ...previous, [draftId]: { current: result.current, retained: result.retained } })); return false; }
        if (result.draft.ownerId !== ownerId) throw new Error("The save returned a different account's work.");
        const acknowledged = acknowledgeDraftBuffer(latest, result.draft, sequence);
        emit({ type: "update-buffer", buffer: acknowledged });
        // Newer words retain their device copy on the acknowledged server base.
        await checkpoint(acknowledged);
        setSaveErrors(previous => { const next = { ...previous }; delete next[draftId]; return next; });
        return true;
      } catch (failure) { if (inScope()) setSaveErrors(previous => ({ ...previous, [draftId]: message(failure) })); return false; }
      finally { saving.current.delete(draftId); }
    })();
    saving.current.set(draftId, promise);
    return promise;
  }, [api, checkpoint, emit, inScope, ownerId, projectId]);

  const active = view.activeDraftId ? view.drafts[view.activeDraftId] : undefined;
  useEffect(() => { if (!active || active.acknowledgedSequence === active.sequence) return; const timeout = setTimeout(() => { void flushId(active.record.id); }, 500); return () => clearTimeout(timeout); }, [active, flushId]);

  const edit = useCallback((content: DraftContent, typingGroup?: string): void => {
    const draftId = viewRef.current.activeDraftId;
    const owned = draftId ? viewRef.current.drafts[draftId] : undefined;
    if (!project || project.status !== "active" || (project.origin.kind !== "new" && project.origin.authority !== "workflow") || conversation?.status !== "active" || !draftId || !owned || !["open", "parked"].includes(owned.record.status) || owned.record.ownerId !== ownerId || owned.record.projectId !== projectId || content.destination.projectId !== projectId || content.destination.conversationId !== owned.record.conversationId) return;
    emit({ type: "edit-draft", draftId, content, ...(typingGroup ? { typingGroup } : {}) });
    setPrepared(undefined);
    const buffer = viewRef.current.drafts[draftId];
    if (buffer) void checkpoint(buffer);
  }, [checkpoint, conversation, emit, ownerId, project, projectId]);

  const newDraft = useCallback(async (action: CreationAction): Promise<void> => {
    if (!project || !conversation || project.ownerId !== ownerId || project.id !== projectId || conversation.ownerId !== ownerId || conversation.projectId !== projectId) return;
    const intent = beginSelectionIntent();
    const currentIntent = (): boolean => inScope() && selectionIntent.current === intent && conversationRef.current?.id === conversation.id;
    try {
      const prior = viewRef.current.activeDraftId;
      const priorSequence = prior ? viewRef.current.drafts[prior]?.sequence : undefined;
      if (prior) {
        const saved = await flushId(prior);
        if (!currentIntent()) return;
        const buffer = viewRef.current.drafts[prior];
        if (buffer && !draftHasSafeRetention(buffer)) { setError("Keep a copy of your unfinished words before starting another request."); return; }
        if (saved && buffer && buffer.record.status === "open" && buffer.acknowledgedSequence === buffer.sequence) {
          const meaningful = Boolean(buffer.content.instructions.trim() || buffer.content.inputs.length || buffer.content.context.requestIds.length || buffer.content.settings.profileId !== "unselected");
          const record = await api.draftStatus(projectId, prior, buffer.serverRevision, meaningful ? "parked" : "discarded");
          if (!currentIntent()) return;
          emit({ type: "update-buffer", buffer: { ...buffer, record } });
        }
      }
      const empty = emptyDraftContent(action, project.id, conversation.id, project.instructions.revision);
      const content: DraftContent = { ...empty, settings: settingsForOutput(empty, action, profiles, rememberedSettings.current[action]) };
      const record = await api.createDraft(projectId, conversation.id, id("draft"), content);
      if (!currentIntent() || record.ownerId !== ownerId || record.projectId !== projectId || record.conversationId !== conversation.id) return;
      freshDraftIds.current.add(record.id);
      if (viewRef.current.activeDraftId !== prior || (prior && viewRef.current.drafts[prior]?.sequence !== priorSequence)) { emit({ type: "update-buffer", buffer: openDraftBuffer(record) }); return; }
      emit({ type: "open-draft", buffer: openDraftBuffer(record) }); setPrepared(undefined);
    } catch (failure) { if (currentIntent()) setError(message(failure)); }
  }, [api, beginSelectionIntent, conversation, emit, flushId, inScope, ownerId, profiles, project, projectId]);

  const chooseProfile = useCallback((profile: CapabilityProfile): void => {
    const draftId = viewRef.current.activeDraftId;
    const buffer = draftId ? viewRef.current.drafts[draftId] : undefined;
    if (!buffer || profile.action !== buffer.content.action) return;
    edit({ ...buffer.content, settings: settingsForProfile(profile, buffer.content) });
  }, [edit]);

  const prepare = useCallback(async (): Promise<void> => {
    const draftId = viewRef.current.activeDraftId;
    if (!draftId) return;
    setPreparing(true);
    const sequence = viewRef.current.drafts[draftId]?.sequence;
    try { if (await flushId(draftId)) { const result = await api.prepare(projectId, draftId); if (inScope() && viewRef.current.activeDraftId === draftId && viewRef.current.drafts[draftId]?.sequence === sequence) setPrepared(result); } }
    catch (failure) { if (inScope()) setError(message(failure)); }
    finally { if (inScope()) setPreparing(false); }
  }, [api, flushId, inScope, projectId]);

  const observeAcceptance = useCallback((request: AcceptedRequest): void => {
    if (request.ownerId !== ownerId || request.projectId !== projectId) throw new Error("The receipt returned a different scope.");
    if (conversationRef.current?.id === request.conversationId) emit({ type: "observe-requests", requests: [request] });
    const buffer = viewRef.current.drafts[request.executionDraftId];
    if (buffer) emit({ type: "update-buffer", buffer: { ...buffer, record: { ...buffer.record, status: "submitted" } } });
  }, [emit, ownerId, projectId]);

  const openFollowup = useCallback(async (request: AcceptedRequest): Promise<void> => {
    if (!inScope() || !project || !conversation || conversationRef.current?.id !== request.conversationId || viewRef.current.activeDraftId !== request.executionDraftId) return;
    const followup = followupDraftForRequest(request, profiles, project.id, conversation.id, project.instructions.revision);
    if (!followup) return;
    const record = await api.createDraft(projectId, conversation.id, id("draft"), followup.content);
    if (!inScope() || record.ownerId !== ownerId || conversationRef.current?.id !== request.conversationId || viewRef.current.activeDraftId !== request.executionDraftId) return;
    emit({ type: "open-draft", buffer: openDraftBuffer(record) });
    setFollowupNotice(followup.noticeKind ? { draftId: record.id, kind: followup.noticeKind, requestId: request.id } : undefined);
  }, [api, conversation, emit, inScope, ownerId, profiles, project, projectId]);

  const completeAcceptance = useCallback(async (request: AcceptedRequest, pending: SubmissionCheckpoint): Promise<void> => {
    observeAcceptance(request);
    setSubmissions(previous => previous.filter(item => item.submissionId !== pending.submissionId));
    setResendableSubmissions(previous => previous.filter(id => id !== pending.submissionId));
    try { await openFollowup(request); }
    catch (failure) { if (inScope()) setError(`The request was accepted. Its next draft could not open yet. ${message(failure)}`); }
    try { await device.saveSubmission({ ...pending, state: "accepted" }); }
    catch (failure) { if (inScope()) setError(`The request was accepted, but its device status could not save. ${message(failure)}`); }
  }, [device, inScope, observeAcceptance, openFollowup]);

  const submitPrepared = useCallback(async (result: PreparedAction, allowInactive = false): Promise<void> => {
    if (!inScope() || result.state !== "ready") return;
    const prepared = result;
    if (!allowInactive && viewRef.current.activeDraftId !== prepared.draftId) return;
    const buffer = viewRef.current.drafts[prepared.draftId];
    if (!buffer || !["open", "parked"].includes(buffer.record.status) || submitting.current.has(buffer.record.id) || buffer.serverRevision !== prepared.draftRevision || buffer.acknowledgedSequence !== buffer.sequence) return;
    submitting.current.add(buffer.record.id);
    const command = SubmissionCommandSchema.parse({ submissionId: id("submission"), draftId: buffer.record.id, draftRevision: prepared.draftRevision, reviewedHash: prepared.reviewedHash });
    const pending: SubmissionCheckpoint = { ownerId, projectId: ProjectIdSchema.parse(projectId), submissionId: command.submissionId, command, sequence: buffer.sequence, state: "unknown" };
    setSubmissions(previous => [...previous, pending]);
    emit({ type: "update-buffer", buffer: { ...buffer, record: { ...buffer.record, status: "submitted" } } });
    setPrepared(undefined);
    let dispatchStarted = false;
    try {
      await device.saveSubmission(pending);
      if (!inScope()) return;
      dispatchStarted = true;
      const request = await api.submit(projectId, command);
      if (!inScope()) return;
      if (request.ownerId !== ownerId || request.projectId !== projectId || request.executionDraftId !== pending.command.draftId || request.submissionId !== pending.submissionId) throw new Error("The receipt does not match this captured request.");
      await completeAcceptance(request, pending);
    } catch (failure) {
      if (!inScope()) return;
      setError(message(failure));
      const refusedBeforeAdmission = failure instanceof WorkflowApiError && ([400, 401, 403, 422].includes(failure.status) || (failure.status === 409 && failure.code === "revision_conflict") || (failure.status === 503 && failure.code === "capability_unavailable"));
      if (!dispatchStarted || refusedBeforeAdmission) {
        const latest = viewRef.current.drafts[buffer.record.id] ?? buffer;
        emit({ type: "update-buffer", buffer: { ...latest, record: { ...latest.record, status: buffer.record.status } } });
        await device.saveSubmission({ ...pending, state: "rejected" }).catch(() => undefined);
        setSubmissions(previous => previous.filter(item => item.submissionId !== pending.submissionId));
      }
    } finally { submitting.current.delete(buffer.record.id); }
  }, [api, completeAcceptance, device, emit, inScope, ownerId, projectId]);

  const submit = useCallback(async (): Promise<void> => { if (prepared) await submitPrepared(prepared); }, [prepared, submitPrepared]);

  const make = useCallback(async (): Promise<void> => {
    const draftId = viewRef.current.activeDraftId;
    const initial = draftId ? viewRef.current.drafts[draftId] : undefined;
    if (!draftId || !initial || initial.record.ownerId !== ownerId || initial.record.projectId !== projectId || !initial.content.instructions.trim() || !["open", "parked"].includes(initial.record.status) || making.current.has(draftId) || submitting.current.has(draftId)) return;
    making.current.add(draftId); setPreparing(true); setError(undefined); setServiceUnavailable(false);
    const sequence = initial.sequence;
    try {
      if (!await flushId(draftId) || !inScope()) return;
      const current = viewRef.current.drafts[draftId];
      if (viewRef.current.activeDraftId !== draftId || !current || current.sequence !== sequence || current.acknowledgedSequence !== sequence) return;
      const result = await api.prepare(projectId, draftId);
      if (!inScope() || viewRef.current.activeDraftId !== draftId || viewRef.current.drafts[draftId]?.sequence !== sequence) return;
      setPrepared(result);
      if (result.state === "ready") await submitPrepared(result);
    } catch (failure) { if (inScope()) { setError(message(failure)); if (failure instanceof WorkflowApiError && failure.status === 503) setServiceUnavailable(true); } }
    finally { making.current.delete(draftId); if (inScope()) setPreparing(false); }
  }, [api, flushId, inScope, ownerId, projectId, submitPrepared]);

  const recover = useCallback(async (pending: SubmissionCheckpoint): Promise<void> => {
    if (!inScope() || pending.ownerId !== ownerId || pending.projectId !== projectId) return;
    try {
      const request = await api.recover(pending.submissionId);
      if (!inScope()) return;
      if (!request) {
        setResendableSubmissions(previous => previous.includes(pending.submissionId) ? previous : [...previous, pending.submissionId]);
        return;
      }
      if (request.ownerId !== ownerId || request.projectId !== projectId || request.executionDraftId !== pending.command.draftId || request.submissionId !== pending.submissionId) throw new Error("The receipt does not match this captured request.");
      await completeAcceptance(request, pending);
    }
    catch (failure) { if (inScope()) setError(message(failure)); }
  }, [api, completeAcceptance, inScope, ownerId, projectId]);

  const resend = useCallback(async (pending: SubmissionCheckpoint): Promise<void> => {
    if (!inScope() || pending.ownerId !== ownerId || pending.projectId !== projectId || !resendableSubmissions.includes(pending.submissionId) || submitting.current.has(pending.command.draftId)) return;
    submitting.current.add(pending.command.draftId);
    try {
      await device.saveSubmission(pending);
      if (!inScope()) return;
      const request = await api.submit(projectId, pending.command);
      if (inScope()) await completeAcceptance(request, pending);
    } catch (failure) { if (inScope()) setError(message(failure)); }
    finally { submitting.current.delete(pending.command.draftId); }
  }, [api, completeAcceptance, device, inScope, ownerId, projectId, resendableSubmissions]);

  const refreshMedia = useCallback(async (): Promise<void> => {
    const epoch = mediaEpoch.current;
    const rows = await api.media(projectId);
    if (!inScope()) return;
    if (rows.some(row => row.ownerId !== ownerId || row.projectId !== projectId)) throw new Error("The media list belongs to a different account or project.");
    setMedia(current => epoch === mediaEpoch.current ? rows : [...rows.filter(row => !current.some(existing => existing.id === row.id)), ...current]);
  }, [api, inScope, ownerId, projectId]);

  const changeAction = useCallback((action: CreationAction): void => {
    const draftId = viewRef.current.activeDraftId;
    const buffer = draftId ? viewRef.current.drafts[draftId] : undefined;
    if (!buffer || action === buffer.content.action) return;
    if (buffer.content.settings.profileId !== "unselected") rememberedSettings.current[buffer.content.action] = buffer.content.settings;
    edit({ ...buffer.content, action, settings: settingsForOutput(buffer.content, action, profiles, rememberedSettings.current[action]) });
  }, [edit, profiles]);

  const activeDraftId = view.activeDraftId;
  const activeNeedsModel = activeDraftId ? view.drafts[activeDraftId]?.content.settings.profileId === "unselected" : false;
  // A composer never waits on "Choose model": a draft this tab created takes its output's model once models load.
  useEffect(() => {
    if (!activeDraftId || !activeNeedsModel || !profiles.length || !freshDraftIds.current.has(activeDraftId)) return;
    const buffer = viewRef.current.drafts[activeDraftId];
    if (!buffer) return;
    const settings = settingsForOutput(buffer.content, buffer.content.action, profiles, rememberedSettings.current[buffer.content.action]);
    if (settings.profileId !== "unselected") edit({ ...buffer.content, settings });
  }, [activeDraftId, activeNeedsModel, edit, profiles]);

  const openConversation = useCallback(async (value: string): Promise<void> => {
    const parsed = ConversationIdSchema.safeParse(value);
    const chosen = parsed.success ? conversations.find(row => row.id === parsed.data && row.ownerId === ownerId && row.projectId === projectId) : undefined;
    if (!chosen) { setError("This conversation is unavailable in this project."); return; }
    if (conversationRef.current?.id === chosen.id || conversationOperation.current) return;
    conversationOperation.current = true;
    const intent = beginSelectionIntent();
    try {
      const draftId = viewRef.current.activeDraftId;
      if (draftId) await flushId(draftId);
      if (!inScope() || selectionIntent.current !== intent) return;
      const buffer = draftId ? viewRef.current.drafts[draftId] : undefined;
      if (buffer && !draftHasSafeRetention(buffer)) { setError("Keep a copy of your unfinished words before changing conversations."); return; }
      emit({ type: "conversation" }); setPrepared(undefined); setRequestedConversationId(chosen.id);
    } finally { conversationOperation.current = false; }
  }, [beginSelectionIntent, conversations, emit, flushId, inScope, ownerId, projectId]);

  const openConversationDraft = useCallback(async (input: CreationDraft): Promise<void> => {
    const record = CreationDraftSchema.parse(input);
    const chosen = conversations.find(row => row.id === record.conversationId && row.ownerId === ownerId && row.projectId === projectId);
    if (!inScope() || record.ownerId !== ownerId || record.projectId !== projectId || !chosen || !["open", "parked"].includes(record.status)) throw new Error("This unfinished request is unavailable in the current project.");
    if (conversationOperation.current) throw new Error("A conversation is still opening. Try again when it finishes.");
    conversationOperation.current = true;
    const intent = beginSelectionIntent();
    const priorId = viewRef.current.activeDraftId;
    const priorSequence = priorId ? viewRef.current.drafts[priorId]?.sequence : undefined;
    const priorConversation = conversationRef.current?.id;
    const currentSelection = (): boolean => inScope() && selectionIntent.current === intent && viewRef.current.activeDraftId === priorId && conversationRef.current?.id === priorConversation && (!priorId || viewRef.current.drafts[priorId]?.sequence === priorSequence);
    try {
      if (priorId) await flushId(priorId);
      if (!currentSelection()) throw new Error("The current work changed while this request was opening. Select it again.");
      const current = priorId ? viewRef.current.drafts[priorId] : undefined;
      if (current && !draftHasSafeRetention(current)) throw new Error("Keep a copy of your unfinished words before changing requests.");
      const [records, history] = await Promise.all([api.listDrafts(projectId, chosen.id), api.history(projectId, chosen.id)]);
      if (!currentSelection()) throw new Error("The current work changed while this request was opening. Select it again.");
      if (records.some(row => row.ownerId !== ownerId || row.projectId !== projectId || row.conversationId !== chosen.id) || history.some(row => row.ownerId !== ownerId || row.projectId !== projectId || row.conversationId !== chosen.id)) throw new Error("The loaded work belongs to another account or conversation.");
      const latest = records.find(row => row.id === record.id && ["open", "parked"].includes(row.status));
      if (!latest) throw new Error("This request is no longer unfinished. Open its conversation to inspect its history.");
      if (latest.revision !== record.revision) throw new Error("This request changed elsewhere. Reopen its conversation menu to load the latest copy.");
      const retained = viewRef.current.drafts[latest.id];
      if (retained && retained.serverRevision !== latest.revision && retained.acknowledgedSequence !== retained.sequence) throw new Error("A different local copy is retained. Keep it before opening this saved revision.");
      let selected = retained && retained.serverRevision === latest.revision ? { ...retained, record: latest } : openDraftBuffer(latest);
      if (!retained) {
        const local = await device.get(ownerId, projectId, latest.id);
        if (!currentSelection()) throw new Error("The current work changed while this request was opening. Select it again.");
        if (local && canonicalJson(local.content) !== canonicalJson(draftContent(latest))) {
          if (local.serverRevision !== latest.revision) throw new Error("A different device copy is retained. Keep it before opening this saved revision.");
          selected = { ...selected, content: local.content, sequence: local.sequence, checkpointSequence: local.sequence, acknowledgedSequence: undefined };
        }
      }
      for (const candidate of records) if (!viewRef.current.drafts[candidate.id]) emit({ type: "update-buffer", buffer: openDraftBuffer(candidate) });
      emit({ type: "conversation" });
      conversationRef.current = chosen;
      setConversation(chosen); setRequestedConversationId(chosen.id); setPrepared(undefined);
      emit({ type: "observe-requests", requests: history });
      emit({ type: "open-draft", buffer: selected });
    } finally { conversationOperation.current = false; }
  }, [api, beginSelectionIntent, conversations, device, emit, flushId, inScope, ownerId, projectId]);

  const newConversation = useCallback(async (): Promise<void> => {
    if (!project || project.status !== "active" || conversationOperation.current) return;
    conversationOperation.current = true;
    const intent = beginSelectionIntent();
    try {
      const draftId = viewRef.current.activeDraftId;
      if (draftId) await flushId(draftId);
      const buffer = draftId ? viewRef.current.drafts[draftId] : undefined;
      if (!inScope() || selectionIntent.current !== intent) return;
      if (buffer && !draftHasSafeRetention(buffer)) { setError("Keep a copy of your unfinished words before starting a conversation."); return; }
      const record = await api.createConversation(projectId, id("conversation"), "New conversation");
      if (!inScope() || selectionIntent.current !== intent || record.ownerId !== ownerId || record.projectId !== projectId) return;
      emit({ type: "conversation" }); setConversations(rows => [...rows, record]); setPrepared(undefined); setRequestedConversationId(record.id);
    } catch (failure) { if (inScope() && selectionIntent.current === intent) setError(message(failure)); }
    finally { conversationOperation.current = false; }
  }, [api, beginSelectionIntent, emit, flushId, inScope, ownerId, project, projectId]);

  const requestCancel = useCallback(async (request: AcceptedRequest): Promise<void> => {
    const operation = `cancel:${request.id}`;
    if (request.ownerId !== ownerId || request.projectId !== projectId || requestOperations.current.has(operation)) return;
    requestOperations.current.add(operation);
    try { const observed = await api.cancelRequest(projectId, request.id); if (inScope()) observeAcceptance(observed); }
    catch (failure) { if (inScope()) setError(message(failure)); }
    finally { requestOperations.current.delete(operation); }
  }, [api, inScope, observeAcceptance, ownerId, projectId]);

  const retryRequest = useCallback(async (request: AcceptedRequest, slotId: string): Promise<void> => {
    const slot = request.slots.find(candidate => candidate.id === slotId);
    const operation = `${request.id}:${slotId}`;
    if (!slot || request.ownerId !== ownerId || request.projectId !== projectId || retrying.current.has(operation)) return;
    retrying.current.add(operation);
    try {
      if (["storage-failed", "attachment-failed", "stored", "attaching"].includes(slot.delivery) || (slot.outcome === "completed" && slot.versionId)) {
        const observed = await api.reconcileRequest(projectId, request.id);
        if (inScope()) { observeAcceptance(observed); await refreshMedia(); }
        return;
      }
      if (!["failed", "cancelled", "needs-attention"].includes(slot.outcome) && slot.delivery !== "lost") return;
      const conversationId = conversationRef.current?.id;
      const content = retrySlotDraftContent(request, slot);
      const record = await api.createDraft(projectId, request.conversationId, id("draft"), content);
      if (!inScope() || record.ownerId !== ownerId || record.projectId !== projectId) return;
      emit({ type: "update-buffer", buffer: openDraftBuffer(record) });
      const result = await api.prepare(projectId, record.id);
      if (!inScope() || conversationRef.current?.id !== conversationId) return;
      if (result.state === "blocked") { setError(result.reasons.map(reason => reason.message).join(" ")); return; }
      await submitPrepared(result, true);
    } catch (failure) { if (inScope()) setError(message(failure)); }
    finally { retrying.current.delete(operation); }
  }, [api, emit, inScope, observeAcceptance, ownerId, projectId, refreshMedia, submitPrepared]);

  const applyText = useCallback(async (request: AcceptedRequest, text: string): Promise<void> => {
    if (request.ownerId !== ownerId || request.projectId !== projectId || !request.slots.some(slot => slot.outcome === "completed" && slot.text === text)) return;
    const target = request.snapshot.contextualTarget;
    if (target?.kind === "draft") {
      const buffer = viewRef.current.drafts[target.draftId];
      if (!buffer || viewRef.current.activeDraftId !== target.draftId || buffer.serverRevision !== target.revision || buffer.acknowledgedSequence !== buffer.sequence || !["open", "parked"].includes(buffer.record.status)) { setError("The target words have changed. Your current draft is unchanged; select a fresh target."); return; }
      edit({ ...buffer.content, instructions: text });
      return;
    }
    if (target) { setError("This answer targets work that is not currently editable here."); return; }
    const activeId = viewRef.current.activeDraftId;
    const current = activeId ? viewRef.current.drafts[activeId] : undefined;
    const chosenConversation = conversationRef.current;
    if (!project || !chosenConversation || project.status !== "active" || chosenConversation.status !== "active") return;
    if (activeId) await flushId(activeId);
    if (!inScope() || viewRef.current.activeDraftId !== activeId) return;
    const content: DraftContent = current ? { ...current.content, instructions: text } : emptyDraftContent("make-video", project.id, chosenConversation.id, project.instructions.revision, text);
    const record = await api.createDraft(projectId, chosenConversation.id, id("draft"), content);
    if (!inScope() || viewRef.current.activeDraftId !== activeId || conversationRef.current?.id !== chosenConversation.id || (current && viewRef.current.drafts[activeId ?? ""]?.sequence !== current.sequence)) return;
    if (!current) freshDraftIds.current.add(record.id);
    emit({ type: "open-draft", buffer: openDraftBuffer(record) }); setPrepared(undefined);
  }, [api, edit, emit, flushId, inScope, ownerId, project, projectId]);

  const applyMediaInput = useCallback((version: MediaVersion, requestedRole?: DraftInput["role"], replacing?: DraftInput): void => {
    const draftId = viewRef.current.activeDraftId;
    const current = draftId ? viewRef.current.drafts[draftId] : undefined;
    if (!current || version.ownerId !== ownerId || version.projectId !== projectId) return;
    const kind = version.kind === "export" ? "video" : version.kind;
    const next = applyDraftInputSource(current.content, profiles, { state: "resolved", versionId: version.id, kind }, requestedRole, replacing);
    if (next !== current.content) edit(next);
  }, [edit, ownerId, profiles, projectId]);

  useEffect(() => {
    for (const buffer of Object.values(viewRef.current.drafts)) {
      if (buffer.record.ownerId !== ownerId || buffer.record.projectId !== projectId || !["open", "parked"].includes(buffer.record.status)) continue;
      const next = resolvePendingDraftInputs(buffer.content, viewRef.current.requests, media, ownerId, projectId);
      if (next !== buffer.content) {
        emit({ type: "edit-draft", draftId: buffer.record.id, content: next });
        const latest = viewRef.current.drafts[buffer.record.id];
        if (latest) { void checkpoint(latest); void flushId(buffer.record.id); }
      }
    }
  }, [checkpoint, emit, flushId, media, ownerId, projectId, view.drafts, view.requests]);

  const pollingIds = view.requests.filter(request => request.slots.some(slot => ["queued", "running", "unknown"].includes(slot.outcome) || ["storing", "stored", "attaching"].includes(slot.delivery))).map(request => request.id).sort().join(",");
  useEffect(() => {
    if (!conversation || !pollingIds) return;
    const abort = new AbortController();
    const conversationId = conversation.id;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async (): Promise<void> => {
      const epoch = mediaEpoch.current;
      try {
        const [historyResults, mediaResults, statusResults] = await Promise.all([
          Promise.allSettled([api.history(projectId, conversationId, abort.signal)]),
          Promise.allSettled([api.media(projectId, abort.signal)]),
          Promise.allSettled(pollingIds.split(",").map(requestId => api.requestStatus(projectId, requestId, abort.signal))),
        ]);
        if (abort.signal.aborted || !inScope() || conversationRef.current?.id !== conversationId) return;
        const observed: AcceptedRequest[] = [];
        const history = historyResults[0]; if (history?.status === "fulfilled") observed.push(...history.value);
        for (const result of statusResults) if (result.status === "fulfilled") observed.push(result.value);
        if (observed.some(request => request.ownerId !== ownerId || request.projectId !== projectId || request.conversationId !== conversationId)) throw new Error("A request update returned a different account or conversation.");
        const incoming = mediaResults[0];
        if (incoming?.status === "fulfilled") {
          const rows = incoming.value;
          if (rows.some(row => row.ownerId !== ownerId || row.projectId !== projectId)) throw new Error("A media update returned a different account.");
          mediaRef.current = epoch === mediaEpoch.current ? rows : [...rows.filter(row => !mediaRef.current.some(existing => existing.id === row.id)), ...mediaRef.current];
          setMedia(mediaRef.current);
        }
        const rejected = [...historyResults, ...mediaResults, ...statusResults].find(result => result.status === "rejected");
        setResourceErrors(previous => rejected ? [...previous.filter(problem => !problem.startsWith("Request updates")), "Request updates could not load. Existing work is retained; checking again."] : previous.filter(problem => !problem.startsWith("Request updates")));
        if (observed.length) emit({ type: "observe-requests", requests: observed });

      } catch (failure) { if (!abort.signal.aborted && inScope()) setResourceErrors(previous => [...previous.filter(problem => !problem.startsWith("Request updates")), `Request updates could not load. ${message(failure)}`]); }
      finally { if (!abort.signal.aborted && inScope()) timer = setTimeout(() => { void tick(); }, 2000); }
    };
    void tick();
    return () => { abort.abort(); if (timer) clearTimeout(timer); };
  }, [api, checkpoint, conversation, emit, flushId, inScope, ownerId, pollingIds, projectId]);

  const changeHistory = useCallback((direction: "undo" | "redo"): void => { const draftId = viewRef.current.activeDraftId; const current = draftId ? viewRef.current.drafts[draftId] : undefined; if (!current) return; const buffer = direction === "undo" ? undoDraftBuffer(current) : redoDraftBuffer(current); emit({ type: "update-buffer", buffer }); setPrepared(undefined); void checkpoint(buffer); }, [checkpoint, emit]);

  return {
    view, project, conversation, conversations, media, profiles, active, loading, error, loadFailureStatus, resourceErrors, deviceCopies, localErrors, saveErrors, conflicts, prepared, preparing, serviceUnavailable, submissions, resendableSubmissions,
    followupNotice: followupNotice?.draftId === active?.record.id && !active?.content.inputs.length ? followupNotice : undefined,
    recoverDeviceCopy: async copy => { if (copy.ownerId !== ownerId || copy.projectId !== projectId || !conversation) return; const record = await api.createDraft(projectId, conversation.id, id("draft"), { ...copy.content, destination: { projectId: ProjectIdSchema.parse(projectId), conversationId: conversation.id } }); emit({ type: "open-draft", buffer: openDraftBuffer(record) }); },
    reload: () => { setServiceUnavailable(false); setLoadVersion(version => version + 1); }, edit, openDraft: record => { if (record.ownerId !== ownerId || record.projectId !== projectId || record.conversationId !== conversationRef.current?.id) return; beginSelectionIntent(); emit({ type: "open-draft", buffer: viewRef.current.drafts[record.id] ?? openDraftBuffer(record) }); setPrepared(undefined); }, newDraft, chooseProfile,
    flush: async () => (await Promise.all(Object.values(viewRef.current.drafts).filter(buffer => buffer.acknowledgedSequence !== buffer.sequence).map(buffer => flushId(buffer.record.id)))).every(Boolean), prepare, submit, make, refreshMedia, changeAction, newConversation, openConversation, openConversationDraft, requestCancel, retryRequest, applyText, applyMediaInput, recover, resend,
    observeProject: record => { if (!inScope() || record.ownerId !== ownerId || record.id !== projectId) return; setProject(current => !current || record.revision >= current.revision ? record : current); },
    observeConversation: record => { if (!inScope() || record.ownerId !== ownerId || record.projectId !== projectId) return; setConversations(rows => { const current = rows.find(row => row.id === record.id); return current && current.revision > record.revision ? rows : [...rows.filter(row => row.id !== record.id), current?.media ? { ...record, media: current.media } : record]; }); setConversation(current => current?.id === record.id && record.revision >= current.revision ? record : current); },
    canLeave: () => Object.values(viewRef.current.drafts).every(buffer => draftHasSafeRetention(buffer)),
    viewMedia: versionId => emit({ type: "view-media", versionId }), undo: () => changeHistory("undo"), redo: () => changeHistory("redo"),
    updateMedia: version => { if (version.ownerId === ownerId && version.projectId === projectId) { mediaEpoch.current += 1; setMedia(rows => [...rows.filter(row => row.id !== version.id), version]); } },
    bindImport: (draftId, importId, kind = "image", requestedRole, replacing) => {
      const buffer = viewRef.current.drafts[draftId];
      if (!buffer || buffer.record.ownerId !== ownerId || !["open", "parked"].includes(buffer.record.status)) return;
      const content = applyDraftInputSource(buffer.content, profiles, { state: "importing", importId, kind }, requestedRole, replacing);
      if (content === buffer.content) return;
      emit({ type: "edit-draft", draftId, content });
      const next = viewRef.current.drafts[draftId]; if (next) void checkpoint(next);
    },
    useMedia: applyMediaInput,
    editMedia: async version => {
      if (!project || !conversation || version.ownerId !== ownerId || version.projectId !== projectId) return;
      try {
        const priorId = viewRef.current.activeDraftId;
        const priorSequence = priorId ? viewRef.current.drafts[priorId]?.sequence : undefined;
        if (priorId) await flushId(priorId);
        if (!inScope()) return;
        const record = await api.createDraft(projectId, conversation.id, id("draft"), mediaActionDraftContent(version.kind === "image" ? "edit-image" : "edit-video", version.id, project.id, conversation.id, project.instructions.revision));
        if (inScope() && record.ownerId === ownerId && record.projectId === projectId && conversationRef.current?.id === record.conversationId) { if (viewRef.current.activeDraftId !== priorId || (priorId && viewRef.current.drafts[priorId]?.sequence !== priorSequence)) emit({ type: "update-buffer", buffer: openDraftBuffer(record) }); else { emit({ type: "open-draft", buffer: openDraftBuffer(record) }); setPrepared(undefined); } }
      } catch (failure) { if (inScope()) setError(message(failure)); }
    },
    copyConflict: async draftId => { const buffer = viewRef.current.drafts[draftId]; if (!buffer || !conversation) return; const record = await api.createDraft(projectId, conversation.id, id("draft"), buffer.content); emit({ type: "open-draft", buffer: openDraftBuffer(record) }); },
    access: versionId => api.access(projectId, versionId),
  };
}
