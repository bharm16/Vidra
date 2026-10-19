import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams, useBlocker, useLocation } from "react-router-dom";
import { useAuthUser } from "@/hooks/useAuthUser";
import { FreshButton, FreshIconButton } from "@/components/fresh/FreshButton";
import { FreshRail, type FreshDestination } from "@/components/fresh/FreshRail";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@promptstudio/system/components/ui/dialog";
import { canonicalJson } from "@shared/workflow/canonicalJson";
import { WorkflowApi } from "./api/workflowApi";
import { MediaActionsApi } from "./api/mediaActionsApi";
import { useProjectWorkspace } from "./hooks/useProjectWorkspace";
import { useLibraryEntry } from "./hooks/useLibraryEntry";
import { GuestWorkspace } from "./GuestWorkspace";
import { PromptComposer, type PromptComposerProps } from "./components/PromptComposer";
import { ModelCreationArea, ModelInputActions, type CapabilityLookupStatus } from "./components/ModelCreationArea";
import { observedDraftInputs } from "./state/inputBinding";
import { modelCreationFeedback, modelInputLabel } from "./state/capabilitySettings";
import { MediaViewer } from "./components/MediaViewer";
import { ProjectManagementApi } from "@/features/project-management/api/projectManagementApi";
import { ConversationHome } from "@/features/project-management/ConversationHome";
import { BackgroundResultNotice, WorkspaceNotice } from "./components/WorkspaceNotice";
import { RequestResults } from "./components/RequestResults";
import { VersionsPanel } from "./components/VersionsPanel";
import { ConversationHistory } from "./components/ConversationHistory";
import { RequestDetails } from "./components/RequestDetails";
import { requestHistoryDescription } from "./state/requestDescription";
import { versionTree } from "./state/versionTree";
import { draftHasSafeRetention } from "./state/draftBuffer";
import { bindWorkspaceEntry, consumeCreatedWorkspaceEntry, createdWorkspaceState, readWorkspaceEntry, reopenWorkspaceState, workspaceEntryMatches, type WorkspaceEntryBinding, type WorkspaceEntryTicket } from "./state/workspaceEntry";
import { ProjectIdSchema } from "@shared/schemas/workflow/identity.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import type { AcceptedRequest } from "@shared/schemas/workflow/request.schemas";
import type { CreationAction, DraftInput } from "@shared/schemas/workflow/draft.schemas";
import type { ProjectAreaMask } from "@shared/schemas/workflow/sketch.schemas";
import { useProjectImports } from "@/features/project-imports/hooks/useProjectImports";
import { SavedImportSheet, isSavedImportVersion } from "@/features/project-imports/components/SavedImportSheet";
import { ProjectMediaLibrary } from "@/features/project-media/ProjectMediaLibrary";
import { ProjectMediaPicker } from "@/features/project-media/ProjectMediaPicker";
import { ProjectBrowser, ProjectManagementPanel } from "@/features/project-management";
import { VideoEditor } from "@/features/video-editor/VideoEditor";
import { ProjectSketch } from "@/features/project-sketch/ProjectSketch";
import { AreaEditPanel } from "@/features/project-sketch/AreaEditPanel";
import { SystemRoutePage } from "@/features/public-site/SystemPage";
import { ShareVersionPanel } from "@/features/workflow-sharing/ShareVersionPanel";
import { registerWorkspaceRetention } from "@/repositories/workflow/WorkspaceRetention";
import "./workspace.css";

