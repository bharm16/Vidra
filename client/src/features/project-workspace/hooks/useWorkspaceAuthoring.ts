import { useWorkspaceSelection } from "./useWorkspaceSelection";
import { useRequestHistory } from "./useRequestHistory";
import { authoringDraft, type AuthoringDraft, type PendingSubmission, type RetainedDeviceCopy, type CapturedFrame } from "../state/authoringView";
import type { ProjectAreaMask } from "@shared/schemas/workflow/sketch.schemas";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { canonicalJson } from "@shared/workflow/canonicalJson";
import { CreationDraftSchema, type CreationAction, type CreationDraft, type DraftContent, type DraftConflict, type DraftInput } from "@shared/schemas/workflow/draft.schemas";
import { ConversationIdSchema, ProjectIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { SubmissionCommandSchema, type AcceptedRequest } from "@shared/schemas/workflow/request.schemas";
import type { Project, Conversation, ConversationListing } from "@shared/schemas/workflow/project.schemas";
import type { CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import type { PreparedAction, PreparationReason } from "@shared/schemas/workflow/preparation.schemas";
import type { DraftCheckpoint, SubmissionCheckpoint } from "@/repositories/workflow/DraftCheckpointStore";
import { OwnedRequestError as WorkflowApiError } from "@/services/http/OwnedRequest";
import type { WorkspaceAdapters } from "../api/WorkspaceAdapters";
import { acknowledgeDraftBuffer, draftContent, draftHasSafeRetention, openDraftBuffer, redoDraftBuffer, sortDeviceCopies, undoDraftBuffer, type DraftBuffer } from "../state/draftBuffer";
import { EMPTY_WORKSPACE_VIEW, workspaceViewReducer, type WorkspaceViewEvent, type WorkspaceViewState } from "../state/workspaceState";
import {
  applyDraftInputSource,
  emptyDraftContent,
  followupDraftForRequest,
  initialDraftId,
  inputsForAction,
  inputsWithResult,
  mediaActionDraftContent,
  resolvePendingDraftInputs,
  retrySlotDraftContent,
  reuseDraftContent,
  withoutDraftInput,
  settleModel,
} from "../state/inputBinding";
import { autoSettings, resolveAuto, settingsForOutput, settingsForProfile } from "../state/capabilitySettings";
import { actionEntry, composerOutput, composerTool, placeActions } from "@shared/workflow/actionRegistry";
import { DEFAULT_CONVERSATION_NAME } from "@shared/workflow/conversationName";

function message(error: unknown): string { return error instanceof Error ? error.message : "This operation was not confirmed. Your current words are retained."; }
function id(prefix: string): string { return `${prefix}_${crypto.randomUUID()}`; }
function inputKey(input: DraftInput): string { return input.state === "resolved" ? input.versionId : input.state === "importing" ? input.importId : `${input.requestId}:${input.slotId}`; }
/** The switch output or rail tool an action belongs to. */
function placeOf(action: CreationAction): string { return composerOutput(action) ?? composerTool(action) ?? action; }
/** What a draft held on one output when it was switched away, so switching back restores it as it was. */
interface LeftSetup { action: CreationAction; settings: DraftContent["settings"]; roles: Map<string, DraftInput["role"]>; }
/** The newest active conversation with nothing made in it yet. */
export function unusedConversation(rows: ConversationListing[], folderId?: string): ConversationListing | undefined {
  return rows.filter(row => row.status === "active" && row.acceptanceSequence === 0 && row.folderId === folderId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))[0];
}

export type WorkspaceResource = "models" | "media" | "history" | "recovery" | "drafts" | "updates";

export interface ProjectWorkspaceController {
  view: Pick<WorkspaceViewState, "requests" | "viewedVersionId" | "timelineVisible" | "historyProblem">;
  conversationHasWork: boolean;
  project: Project | undefined;
  conversation: Conversation | undefined;
  conversations: ConversationListing[];
  media: MediaVersion[];
  profiles: CapabilityProfile[];
  active: AuthoringDraft | undefined;
  areaDropped: boolean;
  captureFrame(source: MediaVersion, seconds: number): Promise<CapturedFrame | undefined>;
  resources: Record<WorkspaceResource, { state: "loading" | "ready" | "error"; message: string | undefined }>;
  reuseSetup(request: AcceptedRequest, variation?: boolean): Promise<{ draftId: string; resultId: string | undefined } | undefined>;
  useWords(request: AcceptedRequest): Promise<void>;
  finishArea(source: MediaVersion, mask: ProjectAreaMask | undefined): Promise<MediaVersion | undefined>;
  loading: boolean;
  error: string | undefined;
  loadFailureStatus: number | undefined;
  resourceErrors: string[];
  deviceCopies: RetainedDeviceCopy[];
  recoverDeviceCopy(draftId: string): Promise<boolean>;
  blockingReasons: PreparationReason[];
  preparing: boolean;
  serviceUnavailable?: boolean;
  submissions: PendingSubmission[];
  followupNotice: { kind: "choose-result" | "edit-unavailable"; requestId: string } | undefined;
  reload(): void;
  edit(content: DraftContent, typingGroup?: string): void;
  openDraft(record: CreationDraft): void;
  newDraft(action: CreationAction): Promise<void>;
  chooseProfile(profile: CapabilityProfile): void;
  /** The model chip's Auto: Make resolves it to one exact model. */
  chooseAuto(): void;
  /** Inputs the active draft's place cannot use: shown greyed and kept out of the request (Rule 4). */
  parkedInputs: DraftInput[];
  discardParkedInput(input: DraftInput): void;
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
  recover(submissionId: string): Promise<void>;
  resend(submissionId: string): Promise<void>;
  viewMedia(versionId: string): void;
  updateMedia(version: MediaVersion): void;
  bindImport(draftId: string, importId: string, kind?: "image" | "video" | "audio", role?: DraftInput["role"], replacing?: DraftInput): void;
  useMedia(version: MediaVersion): void;
  editMedia(version: MediaVersion): Promise<void>;
  /** A result's verb: the result joins the working request in the verb's role, keeping its words. A painted area stays only for Edit a region on the same picture. */
  bindResult(action: CreationAction, version: MediaVersion, role?: DraftInput["role"], options?: { keepArea?: boolean }): Promise<void>;
  undo(): void;
  redo(): void;
  copyConflict(draftId: string): Promise<void>;
  access(versionId: string): Promise<{ url: string; expiresAt?: string | undefined }>;
}

/** An owner-bound controller: media observation never writes the active composer. */
export interface WorkspaceAuthoringOptions {
  /** A library home starts in an unused conversation instead of the newest one. */
  library?: boolean;
  /** The named project a library home files new conversations into. */
  folderId?: string | undefined;
}

export function useWorkspaceAuthoring(ownerId: string, projectId: string, initialConversationId: string | undefined, initialDraftTargetId: string | undefined, options: WorkspaceAuthoringOptions, adapters: WorkspaceAdapters): ProjectWorkspaceController {
  const library = options.library === true;
  const folderId = library ? options.folderId : undefined;
  const api = adapters.server;
  const device = adapters.device;
  const [authoringView, dispatch] = useReducer(workspaceViewReducer, EMPTY_WORKSPACE_VIEW);
  const viewRef = useRef(authoringView);
  // The model last used for each action, so switching outputs never drops back to "Choose model".
  const rememberedSettings = useRef<Partial<Record<CreationAction, DraftContent["settings"]>>>({});
  // Per draft and output: Video → Music → Video brings back the same start frame, model and settings.
  const leftSetups = useRef(new Map<string, LeftSetup>());
  // Drafts this tab created; only these take Auto's starting values automatically, so a draft open in two tabs never races.
  const freshDraftIds = useRef(new Set<string>());
  // Inputs a switch set aside per draft; switching back restores them.
  const [parked, setParked] = useState<Record<string, DraftInput[]>>({});
  const parkedRef = useRef(parked);
  parkedRef.current = parked;
  const mounted = useRef(true);
  const scopeKey = `${ownerId}:${projectId}`;
  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;
  const inScope = useCallback((): boolean => mounted.current && scopeRef.current === scopeKey, [scopeKey]);
  const selection = useWorkspaceSelection({ scopeKey, initialConversationId, initialDraftId: initialDraftTargetId,
    opened: () => conversationRef.current,
    hasRequests: () => viewRef.current.requests.some(request => request.conversationId === conversationRef.current?.id),
    leave: reload => { emit({ type: "conversation" }); setPrepared(undefined); if (reload) setLoadVersion(version => version + 1); },
  });
  const requestedConversationId = selection.requestedId;
  const setRequestedConversationId = selection.request;
  const beginSelectionIntent = selection.begin;
  const { capture: captureSelection, targetDraftId, matchesTarget, clearTarget, isHome: selectionIsHome } = selection;
  const [project, setProject] = useState<Project>();
  const [conversation, setConversation] = useState<Conversation>();
  const [conversations, setConversations] = useState<ConversationListing[]>([]);
  const [media, setMedia] = useState<MediaVersion[]>([]);
  const [profiles, setProfiles] = useState<CapabilityProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [loadFailureStatus, setLoadFailureStatus] = useState<number>();
  const [resourceProblems, setResourceProblems] = useState<Partial<Record<WorkspaceResource, string>>>({});
  const resourceErrors = Object.values(resourceProblems).filter((problem): problem is string => problem !== undefined);
  const resourceProblem = useCallback((resource: WorkspaceResource, problem: string | undefined): void => {
    setResourceProblems(previous => { const next = { ...previous }; if (problem === undefined) delete next[resource]; else next[resource] = problem; return next; });
  }, []);
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
  const [areaRemoval, setAreaRemoval] = useState<{ draftId: string; sequence: number }>();
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

  const { state: historyState, observe: observeHistory, reset: resetHistory, read: readHistory } = useRequestHistory({ ownerId, projectId, conversationId: conversation?.id, currentConversationId: () => conversationRef.current?.id, server: api, media, refreshMedia: () => refreshMedia(), report: problem => resourceProblem("updates", problem) });
  const view = { ...authoringView, ...historyState }; viewRef.current = view;
  const emit = useCallback((event: WorkspaceViewEvent): void => {
    if (event.type === "observe-requests") { viewRef.current = { ...viewRef.current, ...observeHistory(event.requests) }; return; }
    const history = event.type === "reset" || event.type === "conversation" ? resetHistory() : undefined;
    viewRef.current = { ...workspaceViewReducer(viewRef.current, event), ...(history ?? {}) }; dispatch(event);
  }, [observeHistory, resetHistory]);

  useEffect(() => {

    conversationRef.current = undefined; emit({ type: "reset" }); setProject(undefined); setConversation(undefined); setMedia([]); setPrepared(undefined); setSubmissions([]); setResourceProblems({}); setLocalErrors({}); setSaveErrors({}); setConflicts({});
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
    const selectionCurrent = captureSelection();
    const requestedDraftId = targetDraftId();
    void (async (): Promise<void> => {
      setLoading(true); setError(undefined); setLoadFailureStatus(undefined); setResourceProblems({});
      try {
        const owned = await api.getProject(projectId, abort.signal);
        if (owned.ownerId !== ownerId) throw new Error("The project belongs to a different account.");
        if (owned.id !== projectId) throw new Error("The project response has a different identity.");
        if (!abort.signal.aborted && inScope()) setProject(owned);
        const rows = await api.listConversations(projectId, abort.signal);
        if (rows.some(row => row.ownerId !== ownerId || row.projectId !== projectId)) throw new Error("The conversation list does not belong to this project and account.");
        let chosen: ConversationListing | undefined = requestedConversationId ? rows.find(row => row.id === requestedConversationId) : library ? unusedConversation(rows, folderId) : rows.find(row => row.status === "active") ?? rows[0];
        // An exact target is read independently of browsing; a failed target never opens somebody else's default work.
        if (requestedConversationId && !chosen) {
          chosen = await api.getConversation(projectId, requestedConversationId, abort.signal);
          rows.push(chosen);
        }
        if (!chosen && library && owned.status === "active") {
          // Reusing an unused conversation keeps repeat visits from piling up empty rows.
          const created = await api.createConversation(projectId, id("conversation"), DEFAULT_CONVERSATION_NAME, folderId);
          if (created.ownerId !== ownerId || created.projectId !== projectId || created.folderId !== folderId) throw new Error("The conversation does not belong to this library and account.");
          rows.push(created); chosen = created;
        }
        if (abort.signal.aborted || !inScope()) return;
        conversationRef.current = chosen; setProject(owned); setConversations(rows); setConversation(chosen);
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
            if (requestedDraftId && (!open || !matchesTarget(chosen.id))) setError("This retained request is unavailable in the opened conversation. Review its history or choose another request.");
            else if (buffer && !viewRef.current.activeDraftId) { emit({ type: "open-draft", buffer }); if (requestedDraftId) clearTarget(); }
          }
          try {
            const copies = await device.list(ownerId, projectId);
            const { recoverable, settled } = sortDeviceCopies(copies, ownedDrafts, chosen.id);
            if (!abort.signal.aborted && inScope()) setDeviceCopies(recoverable);
            for (const copy of settled) void device.remove(ownerId, projectId, copy.draftId).catch(() => undefined);
          } catch (failure) { if (!abort.signal.aborted && inScope()) resourceProblem("recovery", `Device recovery copies could not load. ${message(failure)}`); }
          try {
            const history = await readHistory(chosen.id, abort.signal);
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
              } catch (failure) { if (!abort.signal.aborted && inScope() && selectionCurrent()) resourceProblem("drafts", `The empty request could not open. Retry loading. ${message(failure)}`); }
            }
          } catch (failure) { if (!abort.signal.aborted && inScope()) resourceProblem("history", `History could not load. ${message(failure)}`); }
        }
        const auxiliary = await Promise.allSettled([api.profiles(abort.signal), api.media(projectId, abort.signal), device.submissions(ownerId)]);
        if (abort.signal.aborted || !inScope()) return;
        if (auxiliary[0]?.status === "fulfilled") setProfiles(auxiliary[0].value);
        if (auxiliary[1]?.status === "fulfilled") setMedia(auxiliary[1].value);
        if (auxiliary[2]?.status === "fulfilled") setSubmissions(auxiliary[2].value.filter(item => item.projectId === projectId && item.state === "unknown"));
        auxiliary.forEach((result, index) => { if (result.status === "rejected") resourceProblem((["models", "media", "recovery"] as const)[index] ?? "recovery", `${["Models", "Media", "Unconfirmed requests"][index]} could not load. ${message(result.reason)}`); });
      } catch (failure) { if (!abort.signal.aborted && inScope() && selectionCurrent()) { setError(message(failure)); setLoadFailureStatus(failure instanceof Error && "status" in failure && typeof failure.status === "number" ? failure.status : typeof navigator !== "undefined" && navigator.onLine === false || failure instanceof TypeError ? 0 : 502); } }
      finally { if (!abort.signal.aborted && inScope()) setLoading(false); }
    })();
    return () => { abort.abort(); mounted.current = false; };
  }, [api, device, emit, folderId, inScope, library, loadVersion, ownerId, projectId, requestedConversationId, scopeKey, resourceProblem, readHistory, captureSelection, targetDraftId, matchesTarget, clearTarget]);

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
  const activeView = useMemo(() => active ? authoringDraft(active, { device: localErrors[active.record.id], server: saveErrors[active.record.id] }) : undefined, [active, localErrors, saveErrors]);
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
    const currentIntent = (): boolean => inScope() && intent() && conversationRef.current?.id === conversation.id;
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
    if (!buffer || !placeActions(buffer.content.action).includes(profile.action)) return;
    edit({ ...buffer.content, action: profile.action, settings: settingsForProfile(profile, buffer.content, profiles.find(candidate => candidate.id === buffer.content.settings.profileId)) });
  }, [edit, profiles]);

  const chooseAuto = useCallback((): void => {
    const draftId = viewRef.current.activeDraftId;
    const buffer = draftId ? viewRef.current.drafts[draftId] : undefined;
    if (!buffer || buffer.content.settings.profileId === "unselected") return;
    edit({ ...buffer.content, settings: autoSettings(buffer.content, buffer.content.action, profiles, mediaRef.current) });
  }, [edit, profiles]);

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
    if (!draftId || !initial || initial.record.ownerId !== ownerId || initial.record.projectId !== projectId || !["open", "parked"].includes(initial.record.status) || making.current.has(draftId) || submitting.current.has(draftId)) return;
    making.current.add(draftId); setPreparing(true); setError(undefined); setServiceUnavailable(false);
    if (initial.content.settings.profileId === "unselected") {
      // Auto becomes one exact model before preparation, so the request records the model that made it.
      const chosen = resolveAuto(initial.content, profiles, mediaRef.current);
      if (chosen) edit({ ...initial.content, action: chosen.action, settings: settingsForProfile(chosen, initial.content) });
    }
    const sequence = viewRef.current.drafts[draftId]?.sequence ?? initial.sequence;
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
  }, [api, edit, flushId, inScope, ownerId, profiles, projectId, submitPrepared]);

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
    const draftKey = buffer.record.id;
    const held = parkedRef.current[draftKey] ?? [];
    const leaving = buffer.content;
    leftSetups.current.set(`${draftKey}:${placeOf(leaving.action)}`, { action: leaving.action, settings: leaving.settings, roles: new Map(leaving.inputs.map(input => [inputKey(input), input.role])) });
    const back = leftSetups.current.get(`${draftKey}:${placeOf(action)}`);
    // Returning to an output resumes the action it was left on (a start frame keeps Animate), and each input its role there.
    const target = back && placeActions(action).includes(back.action) ? back.action : action;
    const restored = [...leaving.inputs, ...held].map(input => { const role = back?.roles.get(inputKey(input)); return role && role !== input.role ? { ...input, role } : input; });
    const moved = inputsForAction(restored, target, profiles, mediaRef.current, viewRef.current.requests);
    setParked(current => ({ ...current, [draftKey]: moved.parked }));
    const next = { ...leaving, action: target, inputs: moved.inputs };
    edit(settleModel({ ...next, settings: settingsForOutput(next, target, profiles, back ? back.settings : rememberedSettings.current[target], mediaRef.current) }, profiles));
  }, [edit, profiles]);

  /** Working words and settings stay (Rule 8): the result joins the open draft; only a missing draft starts a new one. */
  const bindResult = useCallback(async (action: CreationAction, version: MediaVersion, role: DraftInput["role"] = actionEntry(action).verb?.role ?? "primary", options: { keepArea?: boolean } = {}): Promise<void> => {
    if (!project || !conversation || version.ownerId !== ownerId || version.projectId !== projectId) return;
    const draftId = viewRef.current.activeDraftId;
    const buffer = draftId ? viewRef.current.drafts[draftId] : undefined;
    if (buffer && ["open", "parked"].includes(buffer.record.status)) {
      if (buffer.content.settings.profileId !== "unselected" && action !== buffer.content.action) rememberedSettings.current[buffer.content.action] = buffer.content.settings;
      const draftKey = buffer.record.id;
      const current = [...buffer.content.inputs, ...(parkedRef.current[draftKey] ?? [])];
      // An area belongs to its exact picture: any other verb, or another picture, makes a whole-picture request.
      const keepArea = options.keepArea === true && current.some(input => input.role === "primary" && input.state === "resolved" && input.versionId === version.id);
      const moved = inputsWithResult(keepArea ? current : current.filter(input => input.role !== "mask"), action, version.id, role, profiles, mediaRef.current, viewRef.current.requests);
      setParked(current => ({ ...current, [draftKey]: moved.parked }));
      const next = { ...buffer.content, action, inputs: moved.inputs };
      const settings = action === buffer.content.action ? buffer.content.settings : settingsForOutput(next, action, profiles, rememberedSettings.current[action], mediaRef.current);
      edit(settleModel({ ...next, settings }, profiles));
      const changed = viewRef.current.drafts[draftKey];
      if (buffer.content.inputs.some(input => input.role === "mask") && changed && changed.sequence !== buffer.sequence && !changed.content.inputs.some(input => input.role === "mask")) setAreaRemoval({ draftId: draftKey, sequence: changed.sequence });
      return;
    }
    try {
      const bound = mediaActionDraftContent(action, version.id, project.id, conversation.id, project.instructions.revision, role);
      const record = await api.createDraft(projectId, conversation.id, id("draft"), { ...bound, settings: settingsForOutput(bound, action, profiles, rememberedSettings.current[action], mediaRef.current) });
      if (inScope() && record.ownerId === ownerId && record.projectId === projectId && conversationRef.current?.id === record.conversationId) { emit({ type: "open-draft", buffer: openDraftBuffer(record) }); setPrepared(undefined); }
    } catch (failure) { if (inScope()) setError(message(failure)); }
  }, [api, conversation, edit, emit, inScope, ownerId, profiles, project, projectId]);

  /**
   * One grant per version until shortly before it expires: switching outputs or verbs remounts the same
   * tiles, which would otherwise fetch the same version's grant again each time.
   */
  const grants = useRef(new Map<string, Promise<{ url: string; expiresAt?: string | undefined }>>());
  const access = useCallback((versionId: string): Promise<{ url: string; expiresAt?: string | undefined }> => {
    const cached = grants.current.get(versionId);
    if (cached) return cached;
    const grant = api.access(projectId, versionId).then(result => {
      const expires = result.expiresAt ? Date.parse(result.expiresAt) - Date.now() - 60_000 : 5 * 60_000;
      if (expires > 0) setTimeout(() => { if (grants.current.get(versionId) === grant) grants.current.delete(versionId); }, expires); else grants.current.delete(versionId);
      return result;
    }, (failure: unknown) => { grants.current.delete(versionId); throw failure; });
    grants.current.set(versionId, grant);
    return grant;
  }, [api, projectId]);

  const activeDraftId = view.activeDraftId;
  const activeNeedsModel = activeDraftId ? view.drafts[activeDraftId]?.content.settings.profileId === "unselected" : false;
  // A composer never waits on "Choose model": a draft this tab created starts on Auto's values (or the action's last model) once models load.
  useEffect(() => {
    if (!activeDraftId || !activeNeedsModel || !profiles.length || !freshDraftIds.current.has(activeDraftId)) return;
    const buffer = viewRef.current.drafts[activeDraftId];
    if (!buffer || Object.keys(buffer.content.settings.parameters).length) return;
    freshDraftIds.current.delete(activeDraftId);
    const settings = settingsForOutput(buffer.content, buffer.content.action, profiles, rememberedSettings.current[buffer.content.action], mediaRef.current);
    if (canonicalJson(settings) !== canonicalJson(buffer.content.settings)) edit({ ...buffer.content, settings });
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
      if (!inScope() || !intent()) return;
      const buffer = draftId ? viewRef.current.drafts[draftId] : undefined;
      if (buffer && !draftHasSafeRetention(buffer)) { setError("Keep a copy of your unfinished words before changing conversations."); return; }
      emit({ type: "conversation" }); setPrepared(undefined); setRequestedConversationId(chosen.id);
    } finally { conversationOperation.current = false; }
  }, [beginSelectionIntent, conversations, emit, flushId, inScope, ownerId, projectId, setRequestedConversationId]);

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
    const currentSelection = (): boolean => inScope() && intent() && viewRef.current.activeDraftId === priorId && conversationRef.current?.id === priorConversation && (!priorId || viewRef.current.drafts[priorId]?.sequence === priorSequence);
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
      conversationRef.current = chosen; setConversation(chosen); setRequestedConversationId(chosen.id); setPrepared(undefined);
      emit({ type: "observe-requests", requests: history });
      emit({ type: "open-draft", buffer: selected });
    } finally { conversationOperation.current = false; }
  }, [api, beginSelectionIntent, conversations, device, emit, flushId, inScope, ownerId, projectId, setRequestedConversationId]);

  const newConversation = useCallback(async (): Promise<void> => {
    if (!project || project.status !== "active" || conversationOperation.current) return;
    conversationOperation.current = true;
    const intent = beginSelectionIntent();
    try {
      const draftId = viewRef.current.activeDraftId;
      if (draftId) await flushId(draftId);
      const buffer = draftId ? viewRef.current.drafts[draftId] : undefined;
      if (!inScope() || !intent()) return;
      if (buffer && !draftHasSafeRetention(buffer)) { setError("Keep a copy of your unfinished words before starting a conversation."); return; }
      const record = await api.createConversation(projectId, id("conversation"), DEFAULT_CONVERSATION_NAME);
      if (!inScope() || !intent() || record.ownerId !== ownerId || record.projectId !== projectId) return;
      emit({ type: "conversation" }); setConversations(rows => [...rows, record]); setPrepared(undefined); setRequestedConversationId(record.id);
    } catch (failure) { if (inScope() && intent()) setError(message(failure)); }
    finally { conversationOperation.current = false; }
  }, [api, beginSelectionIntent, emit, flushId, inScope, ownerId, project, projectId, setRequestedConversationId]);

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

  const applyMediaInputRef = useRef(applyMediaInput); applyMediaInputRef.current = applyMediaInput;
  const frameIntents = useRef(new Map<string, string>());
  const captureFrame = useCallback(async (source: MediaVersion, seconds: number): Promise<CapturedFrame | undefined> => {
    if (source.ownerId !== ownerId || source.projectId !== projectId) return undefined;
    const draftId = viewRef.current.activeDraftId;
    const target = draftId ? viewRef.current.drafts[draftId] : undefined;
    const conversationId = conversationRef.current?.id;
    const key = `${ownerId}:${projectId}:${source.id}:${seconds}`;
    const identity = frameIntents.current.get(key) ?? id("version"); frameIntents.current.set(key, identity);
    const version = await adapters.frames.frame(source.id, identity, seconds);
    if (!inScope()) return undefined;
    mediaEpoch.current += 1; mediaRef.current = [...mediaRef.current.filter(row => row.id !== version.id), version]; setMedia(mediaRef.current);
    const current = viewRef.current.activeDraftId ? viewRef.current.drafts[viewRef.current.activeDraftId] : undefined;
    if (target && current?.record.id === target.record.id && conversationRef.current?.id === conversationId && conversationId) {
      if (current.sequence === target.sequence) applyMediaInputRef.current(version);
      return { version, target: { conversationId, draftId: target.record.id } };
    }
    return { version };
  }, [adapters, inScope, ownerId, projectId]);

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

  const restoring = useRef(false);
  const retainAndCopy = useCallback(async (content: (current: DraftContent | undefined, conversation: Conversation) => DraftContent): Promise<CreationDraft | undefined> => {
    if (restoring.current) return undefined;
    const conversation = conversationRef.current;
    const draftId = viewRef.current.activeDraftId;
    const captured = draftId ? viewRef.current.drafts[draftId] : undefined;
    if (!conversation) return undefined;
    const intent = beginSelectionIntent();
    const current = (): boolean => intent() && inScope() && conversationRef.current?.id === conversation.id && viewRef.current.activeDraftId === draftId && (!captured || viewRef.current.drafts[captured.record.id]?.sequence === captured.sequence);
    restoring.current = true;
    try {
      await Promise.all(Object.values(viewRef.current.drafts).filter(buffer => buffer.acknowledgedSequence !== buffer.sequence).map(buffer => flushId(buffer.record.id)));
      if (!current() || !Object.values(viewRef.current.drafts).every(draftHasSafeRetention)) return undefined;
      const record = await api.createDraft(projectId, conversation.id, id("draft"), content(captured?.content, conversation));
      if (!current()) return undefined;
      emit({ type: "open-draft", buffer: openDraftBuffer(record) }); setPrepared(undefined); return record;
    } finally { restoring.current = false; }
  }, [api, beginSelectionIntent, emit, flushId, inScope, projectId]);

  const restoreWords = useCallback(async (request: AcceptedRequest, mode: "setup" | "variation" | "words"): Promise<{ draftId: string; resultId: string | undefined } | undefined> => {
    if (request.ownerId !== ownerId || request.projectId !== projectId) return undefined;
    const record = await retainAndCopy((current, conversation) => mode === "words"
      ? { ...(current ?? request.snapshot), instructions: request.snapshot.instructions, destination: { projectId: ProjectIdSchema.parse(projectId), conversationId: conversation.id } }
      : reuseDraftContent(request, conversation.projectId, conversation.id, mode === "variation"));
    return record ? { draftId: record.id, resultId: request.slots.find(slot => slot.versionId === viewRef.current.viewedVersionId)?.versionId ?? request.slots.find(slot => slot.versionId && mediaRef.current.some(version => version.id === slot.versionId))?.versionId } : undefined;
  }, [ownerId, projectId, retainAndCopy]);

  const finishArea = useCallback(async (source: MediaVersion, mask: ProjectAreaMask | undefined): Promise<MediaVersion | undefined> => {
    const draftId = viewRef.current.activeDraftId;
    const captured = draftId ? viewRef.current.drafts[draftId] : undefined;
    const primary = captured?.content.inputs.find(input => input.role === "primary");
    if (!captured || primary?.state !== "resolved" || primary.versionId !== source.id) throw new Error("This picture is no longer the one being edited. Choose Edit a region again.");
    if (!mask) { const bound = captured.content.inputs.find(input => input.role === "mask"); if (bound) edit(withoutDraftInput(captured.content, profiles, bound)); return undefined; }
    const version = await adapters.saveAreaMask(ownerId, projectId, mask);
    if (!inScope()) return undefined;
    mediaEpoch.current += 1;
    mediaRef.current = [...mediaRef.current.filter(row => row.id !== version.id), version]; setMedia(mediaRef.current);
    // An arriving save remains media, but may not edit a different or independently changed draft.
    if (viewRef.current.activeDraftId === captured.record.id && viewRef.current.drafts[captured.record.id]?.sequence === captured.sequence) applyMediaInputRef.current(version, "mask");
    return version;
  }, [adapters, edit, inScope, ownerId, profiles, projectId]);

  const changeHistory = useCallback((direction: "undo" | "redo"): void => { const draftId = viewRef.current.activeDraftId; const current = draftId ? viewRef.current.drafts[draftId] : undefined; if (!current) return; const buffer = direction === "undo" ? undoDraftBuffer(current) : redoDraftBuffer(current); emit({ type: "update-buffer", buffer }); setPrepared(undefined); void checkpoint(buffer); }, [checkpoint, emit]);

  const resourceState = (resource: WorkspaceResource): ProjectWorkspaceController["resources"][WorkspaceResource] => ({ state: resourceProblems[resource] ? "error" : loading ? "loading" : "ready", message: resourceProblems[resource] });

  return {
    view: { requests: view.requests, viewedVersionId: view.viewedVersionId, timelineVisible: view.timelineVisible, historyProblem: view.historyProblem },
    conversationHasWork: Boolean(conversation && (view.requests.some(request => request.conversationId === conversation.id) || submissions.some(item => view.drafts[item.command.draftId]?.record.conversationId === conversation.id))),
    project, conversation, conversations, media, profiles, active: activeView, loading, error, loadFailureStatus, resourceErrors,
    resources: { models: resourceState("models"), media: resourceState("media"), history: resourceState("history"), recovery: resourceState("recovery"), drafts: resourceState("drafts"), updates: resourceState("updates") },
    areaDropped: Boolean(active && areaRemoval?.draftId === active.record.id && areaRemoval.sequence === active.sequence && !active.content.inputs.some(input => input.role === "mask")), captureFrame,
    reuseSetup: (request, variation = false) => restoreWords(request, variation ? "variation" : "setup"), useWords: async request => { await restoreWords(request, "words"); }, finishArea, deviceCopies: deviceCopies.map(copy => ({ draftId: copy.draftId, instructions: copy.content.instructions, updatedAt: copy.updatedAt })), blockingReasons: prepared?.state === "blocked" ? prepared.reasons : [], preparing, serviceUnavailable, submissions: submissions.map(item => ({ submissionId: item.submissionId, draftId: item.command.draftId, draftRevision: item.command.draftRevision, canResend: resendableSubmissions.includes(item.submissionId) })),
    followupNotice: followupNotice?.draftId === active?.record.id && !active?.content.inputs.length ? followupNotice : undefined,
    recoverDeviceCopy: async draftId => {
      const copy = deviceCopies.find(item => item.draftId === draftId);
      if (!copy || copy.ownerId !== ownerId || copy.projectId !== projectId) return false;
      return Boolean(await retainAndCopy((_current, conversation) => ({ ...copy.content, destination: { projectId: ProjectIdSchema.parse(projectId), conversationId: conversation.id } })));
    },
    reload: () => { setServiceUnavailable(false); setLoadVersion(version => version + 1); }, edit, openDraft: record => { if (record.ownerId !== ownerId || record.projectId !== projectId || record.conversationId !== conversationRef.current?.id) return; beginSelectionIntent(); emit({ type: "open-draft", buffer: viewRef.current.drafts[record.id] ?? openDraftBuffer(record) }); setPrepared(undefined); }, newDraft, chooseProfile, chooseAuto,
    parkedInputs: active ? parked[active.record.id] ?? [] : [],
    discardParkedInput: input => { const draftId = viewRef.current.activeDraftId; if (draftId) setParked(current => ({ ...current, [draftId]: (current[draftId] ?? []).filter(candidate => candidate !== input) })); },
    flush: async () => (await Promise.all(Object.values(viewRef.current.drafts).filter(buffer => buffer.acknowledgedSequence !== buffer.sequence).map(buffer => flushId(buffer.record.id)))).every(Boolean), prepare, submit, make, refreshMedia, changeAction, newConversation, openConversation, openConversationDraft, requestCancel, retryRequest, applyText, applyMediaInput,
    recover: async submissionId => { const item = submissions.find(row => row.submissionId === submissionId); if (item) await recover(item); },
    resend: async submissionId => { const item = submissions.find(row => row.submissionId === submissionId); if (item) await resend(item); },
    observeProject: record => { if (!inScope() || record.ownerId !== ownerId || record.id !== projectId) return; setProject(current => !current || record.revision >= current.revision ? record : current); },
    observeConversation: record => {
      if (!inScope() || record.ownerId !== ownerId || record.projectId !== projectId) return;
      setConversations(rows => { const current = rows.find(row => row.id === record.id); return current && current.revision > record.revision ? rows : [...rows.filter(row => row.id !== record.id), current?.media ? { ...record, media: current.media } : record]; });
      setConversation(current => current?.id === record.id && record.revision >= current.revision ? record : current);
      // A library home's own conversation archived elsewhere: home moves to another unused one instead of turning read only.
      const open = conversationRef.current;
      if (library && selectionIsHome() && open?.id === record.id && record.status === "archived" && record.revision >= open.revision) {
        beginSelectionIntent();
        void Promise.all(Object.values(viewRef.current.drafts).filter(buffer => buffer.acknowledgedSequence !== buffer.sequence).map(buffer => flushId(buffer.record.id))).finally(() => {
          if (!inScope()) return;
          emit({ type: "conversation" }); setPrepared(undefined); setLoadVersion(version => version + 1);
        });
      }
    },
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
    editMedia: version => bindResult(version.kind === "image" ? "edit-image" : "edit-video", version),
    bindResult,
    copyConflict: async draftId => { const buffer = viewRef.current.drafts[draftId]; if (buffer) await retainAndCopy(() => buffer.content); },
    access,
  };
}