type Panel = "none" | "recovery" | "options" | "leave" | "rename" | "area";
interface ResultFeedback { conversationId: string; draftId: string; versionId: string; kind: "setup" | "frame"; }
interface ScopedActionError { conversationId: string | undefined; draftId: string | undefined; message: string; }
function OwnedWorkspace({ ownerId, projectId, library = false }: { ownerId: string; projectId: string; library?: boolean }): ReactElement {
  const [search, setSearch] = useSearchParams();
  const location = useLocation();
  const navigationEntry = useMemo(() => readWorkspaceEntry(location.state, ownerId, projectId), [location.state, ownerId, projectId]);
  const initialEntry = useRef(navigationEntry);
  const [entryTicket, setEntryTicket] = useState<WorkspaceEntryTicket>();
  const [entryBinding, setEntryBinding] = useState<WorkspaceEntryBinding>();
  const handledEntry = useRef<string>();
  const controller = useProjectWorkspace(ownerId, projectId, search.get("conversation") ?? undefined, initialEntry.current?.draftId, { library });
  const imports = useProjectImports(ownerId, projectId, controller.updateMedia);
  const api = useMemo(() => new WorkflowApi(undefined, ownerId), [ownerId]);
  const mediaActions = useMemo(() => new MediaActionsApi(ownerId, projectId), [ownerId, projectId]);
  const navigate = useNavigate();
  const [panel, setPanel] = useState<Panel>("none");
  const [pane, setPane] = useState<"conversation" | "viewer">("conversation");
  const managementApi = useMemo(() => new ProjectManagementApi(ownerId), [ownerId]);
  const [inspectedRequest, setInspectedRequest] = useState<{ conversationId: string; requestId: string }>();
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [viewerOrigin, setViewerOrigin] = useState<"conversation" | "media">("conversation");
  const [sourceVersionIds, setSourceVersionIds] = useState<string[]>();
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const [readyNotice, setReadyNotice] = useState<{ conversationId: string; versionId: string }>();
  const [resultFeedback, setResultFeedback] = useState<ResultFeedback>();
  const newlyReadyVersionId = readyNotice?.conversationId === controller.conversation?.id ? readyNotice?.versionId : undefined;
  const readyConversation = useRef<string>();
  const seenResults = useRef(new Set<string>());
  const observedHistory = useRef(false);
  const [inspectingVideo, setInspectingVideo] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [actionFailure, setActionFailure] = useState<ScopedActionError>();
  const [shareVersion, setShareVersion] = useState<MediaVersion>();
  const [sharePlacement, setSharePlacement] = useState<"viewer" | "editor">("viewer");
  const [rename, setRename] = useState<{ version: MediaVersion; label: string }>();
  const [area, setArea] = useState<{ version: MediaVersion; url: string }>();
  const [inputRequest, setInputRequest] = useState<{ draftId: string; role: DraftInput["role"]; key: string; replacing?: DraftInput }>();
  const [masks, setMasks] = useState<Record<string, ProjectAreaMask>>({});
  const inspectedRequests = useRef(new Set<string>());
  const frameIntents = useRef(new Map<string, string>());
  const active = controller.active;
  const entryWorkingCopy = workspaceEntryMatches(entryBinding, active?.record);
  const actionError = actionFailure?.conversationId === controller.conversation?.id && actionFailure?.draftId === active?.record.id ? actionFailure?.message : undefined;
  const currentResultFeedback = resultFeedback?.conversationId === controller.conversation?.id && resultFeedback?.draftId === active?.record.id ? resultFeedback : undefined;
  const selected = controller.media.find(version => version.id === controller.view.viewedVersionId);
  const knownMediaLabels = useRef(new Map<string, string>());
  for (const version of controller.media) knownMediaLabels.current.set(version.id, version.label);
  const inspectedRequestId = inspectedRequest?.conversationId === controller.conversation?.id ? inspectedRequest?.requestId : undefined;
  const preferred = versionTree(controller.media, selected?.id).find(row => row.version.preferred)?.version.id;
  const view = search.get("view");
  const libraryOpen = view === "media";
  const savedImport = libraryOpen ? controller.media.find(version => version.id === search.get("savedImport") && isSavedImportVersion(version, ownerId, projectId)) : undefined;
  const inlineVideo = view === "video-workspace";
  const projectHome = view === "conversations";
  // The library opens on its conversations with a fresh composer, like P02 with no project selected.
  const libraryHome = library && !view && !search.get("conversation");
  const modelOpen = view === "model";
  const focusEditor = view === "video-focus";
  const editorOpen = focusEditor || view === "video" || search.get("intent") === "video-edit";
  const sketchOpen = view === "sketch" || search.get("intent") === "sketch";
  const hasMobilePreview = isMobile && pane === "conversation" && Boolean(selected) && !inlineVideo && !libraryOpen && panel !== "area" && !inspectedRequestId;
  const mobilePreviewKind = hasMobilePreview && selected ? selected.kind === "video" || selected.kind === "export" ? "clip" : !controller.view.requests.length && !controller.submissions.length ? "picture" : undefined : undefined;
  const controllerRef = useRef(controller); controllerRef.current = controller;
  const setActionError = useCallback((message: string | undefined): void => {
    const current = controllerRef.current;
    setActionFailure(message === undefined ? undefined : { conversationId: current.conversation?.id, draftId: current.active?.record.id, message });
  }, []);
  const consumeCreationTicket = useCallback((entryId: string | undefined): void => {
    if (!entryId) return;
    const consumed = consumeCreatedWorkspaceEntry(location.state, entryId);
    if (consumed.consumed) navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true, state: consumed.state, preventScrollReset: true });
  }, [location.hash, location.pathname, location.search, location.state, navigate]);
  const markReopenedConversation = (conversationId: string, draftId?: string): void => {
    const ticket = reopenWorkspaceState({ ownerId, projectId, conversationId, ...(draftId ? { draftId } : {}) }).workspaceEntry;
    handledEntry.current = ticket.entryId; setEntryBinding(undefined); setEntryTicket(ticket);
  };
  useEffect(() => {
    const state: unknown = location.state;
    if (state && typeof state === "object" && "workspaceEntry" in state && !navigationEntry) { setEntryBinding(undefined); setEntryTicket(undefined); return; }
    if (!navigationEntry || handledEntry.current === navigationEntry.entryId) return;
    handledEntry.current = navigationEntry.entryId; setEntryBinding(undefined); setEntryTicket(navigationEntry);
  }, [navigationEntry, location.state]);
  useEffect(() => {
    if (entryBinding && !entryWorkingCopy) setEntryBinding(undefined);
  }, [entryBinding, entryWorkingCopy]);
  useEffect(() => {
    const current = controllerRef.current;
    if (!entryTicket) return;
    if (current.loading) return;
    if (entryTicket.kind === "created") {
      setEntryBinding(current.conversation ? bindWorkspaceEntry(entryTicket, current.active?.record) : undefined);
      setEntryTicket(undefined); consumeCreationTicket(entryTicket.entryId);
      return;
    }
    if (!current.conversation || entryTicket.conversationId && entryTicket.conversationId !== current.conversation.id) return;
    const binding = bindWorkspaceEntry(entryTicket, current.active?.record);
    setEntryBinding(binding); setEntryTicket(undefined);
  }, [entryTicket, controller.loading, controller.conversation, active?.record, consumeCreationTicket]);
  const profile = controller.profiles.find(candidate => candidate.id === active?.content.settings.profileId && candidate.action === active?.content.action);
  const capabilityLookupStatus: CapabilityLookupStatus = controller.loading ? "loading" : controller.resourceErrors.some(problem => problem.startsWith("Models")) ? "error" : "ready";
  const failedInput = active?.content.inputs.find(input => input.state === "pending" && controller.view.requests.some(request => request.id === input.requestId && request.slots.some(slot => slot.id === input.slotId && (slot.outcome === "failed" || slot.outcome === "cancelled" || slot.delivery === "lost"))));
  const scopeAlive = useRef(true);
  useEffect(() => { scopeAlive.current = true; return () => { scopeAlive.current = false; }; }, []);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    const nextConversation = new URLSearchParams(nextLocation.search).get("conversation");
    const leaving = currentLocation.pathname !== nextLocation.pathname || new URLSearchParams(currentLocation.search).get("conversation") !== nextConversation;
    return leaving && !controllerRef.current.canLeave();
  });
  const blockerRef = useRef(blocker); blockerRef.current = blocker;
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    let cancelled = false;
    const retain = async (): Promise<void> => {
      await controllerRef.current.flush();
      if (cancelled || !scopeAlive.current || blockerRef.current.state !== "blocked") return;
      if (controllerRef.current.canLeave()) blockerRef.current.proceed();
      else setPanel("leave");
    };
    void retain().catch(failure => { if (!cancelled && scopeAlive.current) { setActionError(failure instanceof Error ? failure.message : "Saving could not be confirmed."); setPanel("leave"); } });
    return () => { cancelled = true; };
  }, [blocker, setActionError]);
  const keepEditing = (): void => { if (blockerRef.current.state === "blocked") blockerRef.current.reset(); setPanel("none"); };
  const retryLeaving = async (): Promise<void> => { await controllerRef.current.flush(); if (scopeAlive.current && controllerRef.current.canLeave() && blockerRef.current.state === "blocked") blockerRef.current.proceed(); };

  useEffect(() => registerWorkspaceRetention(ownerId, async () => { await controllerRef.current.flush(); return controllerRef.current.canLeave(); }), [ownerId]);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent): void => { if (active && !draftHasSafeRetention(active)) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", protect); return () => window.removeEventListener("beforeunload", protect);
  }, [active]);
  useEffect(() => {
    const query = window.matchMedia?.("(width < 768px)");
    if (!query) return;
    const update = (): void => setIsMobile(query.matches); update(); query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  useEffect(() => {
    const update = (): void => setOffline(!navigator.onLine);
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  useEffect(() => {
    const conversationId = controller.conversation?.id;
    if (readyConversation.current !== conversationId) { readyConversation.current = conversationId; seenResults.current.clear(); observedHistory.current = false; setReadyNotice(undefined); }
    if (controller.loading || !conversationId) return;
    const ready = controller.view.requests.flatMap(request => request.slots.filter(slot => slot.outcome === "completed" && slot.delivery === "ready" && slot.versionId).map(slot => slot.versionId ?? ""));
    if (observedHistory.current) {
      const latest = ready.filter(versionId => !seenResults.current.has(versionId)).at(-1);
      if (latest) setReadyNotice({ conversationId, versionId: latest });
    }
    ready.forEach(versionId => seenResults.current.add(versionId)); observedHistory.current = true;
  }, [controller.conversation?.id, controller.loading, controller.view.requests]);
  const showView = (next?: "media" | "video" | "sketch" | "conversations"): void => {
    const query = new URLSearchParams(search); query.delete("intent");
    if (next) query.set("view", next); else query.delete("view");
    setSearch(query, { replace: true });
  };
  const showConversation = async (id: string): Promise<void> => {
    await controller.openConversation(id);
    const current = controllerRef.current;
    if (current.canLeave()) { const next = new URLSearchParams(search); next.set("conversation", id); setSearch(next, { replace: true }); markReopenedConversation(id); }
  };
  const navigateSafely = async (target: string): Promise<void> => {
    await controller.flush();
    if (!scopeAlive.current) return;
    navigate(target);
  };
  const navigation = (target: FreshDestination): void => {
    if (target === "media") setSourceVersionIds(undefined);
    if (target === "media" || target === "video" || target === "sketch") { showView(target); return; }
    if (target === "projects") { if (library) void navigateSafely("/app/projects"); else showView("conversations"); return; }
    if (target === "create") { void perform(() => newDraft("make-image")); return; }
    void navigateSafely(target === "home" ? "/" : target === "help" ? "/docs" : "/account");
  };
  const perform = async (operation: () => Promise<void>): Promise<void> => {
    const origin = controllerRef.current;
    const conversationId = origin.conversation?.id;
    const draftId = origin.active?.record.id;
    setActionError(undefined);
    try { await operation(); }
    catch (failure) {
      const current = controllerRef.current;
      if (scopeAlive.current && current.conversation?.id === conversationId && current.active?.record.id === draftId) setActionError(failure instanceof Error ? failure.message : "This action was not confirmed. Try again.");
    }
  };
  const reuseRequest = async (request: AcceptedRequest, variation = false): Promise<void> => {
    const current = controllerRef.current;
    const captured = current.active;
    if (!current.conversation || request.ownerId !== ownerId || request.projectId !== projectId) return;
    const conversationId = current.conversation.id;
    const stillCurrent = (): boolean => scopeAlive.current && controllerRef.current.conversation?.id === conversationId && controllerRef.current.active?.record.id === captured?.record.id && controllerRef.current.active?.sequence === captured?.sequence;
    await current.flush();
    if (!stillCurrent() || !current.canLeave()) return;
    const parameters = { ...request.snapshot.settings.parameters };
    if (variation) delete parameters.seed;
    const record = await api.createDraft(projectId, conversationId, `draft_${crypto.randomUUID()}`, { ...request.snapshot, settings: { ...request.snapshot.settings, parameters }, destination: { projectId: current.conversation.projectId, conversationId } });
    if (stillCurrent()) {
      controllerRef.current.openDraft(record);
      const resultId = request.slots.find(slot => slot.versionId === current.view.viewedVersionId)?.versionId ?? request.slots.find(slot => slot.versionId && current.media.some(version => version.id === slot.versionId && version.ownerId === ownerId && version.projectId === projectId))?.versionId;
      if (!variation && resultId) setResultFeedback({ conversationId, draftId: record.id, versionId: resultId, kind: "setup" });
    }
  };
  const reuse = (version: MediaVersion): void => { if (version.origin.kind !== "generated") return; const requestId = version.origin.requestId; const request = controller.view.requests.find(candidate => candidate.id === requestId); if (request) void perform(() => reuseRequest(request)); };
  const change = (version: MediaVersion, patch: { label?: string; hidden?: boolean; favorite?: boolean }): void => { void perform(async () => { const updated = await mediaActions.change(version.id, patch); if (scopeAlive.current) controller.updateMedia(updated); }); };
  const makePreferred = (version: MediaVersion): void => { void perform(async () => { const rows = await mediaActions.preferred(version.id); if (scopeAlive.current) rows.forEach(controller.updateMedia); }); };
  const useFrame = (version: MediaVersion, timestamp: number): void => {
    const target = controller.active;
    const conversationId = controller.conversation?.id;
    void perform(async () => {
      const key = `${version.id}:${timestamp}`; const id = frameIntents.current.get(key) ?? `version_${crypto.randomUUID()}`; frameIntents.current.set(key, id);
      const captured = await mediaActions.frame(version.id, id, timestamp);
      if (!scopeAlive.current) return;
      controller.updateMedia(captured);
      const current = controllerRef.current.active;
      if (target && current?.record.id === target.record.id && controllerRef.current.conversation?.id === conversationId) {
        if (current.sequence === target.sequence) controllerRef.current.applyMediaInput(captured);
        if (conversationId) setResultFeedback({ conversationId, draftId: target.record.id, versionId: captured.id, kind: "frame" });
      }
    });
  };
  const download = (version: MediaVersion): void => { void perform(async () => { const grant = await mediaActions.download(version.id); if (!scopeAlive.current) return; const link = document.createElement("a"); link.href = grant.url; link.download = version.label; link.rel = "noreferrer"; link.click(); }); };
  const newDraft = async (action: CreationAction): Promise<void> => { consumeCreationTicket(entryTicket?.entryId ?? entryBinding?.entryId ?? navigationEntry?.entryId); setEntryTicket(undefined); setEntryBinding(binding => binding?.kind === "created" ? undefined : binding); await controller.newDraft(action); if (scopeAlive.current) { showView(); setPanel("none"); setPane("conversation"); setViewerOrigin("conversation"); } };
  const edit = (version: MediaVersion): void => { void perform(async () => { await controller.editMedia(version); if (scopeAlive.current) { showView(); setPane("conversation"); setViewerOrigin("conversation"); } }); };
  const animate = (version: MediaVersion): void => {
    const target = controller.active; const conversation = controller.conversation; const project = controller.project;
    if (!conversation || !project) return;
    void perform(async () => {
      await controller.flush();
      const record = await api.createDraft(projectId, conversation.id, `draft_${crypto.randomUUID()}`, { action: "animate-image", instructions: "", inputs: [{ state: "resolved", role: "start-frame", versionId: version.id }], settings: { profileId: "unselected", profileRevision: "unresolved", parameters: {}, outputCount: 1 }, context: { origin: "empty", requestIds: [], projectInstructionsRevision: project.instructions.revision }, destination: { projectId: project.id, conversationId: conversation.id } });
      const current = controllerRef.current.active;
      if (scopeAlive.current && controllerRef.current.conversation?.id === conversation.id && current?.record.id === target?.record.id && current?.sequence === target?.sequence) { controllerRef.current.openDraft(record); showView(); setPane("conversation"); setViewerOrigin("conversation"); }
    });
  };
  const exportDraft = (): void => {
    if (!active) return;
    const blob = new Blob([JSON.stringify(active.content, null, 2)], { type: "application/json" });
    const uri = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = uri; link.download = "vidra-unfinished-request.json"; link.click(); setTimeout(() => URL.revokeObjectURL(uri), 60000);
  };
  const access = useCallback(async (versionId: string): Promise<{ url: string; expiresAt?: string }> => { const grant = await api.access(projectId, versionId); return { url: grant.url, ...(grant.expiresAt ? { expiresAt: grant.expiresAt } : {}) }; }, [api, projectId]);
  const renderRail = (current: "create" | "media" | "video" | "sketch" | "projects"): ReactElement => <FreshRail active={current} onNavigate={navigation} onProjectOptions={() => setPanel("options")} onRequest={() => { showView(); setPane("conversation"); setViewerOrigin("conversation"); }} mobile mobilePresentation={mobilePreviewKind === "clip" ? "labels" : "icons"} />;
  const [initialIntent, setInitialIntent] = useState(false);
  useEffect(() => {
    if (initialIntent || controller.loading || !controller.conversation) return;
    setInitialIntent(true);
    const intent = search.get("intent");
    if (intent === "make-image" || intent === "make-video") void perform(async () => { if (controller.active?.content.action !== intent || controller.active.content.instructions) await controller.newDraft(intent); const next = new URLSearchParams(search); next.delete("intent"); setSearch(next, { replace: true }); });
    // Only process the arriving deep-link intent once; normal draft changes remain deliberate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialIntent, controller.loading, controller.conversation?.id]);

  // Once something is made from the library home, that conversation is where its results live.
  const homeConversationId = controller.conversation?.id;
  const homeHasWork = homeConversationId !== undefined && (controller.view.requests.some(request => request.conversationId === homeConversationId) || controller.submissions.some(submission => controller.view.drafts[submission.command.draftId]?.record.conversationId === homeConversationId));
  useEffect(() => {
    if (!libraryHome || !homeHasWork || !homeConversationId) return;
    const next = new URLSearchParams(search); next.set("conversation", homeConversationId); setSearch(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryHome, homeHasWork, homeConversationId]);

  useEffect(() => {
    const requestId = search.get("request");
    if (!requestId || controller.loading || inspectedRequests.current.has(requestId) || controller.resourceErrors.some(problem => problem.startsWith("History"))) return;
    const request = controller.view.requests.find(row => row.id === requestId);
    inspectedRequests.current.add(requestId);
    if (!request) { setActionError("This request is unavailable in the selected conversation."); return; }
    const versionId = request.slots.find(slot => slot.versionId && controller.media.some(version => version.id === slot.versionId))?.versionId;
    if (request.slots.length > 1) { setInspectedRequest({ conversationId: request.conversationId, requestId: request.id }); if (inlineVideo) setInspectingVideo(true); }
    else if (versionId) { setInspectedRequest(undefined); controller.viewMedia(versionId); }
    setPane("viewer");
    requestAnimationFrame(() => document.getElementById(`vf-request-${requestId}`)?.scrollIntoView({ block: "nearest" }));
  }, [controller, inlineVideo, search, setActionError]);

  const requestInput = (role: DraftInput["role"], replacing?: DraftInput): void => {
    const current = controllerRef.current.active;
    if (current) setInputRequest({ draftId: current.record.id, role, key: crypto.randomUUID(), ...(replacing ? { replacing } : {}) });
  };
  const inputRequestKey = (input?: DraftInput): string | undefined => inputRequest && inputRequest.draftId === active?.record.id && (input ? inputRequest.replacing && canonicalJson(inputRequest.replacing) === canonicalJson(input) : !inputRequest.replacing) ? inputRequest.key : undefined;
  const renderPicker = (input?: DraftInput, trigger?: ReactNode, programmatic = false): ReactElement => {
    const targetDraftId = active?.record.id;
    const requestedRole = input?.role ?? (programmatic && inputRequest && inputRequest.draftId === targetDraftId && !inputRequest.replacing ? inputRequest.role : undefined);
    const version = input?.state === "resolved" ? controller.media.find(row => row.id === input.versionId) : undefined;
    const inputRule = profile?.inputs.find(rule => rule.role === requestedRole);
    const mediaKind = version?.kind === "video" || version?.kind === "export" || inputRule?.kinds.includes("video") && !inputRule.kinds.includes("image") || requestedRole === "clip" ? "video" : "image";
    return <ProjectMediaPicker {...(trigger ? { trigger } : {})} requestOpenKey={inputRequestKey(input)} selectedVersionId={input?.state === "resolved" ? input.versionId : undefined} selectedVersionLabel={version?.label ?? (input?.state === "resolved" ? knownMediaLabels.current.get(input.versionId) : undefined)} mediaKind={mediaKind} versions={controller.media} imports={imports} access={access} disabled={!active || !["open", "parked"].includes(active.record.status) || controller.project?.status !== "active" || controller.conversation?.status !== "active"} onImport={(id, kind) => { if (targetDraftId) controllerRef.current.bindImport(targetDraftId, id, kind, requestedRole, input); }} onChoose={chosen => { if (controllerRef.current.active?.record.id === targetDraftId) controllerRef.current.applyMediaInput(chosen, requestedRole, input); }} />;
  };
  const renderComposer = (options: Partial<Pick<PromptComposerProps, "mediaActions" | "settingsPresentation" | "capabilityLookupStatus" | "primaryLabel" | "inputLabel" | "submissionBlockedReason">> = {}): ReactElement => controller.loading && !active ? <p role="status">Opening request…</p> : <PromptComposer {...(active?.content.inputs.some(input => input.state === "resolved" && masks[input.versionId]) ? { submissionBlockedReason: "Area edits are unavailable for the current models." } : {})} onAreaEdit={() => {
    const input = active?.content.inputs.find(row => row.state === "resolved" && row.role === "primary");
    const version = input?.state === "resolved" ? controller.media.find(row => row.id === input.versionId) : selected;
    if (!version || version.kind !== "image") { showView("media"); return; }
    void perform(async () => { await controller.editMedia(version); const resource = await access(version.id); if (scopeAlive.current) { setArea({ version, url: resource.url }); setPanel("area"); setPane("viewer"); } });
  }} inputStatus={input => {
    if (modelOpen && input.state === "resolved" && profile) {
      const version = controller.media.find(row => row.id === input.versionId);
      const kind = version?.kind === "export" ? "video" : version?.kind;
      if (!kind || !profile.inputs.some(rule => rule.role === input.role && rule.kinds.some(allowed => allowed === kind))) return "unavailable";
    }
    if (input.state !== "importing") return undefined;
    if (controller.media.some(version => version.id === `version_${input.importId.slice(7)}`)) return undefined;
    const job = imports.jobs.find(row => row.id === input.importId);
    return job?.state === "uploading" ? "uploading" : "unavailable";
  }} controller={controller} onSubmit={async () => {
    if (active?.content.inputs.some(input => input.state === "resolved" && masks[input.versionId])) throw new Error("Area edits are unavailable for the current models. Clear the selection before making a whole-picture edit.");
    await controller.make();
  }} onActionChange={controller.changeAction} onSketch={() => showView("sketch")} onChooseInput={() => requestInput(failedInput?.role ?? "reference", failedInput)} inputControl={renderPicker()} offline={offline} renderInputPicker={(input, thumbnail) => renderPicker(input, <span className="vf-mask-input-wrap">{thumbnail}{input.state === "resolved" && masks[input.versionId] ? <span className="vf-input-area" style={{ maskImage: `url(${JSON.stringify(masks[input.versionId]?.dataUri)})` }} aria-label="Selected area" role="img" /> : null}</span>)} {...options} />;
  const renderEditor = (presentation: "full" | "embedded" | "focus"): ReactElement => <VideoEditor presentation={presentation} timelinePresentation={search.get("timeline") === "assembly" ? "assembly" : "labeled"} visible={presentation !== "embedded" || !inspectingVideo} {...(presentation === "embedded" && inspectingVideo ? { renderInspection: (timeline, timelineControl, exportControl) => renderViewer(timeline, timelineControl, exportControl), onInspectionEdit: () => setInspectingVideo(false) } : {})} initialMediaVersionId={search.get("addVersion") ?? undefined} onInitialMediaHandled={() => { const next = new URLSearchParams(search); next.delete("addVersion"); setSearch(next, { replace: true }); }} ownerId={ownerId} projectId={projectId} media={controller.media} resolveMediaAccess={access} importController={imports} onClose={() => showView()} onMediaRefresh={controller.refreshMedia} {...(search.get("edit") ? { initialEditId: search.get("edit") ?? "" } : {})} onShareExport={id => { setSharePlacement("editor"); const version = controllerRef.current.media.find(row => row.id === id); if (version) setShareVersion(version); else void perform(async () => { await controller.refreshMedia(); const saved = controllerRef.current.media.find(row => row.id === id); if (saved) setShareVersion(saved); else throw new Error("The exported clip has not appeared in Media yet. Refresh and try again."); }); }} onEditSelected={id => { const next = new URLSearchParams(search); if (next.get("edit") !== id) { next.set("edit", id); setSearch(next, { replace: true }); } }} />;
  const renderViewer = (timeline?: ReactNode, timelineControl?: ReactNode, inspectionActions?: ReactNode): ReactElement => {
    if (panel === "area" && area) return <div className="vf-area-viewer"><AreaEditPanel key={area.version.id} version={area.version} sourceUrl={area.url} {...(masks[area.version.id] ? { initialMask: masks[area.version.id] } : {})} onDone={mask => { setMasks(current => ({ ...current, [area.version.id]: mask })); setPanel("none"); }} /></div>;
    const batch = inspectedRequestId ? controller.view.requests.find(request => request.id === inspectedRequestId) : !selected ? controller.view.requests.at(-1) : undefined;
    if (batch && batch.slots.length > 1) return <RequestResults request={batch} media={controller.media} access={access} onView={id => { setInspectedRequest(undefined); controller.viewMedia(id); setPane("viewer"); }} onUseInput={controller.applyMediaInput} onRetry={(request, slot) => { void controller.retryRequest(request, slot); }} />;
    const selectedOrigin = selected?.origin;
    const sourceRequest = selectedOrigin?.kind === "generated" ? controller.view.requests.find(request => request.id === selectedOrigin.requestId && request.ownerId === ownerId && request.projectId === projectId && request.slots.some(slot => slot.versionId === selected?.id)) : undefined;
    const feedbackVersion = currentResultFeedback ? controller.media.find(version => version.id === currentResultFeedback.versionId && version.ownerId === ownerId && version.projectId === projectId) : undefined;
    const feedbackBanner = currentResultFeedback && feedbackVersion ? <BackgroundResultNotice {...(currentResultFeedback.kind === "setup" ? { message: "Setup copied to a new draft." } : {})} onView={() => {
      const current = controllerRef.current;
      if (current.conversation?.id !== currentResultFeedback.conversationId || current.active?.record.id !== currentResultFeedback.draftId) return;
      setInspectedRequest(undefined); setVersionsOpen(false); current.viewMedia(feedbackVersion.id); setPane("viewer"); setResultFeedback(undefined);
    }} /> : undefined;
    return <MediaViewer {...(inspectionActions ? { inspectionActions, onBackToEdit: () => setInspectingVideo(false) } : {})} {...(sourceRequest && selected ? { renderRequestDetails: (onClose: () => void) => <RequestDetails request={sourceRequest} result={selected} media={controller.media} profile={controller.profiles.find(candidate => candidate.id === sourceRequest.snapshot.settings.profileId && candidate.revision === sourceRequest.snapshot.settings.profileRevision)} projectName={controller.project?.name ?? "Project"} conversationName={controller.conversations.find(row => row.id === sourceRequest.conversationId)?.name ?? "Conversation"} readOnly={controller.project?.status !== "active" || controller.conversation?.status !== "active"} onReuse={request => { onClose(); void perform(() => reuseRequest(request)); }} onClose={onClose} /> } : {})} mobilePreview={Boolean(mobilePreviewKind)} onView={() => setPane("viewer")} onBack={() => { if (viewerOrigin === "media") showView("media"); else setPane("conversation"); }} banner={failedInput ? <WorkspaceNotice title="The image for this draft could not be made" message="Choose an input or reuse the original setup." actionLabel="Choose input" onAction={() => requestInput(failedInput.role, failedInput)} /> : controller.serviceUnavailable ? <WorkspaceNotice title="New requests are temporarily unavailable" message="The service is at capacity" actionLabel="Check again" onAction={controller.reload} /> : offline ? <WorkspaceNotice title="You are offline" message={active?.checkpointSequence === active?.sequence ? "Changes are saved on this device" : "Keep your latest work before leaving"} actionLabel="View history" onAction={() => showView("conversations")} /> : controller.conversation?.status === "archived" ? <WorkspaceNotice title="This conversation is archived" message="Restore it to make changes." actionLabel="Restore" onAction={() => { const conversation = controller.conversation; if (conversation) void perform(async () => { const updated = await managementApi.changeConversation(projectId, conversation.id, { expectedRevision: conversation.revision, status: "active" }); if (scopeAlive.current) controller.observeConversation(updated); }); }} /> : feedbackBanner ? feedbackBanner : newlyReadyVersionId && newlyReadyVersionId !== selected?.id ? <div className="vf-workspace-banner"><p>{controller.media.find(version => version.id === newlyReadyVersionId)?.label ?? "New version"} is ready.</p><FreshButton onClick={() => { setInspectedRequest(undefined); controller.viewMedia(newlyReadyVersionId); setPane("viewer"); }}>View result</FreshButton></div> : undefined} readOnly={controller.project?.status !== "active" || controller.conversation?.status !== "active"} timeline={timeline} timelineControl={timelineControl} {...(selected && masks[selected.id] ? { areaMask: { versionId: selected.id, dataUri: masks[selected.id]?.dataUri ?? "" } } : {})} version={selected} access={access} onUseInput={controller.applyMediaInput} onUseFrame={useFrame} onDownload={download} onReuseSetup={reuse} canReuseSetup={selected?.origin.kind === "generated" && controller.view.requests.some(request => request.id === (selected.origin.kind === "generated" ? selected.origin.requestId : ""))} onEdit={edit} onAnimate={animate} onAddToVideo={version => { setVersionsOpen(false); setInspectingVideo(false); const next = new URLSearchParams(search); next.delete("intent"); next.set("view", "video-workspace"); next.set("addVersion", version.id); setSearch(next, { replace: true }); }} onVersions={() => setVersionsOpen(true)} onPreferred={makePreferred} {...(preferred ? { preferredVersionId: preferred } : {})} onShare={version => { setSharePlacement("viewer"); setShareVersion(version); }} onHide={version => change(version, { hidden: !version.hidden })} onRename={version => { setRename({ version, label: version.label }); setPanel("rename"); }} onFavorite={version => change(version, { favorite: !version.favorite })} {...(selected?.favorite !== undefined ? { favorite: selected.favorite } : {})} onPictureTools={version => { void perform(async () => { const resource = await access(version.id); if (scopeAlive.current) { setArea({ version, url: resource.url }); setPanel("area"); } }); }} /> };
  const sharing = shareVersion ? <ShareVersionPanel ownerId={ownerId} projectId={projectId} version={shareVersion} placement={sharePlacement} onClose={() => setShareVersion(undefined)} /> : null;
  const options = panel === "options" && controller.project ? <ProjectManagementPanel ownerId={ownerId} project={controller.project} conversations={controller.conversations} onProjectChange={controller.observeProject} onConversationChange={controller.observeConversation} onOpenConversation={id => { void showConversation(id); }} onOpenDraft={record => { void perform(async () => { await controller.openConversationDraft(record); const current = controllerRef.current; if (current.conversation?.id === record.conversationId) { const next = new URLSearchParams(search); next.set("conversation", record.conversationId); setSearch(next, { replace: true }); markReopenedConversation(record.conversationId, record.id); } setPanel("none"); }); }} onShowConversations={() => showView("conversations")} onClose={() => setPanel("none")} /> : null;
  const workspaceDialog = <Dialog open={panel !== "none" && panel !== "options" && panel !== "area"} onOpenChange={open => { if (!open) keepEditing(); }}><DialogContent overlayClassName={panel === "leave" ? "vf-leave-backdrop" : ""} className={`vf vf-dialog${panel === "leave" ? " vf-leave-dialog" : ""}`} aria-describedby="workspace-panel-description"><DialogTitle>{panel === "recovery" ? "Recover your work" : panel === "rename" ? "Rename media" : panel === "area" ? "Paint an area" : "Keep this draft before leaving"}</DialogTitle><DialogDescription id="workspace-panel-description">{panel === "leave" ? <><span className="vf-leave-desktop-copy">Neither this device nor the server has saved your latest changes. Retry saving or export a copy before leaving.</span><span className="vf-leave-mobile-copy">Your latest changes are not saved on this device or the server. Retry saving or export a copy before leaving.</span></> : panel === "area" ? "Choose an area on this exact picture." : "Continue when you are ready."}</DialogDescription>

      {panel === "recovery" ? <div className="vf-draft-list">{controller.deviceCopies.length ? <h3>Device recovery copies</h3> : null}{controller.deviceCopies.map((copy, index) => <FreshButton key={`${copy.draftId}:${index}`} onClick={() => { void perform(async () => { await controller.recoverDeviceCopy(copy); setPanel("none"); }); }}>{copy.content.instructions || "Empty request"} · {new Date(copy.updatedAt).toLocaleTimeString()}</FreshButton>)}</div> : null}
      {panel === "rename" && rename ? <form onSubmit={event => { event.preventDefault(); void perform(async () => { const updated = await mediaActions.change(rename.version.id, { label: rename.label }); if (scopeAlive.current) { controller.updateMedia(updated); setPanel("none"); } }); }}><label htmlFor="media-rename">Name</label><input id="media-rename" className="vf-field" value={rename.label} maxLength={300} onChange={event => setRename({ ...rename, label: event.target.value })} /><FreshButton type="submit" tone="primary" disabled={!rename.label.trim()}>Save name</FreshButton></form> : null}

      {panel === "leave" ? <div className="vf-leave-actions"><FreshButton tone="primary" onClick={() => { void perform(retryLeaving); }}>Retry saving</FreshButton><FreshButton onClick={exportDraft}>Export draft</FreshButton><FreshButton tone="quiet" onClick={() => { if (blockerRef.current.state === "blocked") blockerRef.current.proceed(); }}>Discard and leave</FreshButton><FreshButton className="vf-leave-keep" tone="quiet" onClick={keepEditing}>Keep editing</FreshButton></div> : null}
      {actionError ? <p role="alert">{actionError}</p> : null}
    </DialogContent></Dialog>;
  if (!controller.project && !controller.loading && controller.loadFailureStatus !== undefined) return <SystemRoutePage state={controller.loadFailureStatus === 401 || controller.loadFailureStatus === 403 ? "denied" : controller.loadFailureStatus === 503 ? "unavailable" : controller.loadFailureStatus === 0 && !navigator.onLine ? "offline" : "load-error"} onRetry={controller.reload} />;
  if (modelOpen && active) {
    const modelContent = { ...active.content, inputs: observedDraftInputs(active.content.inputs, controller.media) };
    const notice = profile ? modelCreationFeedback(profile, modelContent, controller.media) : undefined;
    return <div className="vf vf-model-host">{renderRail("create")}<ModelCreationArea profile={profile} content={modelContent} media={controller.media} lookupStatus={capabilityLookupStatus} onRetry={controller.reload} onUseFrame={() => { const input = active.content.inputs.find(row => row.state === "resolved" && (row.role === "clip" || row.role === "primary")); const clip = input?.state === "resolved" ? controller.media.find(row => row.id === input.versionId) : undefined; if (clip) { setInspectedRequest(undefined); controller.viewMedia(clip.id); setPane("viewer"); showView(); } }} composer={renderComposer({ settingsPresentation: "model", capabilityLookupStatus, ...(profile?.output.kind === "video" ? { primaryLabel: "Make video" } : {}), inputLabel: (input, version) => modelInputLabel(input.role, profile, version), ...(notice?.tone === "warning" || notice?.tone === "danger" ? { submissionBlockedReason: notice.message } : {}), mediaActions: <><ModelInputActions profile={profile} inputs={active.content.inputs} lookupStatus={capabilityLookupStatus} disabled={controller.project?.status !== "active" || controller.conversation?.status !== "active" || !["open", "parked"].includes(active.record.status)} onChooseInput={requestInput} onSketch={() => showView("sketch")} /><span hidden>{renderPicker(undefined, undefined, true)}</span></> })} />{options}{sharing}{workspaceDialog}</div>;
  }
  if (projectHome) return <div className="vf vf-project-home-shell">{renderRail("projects")}<ConversationHome composer={renderComposer()} conversations={controller.conversations} onOpenConversation={id => { void perform(async () => { await controller.openConversation(id); if (controllerRef.current.canLeave()) { const next = new URLSearchParams(search); next.set("conversation", id); next.delete("view"); setSearch(next, { replace: true }); setPane("conversation"); markReopenedConversation(id); } }); }} />{options}{sharing}{workspaceDialog}</div>;
  if (sketchOpen) return <><ProjectSketch key={`${ownerId}:${projectId}`} ownerId={ownerId} projectId={projectId} projectName={controller.project?.name ?? "this project"} rail={renderRail("sketch")} onAccepted={controller.updateMedia} onClose={() => showView()} onUseAsInput={version => { controller.applyMediaInput(version); showView(); }} />{options}{sharing}{workspaceDialog}</>;
  if (editorOpen) return <div className="vf vf-editor-host" data-focus={focusEditor || undefined}>{renderRail("video")}<div className="vf-editor-body">{!focusEditor ? <header className="vf-editor-project-header"><FreshIconButton icon="folder" label="Project options" onClick={() => setPanel("options")} /><div className="vf-flex" /><FreshIconButton icon="more" label="More project options" onClick={() => setPanel("options")} /></header> : null}{renderEditor(focusEditor ? "focus" : "full")}</div>{options}{sharing}{workspaceDialog}</div>;
  if (libraryHome) return <div className="vf vf-project-home-shell">{renderRail("create")}<ConversationHome composer={renderComposer()} conversations={controller.conversations.filter(conversation => conversation.acceptanceSequence > 0)} onOpenConversation={id => { void showConversation(id); }} />{options}{sharing}{workspaceDialog}</div>;
  return <div className="vf vf-workspace" data-workspace-entry={entryWorkingCopy ? entryBinding?.kind : undefined} data-mobile-pane={pane} data-library={libraryOpen || undefined} data-area={panel === "area" || undefined} data-mobile-preview={mobilePreviewKind} data-versions={versionsOpen || undefined} data-empty={!libraryOpen && !inlineVideo && !controller.view.requests.length && !controller.submissions.length && !selected || undefined}>
    {renderRail(libraryOpen || selected && (viewerOrigin === "media" || isMobile && pane === "viewer") ? "media" : "create")}
    {libraryOpen ? <ProjectMediaLibrary ownerId={ownerId} projectId={projectId} versions={sourceVersionIds ? controller.media.filter(version => sourceVersionIds.includes(version.id)) : controller.media} imports={imports} onChange={controller.updateMedia} onOpen={version => { setInspectedRequest(undefined); setViewerOrigin("media"); controller.viewMedia(version.id); setPane("viewer"); showView(); }} onEdit={edit} onCreate={() => { void perform(() => newDraft("make-image")); }} readonly={controller.project?.status !== "active"} loading={controller.loading} loadError={controller.error ?? controller.resourceErrors.find(problem => problem.includes("Media"))} onReload={controller.reload} onProjects={() => { void navigateSafely("/app/projects"); }} onOptions={() => setPanel("options")} /> : null}
    <header className="vf-project-bar"><FreshIconButton icon="folder" label="Project options" onClick={() => setPanel("options")} /><div className="vf-flex" />{controller.view.requests.length || selected ? <FreshIconButton icon="more" label="More project options" onClick={() => setPanel("options")} /> : null}</header>
    <aside className="vf-conversation">
      {controller.loading ? <p className="vf-notice" role="status">Opening saved work…</p> : null}
      {controller.error ? <div className="vf-notice" role="status"><p>{controller.error}</p><FreshButton onClick={controller.reload}>Retry loading</FreshButton></div> : null}
      {actionError ? <div className="vf-notice" role="alert"><p>{actionError}</p><FreshButton tone="quiet" onClick={() => setActionError(undefined)}>Dismiss</FreshButton></div> : null}
      {controller.resourceErrors.length ? <div className="vf-notice" role="status">{controller.resourceErrors.map(problem => <p key={problem}>{problem}</p>)}<FreshButton onClick={controller.reload}>Retry loading missing work</FreshButton></div> : null}
      {controller.deviceCopies.length ? <FreshButton tone="quiet" onClick={() => setPanel("recovery")}>Review {controller.deviceCopies.length} retained device {controller.deviceCopies.length === 1 ? "copy" : "copies"}</FreshButton> : null}
      <ConversationHistory readOnly={controller.project?.status !== "active" || controller.conversation?.status !== "active"} onInspectRequest={request => { setInspectedRequest({ conversationId: request.conversationId, requestId: request.id }); if (inlineVideo) setInspectingVideo(true); setVersionsOpen(false); setPane("viewer"); }} requests={controller.view.requests} media={controller.media} selected={controller.view.viewedVersionId} pending={controller.submissions} access={access} onView={id => { setInspectedRequest(undefined); setViewerOrigin("conversation"); controller.viewMedia(id); setPane("viewer"); if (inlineVideo) setInspectingVideo(true); }} onRecover={submission => { void controller.recover(submission); }} onRetry={(request, slot) => { void controller.retryRequest(request, slot); }} onEditRequest={request => { void perform(() => reuseRequest(request)); }} onReuseSetup={request => { void perform(() => reuseRequest(request)); }} onApplyText={(request, text) => { void perform(() => controller.applyText(request, text)); }} {...(newlyReadyVersionId ? { newlyReadyVersionId } : {})} onNewVariation={request => { void perform(() => reuseRequest(request, true)); }} onUseWords={request => { void perform(async () => { const current = controllerRef.current.active; const conversation = controllerRef.current.conversation; if (!conversation) return; await controller.flush(); if (!scopeAlive.current || controllerRef.current.active?.record.id !== current?.record.id || controllerRef.current.active?.sequence !== current?.sequence || !controllerRef.current.canLeave()) return; const record = await api.createDraft(projectId, conversation.id, `draft_${crypto.randomUUID()}`, { ...(current?.content ?? request.snapshot), instructions: request.snapshot.instructions, destination: { projectId: conversation.projectId, conversationId: conversation.id } }); if (scopeAlive.current && controllerRef.current.active?.record.id === current?.record.id && controllerRef.current.active?.sequence === current?.sequence) controller.openDraft(record); }); }} onViewSources={request => { const ids = request.snapshot.inputs.flatMap(input => input.state === "resolved" ? [input.versionId] : []); if (ids.length === 1 && ids[0]) { setInspectedRequest(undefined); setViewerOrigin("conversation"); controller.viewMedia(ids[0]); setPane("viewer"); } else { setSourceVersionIds(ids); showView("media"); } }} onViewVersions={request => { const id = request.slots.find(slot => slot.versionId === selected?.id)?.versionId ?? request.slots.find(slot => slot.versionId)?.versionId; if (id) { setInspectedRequest(undefined); controller.viewMedia(id); setVersionsOpen(true); setPane("viewer"); } }} onHideFromMedia={request => { void perform(async () => { for (const slot of request.slots) if (slot.versionId) { const updated = await mediaActions.change(slot.versionId, { hidden: true }); if (scopeAlive.current) controller.updateMedia(updated); } }); }} {...(!isMobile ? { describeRequest: (request: AcceptedRequest) => requestHistoryDescription(request, controller.profiles) } : {})} />
      {active?.record.status === "submitted" ? <FreshButton className="vf-new-draft" onClick={() => { void perform(() => controller.newDraft(active.content.action)); }}>New draft</FreshButton> : null}
      {renderComposer()}
    </aside>
    {versionsOpen ? <VersionsPanel versions={controller.media} selectedVersionId={selected?.id} {...(preferred ? { preferredVersionId: preferred } : {})} requests={controller.view.requests} access={access} readOnly={controller.project?.status !== "active" || controller.conversation?.status !== "active"} canVary={version => version.origin.kind === "generated" && controller.view.requests.some(request => request.id === (version.origin.kind === "generated" ? version.origin.requestId : ""))} onView={id => { setInspectedRequest(undefined); controller.viewMedia(id); }} onClose={() => setVersionsOpen(false)} onPreferred={makePreferred} onVariation={version => { if (version.origin.kind === "generated") { const requestId = version.origin.requestId; const request = controller.view.requests.find(row => row.id === requestId); if (request) void perform(() => reuseRequest(request, true)); } }} onEdit={edit} /> : null}
    {inlineVideo ? <div className="vf-inline-editor">{renderEditor("embedded")}</div> : renderViewer()}

    {options}{sharing}
    {savedImport ? <SavedImportSheet ownerId={ownerId} projectId={projectId} projectName={controller.project?.name ?? "this project"} version={savedImport} access={access} readOnly={controller.project?.status !== "active" || controller.conversation?.status !== "active" || !active || !["open", "parked"].includes(active.record.status)} onClose={() => { const next = new URLSearchParams(search); next.delete("savedImport"); setSearch(next, { replace: true }); }} onUseInput={version => { controller.applyMediaInput(version); const next = new URLSearchParams(search); next.delete("savedImport"); next.delete("view"); setSearch(next, { replace: true }); setPane("conversation"); }} /> : null}
    {workspaceDialog}
  </div>;
}

function LibraryWorkspace({ ownerId }: { ownerId: string }): ReactElement {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  // Read once: dropping the claim from the URL must not restart the entry.
  const [claim] = useState(() => search.get("claim") ?? undefined);
  const entry = useLibraryEntry(ownerId, claim);
  const library = entry.library;
  useEffect(() => {
    if (!library || !entry.claim) return;
    const next = new URLSearchParams(search); next.delete("claim");
    if (entry.claim.state === "claimed") {
      next.set("conversation", entry.claim.conversationId);
      navigate(`/app?${next}`, { replace: true, state: reopenWorkspaceState({ ownerId, projectId: library.id, conversationId: entry.claim.conversationId, draftId: entry.claim.draftId }) });
    } else navigate(next.size ? `/app?${next}` : "/app", { replace: true });
    // The claim settles once per entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.claim, library]);
  if (entry.error) return <SystemRoutePage state={entry.error.status === 401 || entry.error.status === 403 ? "denied" : entry.error.status === 503 ? "unavailable" : !navigator.onLine ? "offline" : "load-error"} onRetry={entry.retry} />;
  if (!library || search.has("claim")) return <SystemRoutePage state="loading" />;
  return <OwnedWorkspace key={`${ownerId}:${library.id}`} ownerId={ownerId} projectId={library.id} library />;
}

export default function ProjectWorkspace(): ReactElement {
  const [resolved, setResolved] = useState(false);
  const user = useAuthUser({ onChange: () => setResolved(true) });
  const params = useParams<{ projectId: string }>();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const browsing = useLocation().pathname === "/app/projects";
  const project = ProjectIdSchema.safeParse(params.projectId ?? search.get("project"));
  const openProject = (id: string, reopen: boolean): void => { if (!user) return; const next = new URLSearchParams(search); next.delete("project"); const target = { ownerId: user.uid, projectId: id }; navigate(`/app/project/${encodeURIComponent(id)}${next.size ? `?${next}` : ""}`, { state: reopen ? reopenWorkspaceState(target) : createdWorkspaceState(target) }); };
  if (!resolved) return <SystemRoutePage state="loading" />;
  // Saved projects need their owner; anyone can start writing a request.
  if (!user) return project.success || browsing ? <SystemRoutePage state="denied" /> : <GuestWorkspace />;
  if (project.success) return <OwnedWorkspace key={`${user.uid}:${project.data}`} ownerId={user.uid} projectId={project.data} />;
  if (browsing) return <ProjectBrowser key={user.uid} ownerId={user.uid} onOpen={id => openProject(id, true)} onCreate={id => openProject(id, false)} />;
  return <LibraryWorkspace key={user.uid} ownerId={user.uid} />;
}
