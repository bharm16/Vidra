import { readProjectAreaMask } from "@/features/project-sketch/api/projectSketchApi";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { Navigate, useNavigate, useParams, useSearchParams, useBlocker, useLocation } from "react-router-dom";
import { useAuthUser } from "@/hooks/useAuthUser";
import { FreshButton, FreshIconButton } from "@/components/fresh/FreshButton";
import { FreshRail, type FreshDestination } from "@/components/fresh/FreshRail";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@promptstudio/system/dialog";
import { canonicalJson } from "@shared/workflow/canonicalJson";
import { MediaActionsApi } from "./api/mediaActionsApi";
import { useProjectWorkspace } from "./hooks/useProjectWorkspace";
import { useLibraryEntry } from "./hooks/useLibraryEntry";
import { useOpenFolder } from "./hooks/useOpenFolder";
import { GuestWorkspace } from "./GuestWorkspace";
import { PromptComposer, type PromptComposerProps } from "./components/PromptComposer";
import type { CapabilityLookupStatus } from "./components/CapabilitySettings";
import { roleKinds } from "./state/inputBinding";
import { importedVersionId } from "@shared/schemas/workflow/import.schemas";
import { GenerationFeed } from "./components/GenerationFeed";
import { HistoryRail } from "./components/HistoryRail";
import { FocusView } from "./components/FocusView";
import { verbsForResult, type ResultVerb } from "./state/resultVerbs";
import { COMPOSER_TOOLS, composerOutput, composerTool } from "@shared/workflow/actionRegistry";
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
import { bindWorkspaceEntry, consumeCreatedWorkspaceEntry, readWorkspaceEntry, reopenWorkspaceState, workspaceEntryMatches, type WorkspaceEntryBinding, type WorkspaceEntryTicket } from "./state/workspaceEntry";
import { FolderIdSchema, ProjectIdSchema } from "@shared/schemas/workflow/identity.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import type { AcceptedRequest } from "@shared/schemas/workflow/request.schemas";
import type { CreationAction, DraftInput } from "@shared/schemas/workflow/draft.schemas";
import { type ProjectAreaMask } from "@shared/schemas/workflow/sketch.schemas";
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
import { mediaDownloadName } from "@shared/workflow/mediaFilename";

const WORKSPACE_VIEWS = ["media", "video-workspace", "conversations", "video", "video-focus", "sketch"];
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
  const folderParam = FolderIdSchema.safeParse(search.get("folder"));
  const folderId = library && folderParam.success ? folderParam.data : undefined;
  const openFolder = useOpenFolder(ownerId, folderId);
  const controller = useProjectWorkspace(ownerId, projectId, search.get("conversation") ?? undefined, initialEntry.current?.draftId, { library, folderId });
  const imports = useProjectImports(ownerId, projectId, controller.updateMedia);
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
  // Painted pixels by mask version, so reopening Edit a region shows the area bound into the request.
  const [masks, setMasks] = useState<Record<string, ProjectAreaMask>>({});
  // A whole-picture verb drops a bound area; the composer says so, and Undo brings it back while nothing else changed.
  const [areaDropped, setAreaDropped] = useState<{ draftId: string; from: number; sequence?: number }>();
  // Focus is the large player on demand (Rule 2); the feed stays mounted under it, so closing keeps its scroll.
  const [focusOpen, setFocusOpen] = useState(false);
  // The rail marks the request it jumped to until another result is viewed.
  const [jumpedRequestId, setJumpedRequestId] = useState<string>();
  useEffect(() => { setJumpedRequestId(undefined); }, [controller.view.viewedVersionId]);
  // Viewing another result (rail, arrows, a tile) leaves the area editor: Done must never bind a picture other than the one on screen.
  const viewedVersionId = controller.view.viewedVersionId;
  useEffect(() => { if (panel === "area" && area && viewedVersionId !== undefined && viewedVersionId !== area.version.id) setPanel("none"); }, [area, panel, viewedVersionId]);
  const [composerHeight, setComposerHeight] = useState(0);
  const composerDock = useRef<HTMLDivElement>(null);
  const feedStage = useRef<HTMLElement>(null);
  const followingFeed = useRef(true);
  // The feed's size at the last scroll; a scroll that comes with a size change is layout, not the creator leaving the end.
  const feedGeometry = useRef({ height: 0, client: 0 });
  // The output the composer returns to when a rail tool is closed.
  const lastOutput = useRef<CreationAction>("make-video");
  const inspectedRequests = useRef(new Set<string>());
  const frameIntents = useRef(new Map<string, string>());
  const active = controller.active;
  // A painted area is a hidden input of its request, never a picture in Media, the picker or the editor.
  const listedMedia = useMemo(() => controller.media.filter(version => version.origin.kind !== "area-mask"), [controller.media]);
  const boundArea = ((): { sourceId: string; maskId: string; painted: ProjectAreaMask | undefined } | undefined => {
    const primary = active?.content.inputs.find(input => input.role === "primary");
    const mask = active?.content.inputs.find(input => input.role === "mask");
    return primary?.state === "resolved" && mask?.state === "resolved" ? { sourceId: primary.versionId, maskId: mask.versionId, painted: masks[mask.versionId] } : undefined;
  })();
  if (active && composerOutput(active.content.action)) lastOutput.current = active.content.action;
  const activeHasArea = Boolean(active?.content.inputs.some(input => input.role === "mask"));
  useEffect(() => {
    // Only the verb's own edit (the next one) counts; anything else retires the note.
    if (!areaDropped || areaDropped.sequence !== undefined || active?.record.id !== areaDropped.draftId || active.sequence === areaDropped.from) return;
    setAreaDropped(active.sequence === areaDropped.from + 1 && !activeHasArea ? { ...areaDropped, sequence: active.sequence } : undefined);
  }, [active, activeHasArea, areaDropped]);
  const areaDroppedNotice = areaDropped && active && areaDropped.draftId === active.record.id && areaDropped.sequence === active.sequence && !activeHasArea ? <div className="vf-notice" role="status"><p>Painted area removed</p><FreshButton tone="quiet" onClick={() => { setAreaDropped(undefined); controllerRef.current.undo(); }}>Undo</FreshButton></div> : null;
  const entryWorkingCopy = workspaceEntryMatches(entryBinding, active?.record);
  const actionError = actionFailure?.conversationId === controller.conversation?.id && actionFailure?.draftId === active?.record.id ? actionFailure?.message : undefined;
  const currentResultFeedback = resultFeedback?.conversationId === controller.conversation?.id && resultFeedback?.draftId === active?.record.id ? resultFeedback : undefined;
  const selected = controller.media.find(version => version.id === controller.view.viewedVersionId);
  const knownMediaLabels = useRef(new Map<string, string>());
  for (const version of controller.media) knownMediaLabels.current.set(version.id, version.label);
  const inspectedRequestId = inspectedRequest?.conversationId === controller.conversation?.id ? inspectedRequest?.requestId : undefined;
  const preferred = versionTree(controller.media, selected?.id).find(row => row.version.preferred)?.version.id;
  // A retired or unknown view (such as the old ?view=model) opens the normal workspace.
  const requestedView = search.get("view");
  const view = requestedView && WORKSPACE_VIEWS.includes(requestedView) ? requestedView : null;
  // ...and leaves the URL, so the address says what is on screen.
  useEffect(() => {
    if (!requestedView || view) return;
    const next = new URLSearchParams(search); next.delete("view"); setSearch(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedView, view]);
  const libraryOpen = view === "media";
  const savedImport = libraryOpen ? controller.media.find(version => version.id === search.get("savedImport") && isSavedImportVersion(version, ownerId, projectId)) : undefined;
  const inlineVideo = view === "video-workspace";
  const projectHome = view === "conversations";
  // The library opens on its conversations with a fresh composer, like P02 with no project selected.
  const libraryHome = library && !view && !search.get("conversation");
  const focusEditor = view === "video-focus";
  const editorOpen = focusEditor || view === "video" || search.get("intent") === "video-edit";
  const sketchOpen = view === "sketch" || search.get("intent") === "sketch";
  // The docked composer grows upward; the feed keeps its last block clear of it.
  const hasActive = active !== undefined;
  useLayoutEffect(() => {
    const dock = composerDock.current;
    if (!dock || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setComposerHeight(Math.ceil(dock.getBoundingClientRect().height)));
    observer.observe(dock);
    return () => observer.disconnect();
  }, [libraryOpen, isMobile, hasActive]);
  // The feed opens at its newest block and follows new work while the creator is at the end (newest last).
  const feedLength = controller.view.requests.length + controller.submissions.length;
  const feedProgress = controller.view.requests.at(-1)?.slots.map(slot => `${slot.outcome}:${slot.delivery}`).join(",") ?? "";
  useLayoutEffect(() => {
    const stage = feedStage.current;
    if (stage && followingFeed.current) stage.scrollTop = stage.scrollHeight;
  }, [feedLength, feedProgress, composerHeight, libraryOpen]);
  // Pictures and clips load after the first layout; while following, the newest block stays at the end as they grow.
  useLayoutEffect(() => {
    const stage = feedStage.current;
    const column = stage?.firstElementChild;
    if (!stage || !column || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => { if (followingFeed.current) stage.scrollTop = stage.scrollHeight; });
    observer.observe(column);
    return () => observer.disconnect();
  }, [libraryOpen, isMobile, focusOpen]);
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
  const capabilityLookupStatus: CapabilityLookupStatus = controller.loading ? "loading" : controller.resources.models.state === "error" ? "error" : "ready";
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
    const protect = (event: BeforeUnloadEvent): void => { if (active && !active.retention.safe) { event.preventDefault(); event.returnValue = ""; } };
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
    // Changing view leaves the area editor; on a phone it otherwise covers every tab.
    setPanel(current => current === "area" ? "none" : current);
    const query = new URLSearchParams(search); query.delete("intent");
    // The editor's parameters belong to the editor; they do not ride along to Media or the feed.
    if (next !== "video") for (const key of ["edit", "addVersion", "addLane", "addCaptions", "timeline"]) query.delete(key);
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
    if (target === "create") { void perform(() => newDraft("make-video")); return; }
    if (target === "upscale" || target === "reframe" || target === "captions") {
      // A tool opens the same composer in place; choosing it again returns to the last output.
      const tool = COMPOSER_TOOLS.find(item => item.tool === target);
      const current = controllerRef.current.active;
      if (view) showView();
      setFocusOpen(false);
      if (tool && current) controller.changeAction(composerTool(current.content.action) === target ? lastOutput.current : tool.action);
      return;
    }
    // Home is the workspace's conversation list (where a new conversation starts), not the public site.
    const home = library ? (folderId ? `/app?folder=${encodeURIComponent(folderId)}` : "/app") : "/";
    void navigateSafely(target === "home" ? home : target === "help" ? "/docs" : "/account");
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
    const conversationId = controllerRef.current.conversation?.id;
    const restored = await controllerRef.current.reuseSetup(request, variation);
    if (!restored || !scopeAlive.current || controllerRef.current.active?.record.id !== restored.draftId) return;
    if (!isMobile) setFocusOpen(false);
    else if (!variation && restored.resultId && conversationId) setResultFeedback({ conversationId, draftId: restored.draftId, versionId: restored.resultId, kind: "setup" });
  };
  const reuse = (version: MediaVersion): void => { if (version.origin.kind !== "generated") return; const requestId = version.origin.requestId; const request = controller.view.requests.find(candidate => candidate.id === requestId); if (request) void perform(() => reuseRequest(request)); };
  const change = (version: MediaVersion, patch: { label?: string; hidden?: boolean; favorite?: boolean }): void => { void perform(async () => { const updated = await mediaActions.change(version.id, patch); if (scopeAlive.current) controller.updateMedia(updated); }); };
  const makePreferred = (version: MediaVersion): void => { void perform(async () => { const rows = await mediaActions.preferred(version.id); if (scopeAlive.current) rows.forEach(controller.updateMedia); }); };
  const captureFrame = (version: MediaVersion, timestamp: number): void => {
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
  const download = (version: MediaVersion): void => { void perform(async () => { const grant = await mediaActions.download(version.id); if (!scopeAlive.current) return; const link = document.createElement("a"); link.href = grant.url; link.download = mediaDownloadName(version); link.rel = "noreferrer"; link.click(); }); };
  const newDraft = async (action: CreationAction): Promise<void> => { consumeCreationTicket(entryTicket?.entryId ?? entryBinding?.entryId ?? navigationEntry?.entryId); setEntryTicket(undefined); setEntryBinding(binding => binding?.kind === "created" ? undefined : binding); await controller.newDraft(action); if (scopeAlive.current) { showView(); setPanel("none"); setPane("conversation"); setViewerOrigin("conversation"); } };
  const noteDroppedArea = (): void => { const current = controllerRef.current.active; if (current?.content.inputs.some(input => input.role === "mask")) setAreaDropped({ draftId: current.record.id, from: current.sequence }); };
  const edit = (version: MediaVersion): void => { noteDroppedArea(); void perform(async () => { await controller.editMedia(version); if (scopeAlive.current) { showView(); setPane("conversation"); setViewerOrigin("conversation"); } }); };
  /** A change to existing media binds the media into the working request in the role its action uses (Rule 8); the words stay. */
  const startFromMedia = (action: CreationAction, version: MediaVersion, role?: DraftInput["role"]): void => {
    noteDroppedArea();
    void perform(async () => {
      await controller.bindResult(action, version, role);
      if (scopeAlive.current) { showView(); setPane("conversation"); setViewerOrigin("conversation"); setFocusOpen(false); }
    });
  };
  /** The reference joins the request being written, and the composer comes into view to show it. */
  const attachReference = (version: MediaVersion): void => { controller.applyMediaInput(version, "reference"); if (libraryOpen || focusOpen) { showView(); setPane("conversation"); setViewerOrigin("conversation"); setFocusOpen(false); } };
  const animate = (version: MediaVersion): void => startFromMedia("animate-image", version);
  const extend = (version: MediaVersion): void => startFromMedia("extend-video", version);
  const editRegion = (version: MediaVersion): void => {
    void perform(async () => {
      await controller.bindResult("edit-image", version, "primary", { keepArea: true });
      const resource = await access(version.id);
      // An area bound before a reload is shown again from its stored pixels, so Done never drops it unseen.
      const bound = boundArea?.sourceId === version.id && !boundArea.painted ? boundArea : undefined;
      const painted = bound && version.metadata.state === "verified" ? await storedArea(bound.maskId, version).catch(() => undefined) : undefined;
      // The area editor shows the viewed picture, so Focus's rail and arrows start from it.
      if (scopeAlive.current) { if (bound && painted) setMasks(current => ({ ...current, [bound.maskId]: painted })); controllerRef.current.viewMedia(version.id); setArea({ version, url: resource.url }); setPanel("area"); setPane("viewer"); setFocusOpen(true); }
    });
  };
  const storedArea = (maskId: string, version: MediaVersion): Promise<ProjectAreaMask> => readProjectAreaMask(version, maskId, access);
  /** Done binds the painted area as the request's mask input; Done with nothing painted removes it. Either way the composer comes back. */
  const finishArea = (source: MediaVersion, mask: ProjectAreaMask | undefined): void => {
    void perform(async () => {
      const version = await controllerRef.current.finishArea(source, mask);
      if (version && mask && scopeAlive.current) setMasks(current => ({ ...current, [version.id]: mask }));
      if (scopeAlive.current) { setPanel("none"); setFocusOpen(false); showView(); setPane("conversation"); setViewerOrigin("conversation"); }
    });
  };
  /** Placement is explicit (Rule 8): a clip or picture joins the video track, a voiceover take its lane, other audio the Music lane. */
  const addToVideo = (version: MediaVersion): void => {
    setVersionsOpen(false); setInspectingVideo(false); setFocusOpen(false);
    const origin = version.origin;
    const made = origin.kind === "generated" ? controller.view.requests.find(request => request.id === origin.requestId)?.snapshot.action : undefined;
    const next = new URLSearchParams(search); next.delete("intent"); next.set("view", "video-workspace"); next.set("addVersion", version.id);
    if (version.kind === "audio") next.set("addLane", made === "make-voiceover" ? "voiceover" : "music"); else next.delete("addLane");
    setSearch(next, { replace: true });
  };
  /** The verbs one result shows wherever it appears: Focus's Use menu and the library's action bar. */
  const resultActions = (version: MediaVersion): Array<{ label: string; disabled?: boolean | undefined; run(positionSeconds: number): void }> => {
    const origin = version.origin;
    const request = origin.kind === "generated" ? controller.view.requests.find(row => row.id === origin.requestId) : undefined;
    return verbsForResult(version, controller.profiles, { variation: Boolean(request) }).map(verb => ({ label: verb.label, disabled: verb.disabled, run: position => {
      if (verb.kind === "frame" && version.kind !== "image") { if (focusOpen || isMobile) captureFrame(version, position); else openFocus(version.id); return; }
      if (verb.kind === "variation" && !request) return;
      if (request) runVerb(verb, version, request);
      else if (verb.kind === "action") startFromMedia(verb.action, version, verb.role);
      else if (verb.kind === "region") editRegion(version);
      else if (verb.kind === "reference") attachReference(version);
      else if (verb.kind === "add-to-video") addToVideo(version);
    } }));
  };
  const captionsToVideo = (request: AcceptedRequest): void => { setFocusOpen(false); const next = new URLSearchParams(search); next.delete("intent"); next.set("view", "video-workspace"); next.set("addCaptions", request.id); setSearch(next, { replace: true }); };
  const openFocus = (versionId: string): void => { setInspectedRequest(undefined); setViewerOrigin("conversation"); controller.viewMedia(versionId); setFocusOpen(true); };
  /** A result's button: a profile verb opens the composer with the result bound; the rest act in place. */
  const runVerb = (verb: ResultVerb, version: MediaVersion, request: AcceptedRequest): void => {
    if (verb.kind === "action") startFromMedia(verb.action, version, verb.role);
    else if (verb.kind === "variation") void perform(() => reuseRequest(request, true));
    else if (verb.kind === "region") editRegion(version);
    else if (verb.kind === "reference") attachReference(version);
    else if (verb.kind === "frame") openFocus(version.id);
    else addToVideo(version);
  };
  const exportDraft = (): void => {
    if (!active) return;
    const blob = new Blob([JSON.stringify(active.content, null, 2)], { type: "application/json" });
    const uri = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = uri; link.download = "vidra-unfinished-request.json"; link.click(); setTimeout(() => URL.revokeObjectURL(uri), 60000);
  };
  const controllerAccess = controller.access;
  const access = useCallback(async (versionId: string): Promise<{ url: string; expiresAt?: string }> => { const grant = await controllerAccess(versionId); return { url: grant.url, ...(grant.expiresAt ? { expiresAt: grant.expiresAt } : {}) }; }, [controllerAccess]);
  const activeTool = active ? composerTool(active.content.action) : undefined;
  const renderRail = (current: "create" | "media" | "video" | "sketch" | "projects"): ReactElement => <FreshRail active={current === "create" && activeTool && !isMobile ? activeTool : current} requestPage={libraryHome} tools={!isMobile} onNavigate={navigation} onProjectOptions={() => setPanel("options")} onRequest={() => { showView(); setPane("conversation"); setViewerOrigin("conversation"); }} mobile mobilePresentation={mobilePreviewKind === "clip" ? "labels" : "icons"} />;
  const [initialIntent, setInitialIntent] = useState(false);
  useEffect(() => {
    if (initialIntent || controller.loading || !controller.conversation) return;
    setInitialIntent(true);
    const intent = search.get("intent");
    if (intent === "make-image" || intent === "make-video") void perform(async () => { if (controller.active?.content.action !== intent || controller.active.content.instructions) await controller.newDraft(intent); const next = new URLSearchParams(search); next.delete("intent"); setSearch(next, { replace: true }); });
    // Only process the arriving deep-link intent once; normal draft changes remain deliberate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialIntent, controller.loading, controller.conversation?.id]);
  // A rail tool chosen on another page opens here in the same composer, once models and the draft are in.
  const toolIntent = COMPOSER_TOOLS.find(item => item.tool === search.get("intent"));
  const toolReady = Boolean(controller.active) && controller.profiles.length > 0;
  useEffect(() => {
    if (!toolIntent || !toolReady) return;
    controller.changeAction(toolIntent.action);
    const next = new URLSearchParams(search); next.delete("intent"); setSearch(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolIntent?.action, toolReady]);

  // Once something is made from the library home, that conversation is where its results live.
  const homeConversationId = controller.conversation?.id;
  const homeHasWork = homeConversationId !== undefined && (controller.view.requests.some(request => request.conversationId === homeConversationId) || controller.submissions.some(submission => controller.view.drafts[submission.command.draftId]?.record.conversationId === homeConversationId));
  // The conversation open when home was entered is the one being left, not one started here.
  const leftConversationId = useRef<string | undefined>(undefined);
  useEffect(() => { if (!libraryHome) leftConversationId.current = homeConversationId; }, [libraryHome, homeConversationId]);
  useEffect(() => {
    if (!libraryHome || !homeHasWork || !homeConversationId || homeConversationId === leftConversationId.current) return;
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
    // A linked request is a deliberate jump: the feed stops following its end to show it.
    followingFeed.current = false;
    requestAnimationFrame(() => document.getElementById(`vf-request-${requestId}`)?.scrollIntoView({ block: "start" }));
  }, [controller, inlineVideo, search, setActionError]);

  // Focus lives in the URL: opening it adds a history entry, so Back closes it, and a reload reopens it on the same result.
  const focusParam = search.get("focus");
  const focusUrl = useRef<{ param: string | null; open: boolean }>({ param: null, open: false });
  useEffect(() => {
    if (isMobile) return;
    const last = focusUrl.current;
    if (focusParam !== last.param && focusOpen === last.open) {
      if (!focusParam) { focusUrl.current = { param: null, open: false }; if (focusOpen) setFocusOpen(false); return; }
      // A reload or Forward waits until its result has loaded; a result that never arrives is reported and leaves the URL.
      if (!controller.media.some(version => version.id === focusParam)) {
        if (controller.loading || controller.resourceErrors.some(problem => problem.startsWith("Media"))) return;
        const next = new URLSearchParams(search); next.delete("focus"); setSearch(next, { replace: true });
        focusUrl.current = { param: null, open: false };
        setActionError("This result is unavailable in this project.");
        return;
      }
      controller.viewMedia(focusParam); setFocusOpen(true); focusUrl.current = { param: focusParam, open: true };
      return;
    }
    if (focusOpen && selected && focusParam !== selected.id) {
      const next = new URLSearchParams(search); next.set("focus", selected.id); next.delete("request");
      setSearch(next, { replace: focusParam !== null });
      focusUrl.current = { param: selected.id, open: true };
      return;
    }
    if (!focusOpen && focusParam) {
      const next = new URLSearchParams(search); next.delete("focus");
      setSearch(next, { replace: true });
      focusUrl.current = { param: null, open: false };
      return;
    }
    focusUrl.current = { param: focusParam, open: focusOpen };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusParam, focusOpen, selected?.id, controller.media, controller.loading, isMobile]);

  const requestInput = (role: DraftInput["role"], replacing?: DraftInput): void => {
    const current = controllerRef.current.active;
    if (current) setInputRequest({ draftId: current.record.id, role, key: crypto.randomUUID(), ...(replacing ? { replacing } : {}) });
  };
  const inputRequestKey = (input?: DraftInput): string | undefined => inputRequest && inputRequest.draftId === active?.record.id && (input ? inputRequest.replacing && canonicalJson(inputRequest.replacing) === canonicalJson(input) : !inputRequest.replacing) ? inputRequest.key : undefined;
  const renderPicker = (input?: DraftInput, trigger?: ReactNode, programmatic = false, tile?: { role: DraftInput["role"]; label: string }): ReactElement => {
    const targetDraftId = active?.record.id;
    const requestedRole = input?.role ?? tile?.role ?? (programmatic && inputRequest && inputRequest.draftId === targetDraftId && !inputRequest.replacing ? inputRequest.role : undefined);
    const version = input?.state === "resolved" ? controller.media.find(row => row.id === input.versionId) : undefined;
    // The picker offers the kinds the role's models take; an input already chosen keeps its own kind.
    const kinds = active && requestedRole ? roleKinds(active.content, controller.profiles, requestedRole) : [];
    const mediaKinds = kinds.length ? kinds : version ? [version.kind === "export" ? "video" as const : version.kind] : ["image" as const];
    return <ProjectMediaPicker {...(trigger ? { trigger } : {})} triggerLabel={tile?.label} requestOpenKey={inputRequestKey(input)} selectedVersionId={input?.state === "resolved" ? input.versionId : undefined} selectedVersionLabel={version?.label ?? (input?.state === "resolved" ? knownMediaLabels.current.get(input.versionId) : undefined)} mediaKinds={mediaKinds} versions={listedMedia} imports={imports} access={access} disabled={!active || !["open", "parked"].includes(active.record.status) || controller.project?.status !== "active" || controller.conversation?.status !== "active"} onImport={(id, kind) => { if (targetDraftId) controllerRef.current.bindImport(targetDraftId, id, kind, requestedRole, input); }} onChoose={chosen => { if (controllerRef.current.active?.record.id === targetDraftId) controllerRef.current.applyMediaInput(chosen, requestedRole, input); }} />;
  };
  // A linked conversation that does not exist has nothing to retry or keep: its notice leads back to the conversations.
  const conversationMissing = !controller.loading && !controller.conversation && controller.loadFailureStatus === 404;
  const conversationsHome = (): void => { if (library) void navigateSafely(folderId ? `/app?folder=${encodeURIComponent(folderId)}` : "/app"); else showView("conversations"); };
  const loadProblemAction = conversationMissing ? <FreshButton onClick={conversationsHome}>Open conversations</FreshButton> : <FreshButton onClick={controller.reload}>Retry loading</FreshButton>;
  const renderComposer = (options: Partial<Pick<PromptComposerProps, "mediaActions" | "capabilityLookupStatus" | "primaryLabel" | "inputLabel" | "submissionBlockedReason">> = {}): ReactElement => conversationMissing ? <></> : controller.loading && !active ? <p role="status">Opening request…</p> : <PromptComposer capabilityLookupStatus={capabilityLookupStatus} inputStatus={input => {
    if (input.state !== "importing") return undefined;
    if (controller.media.some(version => version.id === importedVersionId(input.importId))) return undefined;
    const job = imports.jobs.find(row => row.id === input.importId);
    return job?.state === "uploading" ? "uploading" : "unavailable";
  }} controller={controller} onSubmit={async () => {
    await controller.make();
  }} onActionChange={controller.changeAction} onSketch={() => showView("sketch")} onChooseInput={() => requestInput(failedInput?.role ?? "reference", failedInput)} inputControl={(role, label) => renderPicker(undefined, undefined, false, { role, label })} offline={offline} renderInputPicker={(input, thumbnail) => renderPicker(input, <span className="vf-mask-input-wrap">{thumbnail}</span>)} {...options} />;
  const captionsRequestId = search.get("addCaptions");
  const captionsSlot = captionsRequestId ? controller.view.requests.find(request => request.id === captionsRequestId)?.slots.find(slot => slot.text !== undefined) : undefined;
  const captionsRequest = captionsRequestId && captionsSlot?.text ? { requestId: captionsRequestId, text: captionsSlot.text } : undefined;
  const renderEditor = (presentation: "full" | "embedded" | "focus"): ReactElement => <VideoEditor presentation={presentation} timelinePresentation={search.get("timeline") === "assembly" ? "assembly" : "labeled"} visible={presentation !== "embedded" || !inspectingVideo} {...(presentation === "embedded" && inspectingVideo ? { renderInspection: (timeline, timelineControl, exportControl) => renderViewer(timeline, timelineControl, exportControl), onInspectionEdit: () => setInspectingVideo(false) } : {})} initialMediaVersionId={search.get("addVersion") ?? undefined} initialMediaLane={search.get("addLane") === "voiceover" ? "voiceover" : "music"} onInitialMediaHandled={() => { const next = new URLSearchParams(search); next.delete("addVersion"); next.delete("addLane"); setSearch(next, { replace: true }); }} initialCaptions={captionsRequest} onInitialCaptionsHandled={() => { const next = new URLSearchParams(search); next.delete("addCaptions"); setSearch(next, { replace: true }); }} ownerId={ownerId} projectId={projectId} media={listedMedia} resolveMediaAccess={access} importController={imports} onClose={() => showView()} onMediaRefresh={controller.refreshMedia} {...(search.get("edit") ? { initialEditId: search.get("edit") ?? "" } : {})} onShareExport={id => { setSharePlacement("editor"); const version = controllerRef.current.media.find(row => row.id === id); if (version) setShareVersion(version); else void perform(async () => { await controller.refreshMedia(); const saved = controllerRef.current.media.find(row => row.id === id); if (saved) setShareVersion(saved); else throw new Error("The exported clip has not appeared in Media yet. Refresh and try again."); }); }} onEditSelected={id => { const next = new URLSearchParams(search); if (next.get("edit") !== id) { next.set("edit", id); setSearch(next, { replace: true }); } }} />;
  const renderViewer = (timeline?: ReactNode, timelineControl?: ReactNode, inspectionActions?: ReactNode): ReactElement => {
    if (panel === "area" && area) return <div className="vf-area-viewer"><AreaEditPanel key={area.version.id} version={area.version} sourceUrl={area.url} {...(boundArea?.sourceId === area.version.id && boundArea.painted ? { initialMask: boundArea.painted } : {})} saved={boundArea?.sourceId === area.version.id} {...(isMobile ? { onClose: () => setPanel("none") } : {})} onDone={mask => finishArea(area.version, mask)} /></div>;
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
    return <MediaViewer {...(inspectionActions ? { inspectionActions, onBackToEdit: () => setInspectingVideo(false) } : {})} {...(sourceRequest && selected ? { renderRequestDetails: (onClose: () => void) => <RequestDetails request={sourceRequest} result={selected} media={controller.media} profile={controller.profiles.find(candidate => candidate.id === sourceRequest.snapshot.settings.profileId && candidate.revision === sourceRequest.snapshot.settings.profileRevision)} projectName={controller.project?.name ?? "Project"} conversationName={controller.conversations.find(row => row.id === sourceRequest.conversationId)?.name ?? "Conversation"} readOnly={controller.project?.status !== "active" || controller.conversation?.status !== "active"} onReuse={request => { onClose(); void perform(() => reuseRequest(request)); }} onClose={onClose} /> } : {})} mobilePreview={Boolean(mobilePreviewKind)} onView={() => setPane("viewer")} onBack={() => { if (viewerOrigin === "media") showView("media"); else setPane("conversation"); }} banner={failedInput ? <WorkspaceNotice title="The image for this draft could not be made" message="Choose an input or reuse the original setup." actionLabel="Choose input" onAction={() => requestInput(failedInput.role, failedInput)} /> : controller.serviceUnavailable ? <WorkspaceNotice title="New requests are temporarily unavailable" message="The service is at capacity" actionLabel="Check again" onAction={controller.reload} /> : offline ? <WorkspaceNotice title="You are offline" message={active?.retention.onDevice ? "Changes are saved on this device" : "Keep your latest work before leaving"} actionLabel="View history" onAction={() => showView("conversations")} /> : controller.conversation?.status === "archived" ? <WorkspaceNotice title="This conversation is archived" message="Restore it to make changes." actionLabel="Restore" onAction={() => { const conversation = controller.conversation; if (conversation) void perform(async () => { const updated = await managementApi.changeConversation(projectId, conversation.id, { expectedRevision: conversation.revision, status: "active" }); if (scopeAlive.current) controller.observeConversation(updated); }); }} /> : feedbackBanner ? feedbackBanner : isMobile && newlyReadyVersionId && newlyReadyVersionId !== selected?.id ? <div className="vf-workspace-banner"><p>{controller.media.find(version => version.id === newlyReadyVersionId)?.label ?? "New version"} is ready.</p><FreshButton onClick={() => { setInspectedRequest(undefined); controller.viewMedia(newlyReadyVersionId); setPane("viewer"); }}>View result</FreshButton></div> : undefined} readOnly={controller.project?.status !== "active" || controller.conversation?.status !== "active"} timeline={timeline} timelineControl={timelineControl} {...(selected && boundArea?.sourceId === selected.id && boundArea.painted ? { areaMask: { versionId: selected.id, dataUri: boundArea.painted.dataUri } } : {})} version={selected} access={access} onUseInput={controller.applyMediaInput} onUseFrame={captureFrame} onDownload={download} onReuseSetup={reuse} canReuseSetup={selected?.origin.kind === "generated" && controller.view.requests.some(request => request.id === (selected.origin.kind === "generated" ? selected.origin.requestId : ""))} onEdit={edit} onAnimate={animate} onEditRegion={editRegion} onExtend={extend} onAddToVideo={addToVideo} onMakeCaptions={version => startFromMedia("transcribe", version, "primary")} {...(selected ? { verbs: resultActions(selected) } : {})} onVersions={() => setVersionsOpen(true)} onPreferred={makePreferred} {...(preferred ? { preferredVersionId: preferred } : {})} onShare={version => { setSharePlacement("viewer"); setShareVersion(version); }} onHide={version => change(version, { hidden: !version.hidden })} onRename={version => { setRename({ version, label: version.label }); setPanel("rename"); }} onFavorite={version => change(version, { favorite: !version.favorite })} {...(selected?.favorite !== undefined ? { favorite: selected.favorite } : {})} onPictureTools={version => { void perform(async () => { const resource = await access(version.id); if (scopeAlive.current) { setArea({ version, url: resource.url }); setPanel("area"); } }); }} /> };
  const sharing = shareVersion ? <ShareVersionPanel ownerId={ownerId} projectId={projectId} version={shareVersion} placement={sharePlacement} onClose={() => setShareVersion(undefined)} /> : null;
  // A library's unused conversations are home's scratch space, hidden from its list; the dialog lists what home lists (plus the one open).
  const managedConversations = library ? controller.conversations.filter(conversation => conversation.acceptanceSequence > 0 || conversation.status === "archived" || (!libraryHome && conversation.id === controller.conversation?.id)) : controller.conversations;
  const options = panel === "options" && controller.project ? <ProjectManagementPanel ownerId={ownerId} project={controller.project} folder={openFolder.folder} onFolderChange={folder => { openFolder.observe(folder); if (folder.status === "trashed") void navigateSafely("/app/projects"); }} conversations={managedConversations}onProjectChange={controller.observeProject} onConversationChange={controller.observeConversation} onOpenConversation={id => { void showConversation(id); }} onOpenDraft={record => { void perform(async () => { await controller.openConversationDraft(record); const current = controllerRef.current; if (current.conversation?.id === record.conversationId) { const next = new URLSearchParams(search); next.set("conversation", record.conversationId); setSearch(next, { replace: true }); markReopenedConversation(record.conversationId, record.id); } setPanel("none"); }); }} onClose={() => setPanel("none")} /> : null;
  const workspaceDialog = <Dialog open={panel !== "none" && panel !== "options" && panel !== "area"} onOpenChange={open => { if (!open) keepEditing(); }}><DialogContent overlayClassName={panel === "leave" ? "vf-leave-backdrop" : ""} className={`vf vf-dialog${panel === "leave" ? " vf-leave-dialog" : ""}`} aria-describedby={panel === "leave" || panel === "area" ? "workspace-panel-description" : undefined}><DialogTitle>{panel === "recovery" ? "Recover your work" : panel === "rename" ? "Rename media" : panel === "area" ? "Paint an area" : "Keep this draft before leaving"}</DialogTitle>{panel === "leave" || panel === "area" ? <DialogDescription id="workspace-panel-description">{panel === "leave" ? <><span className="vf-leave-desktop-copy">Neither this device nor the server has saved your latest changes. Retry saving or export a copy before leaving.</span><span className="vf-leave-mobile-copy">Your latest changes are not saved on this device or the server. Retry saving or export a copy before leaving.</span></> : "Choose an area on this exact picture."}</DialogDescription> : null}

      {panel === "recovery" ? <div className="vf-draft-list">{controller.deviceCopies.length ? <h3>Device recovery copies</h3> : null}{controller.deviceCopies.map((copy, index) => <FreshButton key={`${copy.draftId}:${index}`} onClick={() => { void perform(async () => { await controller.recoverDeviceCopy(copy); setPanel("none"); }); }}>{copy.content.instructions || "Empty request"} · {new Date(copy.updatedAt).toLocaleTimeString()}</FreshButton>)}</div> : null}
      {panel === "rename" && rename ? <form onSubmit={event => { event.preventDefault(); void perform(async () => { const updated = await mediaActions.change(rename.version.id, { label: rename.label }); if (scopeAlive.current) { controller.updateMedia(updated); setPanel("none"); } }); }}><label htmlFor="media-rename">Name</label><input id="media-rename" className="vf-field" value={rename.label} maxLength={300} onChange={event => setRename({ ...rename, label: event.target.value })} /><FreshButton type="submit" tone="primary" disabled={!rename.label.trim()}>Save name</FreshButton></form> : null}

      {panel === "leave" ? <div className="vf-leave-actions"><FreshButton tone="primary" onClick={() => { void perform(retryLeaving); }}>Retry saving</FreshButton><FreshButton onClick={exportDraft}>Export draft</FreshButton><FreshButton tone="quiet" onClick={() => { if (blockerRef.current.state === "blocked") blockerRef.current.proceed(); }}>Discard and leave</FreshButton><FreshButton className="vf-leave-keep" tone="quiet" onClick={keepEditing}>Keep editing</FreshButton></div> : null}
      {actionError ? <p role="alert">{actionError}</p> : null}
    </DialogContent></Dialog>;
  if (!controller.project && !controller.loading && controller.loadFailureStatus !== undefined) return <SystemRoutePage state={controller.loadFailureStatus === 404 ? "not-found" : controller.loadFailureStatus === 401 || controller.loadFailureStatus === 403 ? "denied" : controller.loadFailureStatus === 503 ? "unavailable" : controller.loadFailureStatus === 0 && !navigator.onLine ? "offline" : "load-error"} onRetry={controller.reload} />;
  if (projectHome) return <div className="vf vf-project-home-shell">{renderRail("projects")}<ConversationHome composer={renderComposer()} conversations={controller.conversations} onOpenConversation={id => { void perform(async () => { await controller.openConversation(id); if (controllerRef.current.canLeave()) { const next = new URLSearchParams(search); next.set("conversation", id); next.delete("view"); setSearch(next, { replace: true }); setPane("conversation"); markReopenedConversation(id); } }); }} />{options}{sharing}{workspaceDialog}</div>;
  if (sketchOpen) return <><ProjectSketch key={`${ownerId}:${projectId}`} ownerId={ownerId} projectId={projectId} projectName={controller.project?.name ?? "this project"} rail={renderRail("sketch")} onAccepted={controller.updateMedia} onClose={() => showView()} onUseAsInput={version => { controller.applyMediaInput(version); showView(); }} />{options}{sharing}{workspaceDialog}</>;
  if (editorOpen) return <div className="vf vf-editor-host" data-focus={focusEditor || undefined}>{renderRail("video")}<div className="vf-editor-body">{!focusEditor ? <header className="vf-editor-project-header"><FreshIconButton icon="folder" label="Project options" onClick={() => setPanel("options")} /><div className="vf-flex" /><FreshIconButton icon="more" label="More project options" onClick={() => setPanel("options")} /></header> : null}{renderEditor(focusEditor ? "focus" : "full")}</div>{options}{sharing}{workspaceDialog}</div>;
  if (libraryHome) {
    const homeConversations = controller.conversations.filter(conversation => conversation.acceptanceSequence > 0 && (!folderId || conversation.folderId === folderId));
    const title = folderId ? openFolder.folder?.name ?? "" : undefined;
    const loadProblem = controller.error ?? openFolder.error;
    const homeNotice = loadProblem ? <div className="vf-notice" role="status"><p>{loadProblem}</p><FreshButton onClick={controller.reload}>Retry loading</FreshButton></div> : actionError ? <div className="vf-notice" role="alert"><p>{actionError}</p><FreshButton tone="quiet" onClick={() => setActionError(undefined)}>Dismiss</FreshButton></div> : null;
    return <div className="vf vf-project-home-shell">{renderRail(folderId ? "projects" : "create")}<ConversationHome {...(title !== undefined ? { title } : {})} actions={<FreshIconButton icon="more" label={folderId ? "Project options" : "Conversation options"} onClick={() => setPanel("options")} />} composer={<>{homeNotice}{renderComposer()}</>} conversations={homeConversations} onOpenConversation={id => { void showConversation(id); }} />{options}{sharing}{workspaceDialog}</div>;
  }
  const useWords = (request: AcceptedRequest): void => { void perform(() => controllerRef.current.useWords(request)); };
  const viewSources = (request: AcceptedRequest): void => { const ids = request.snapshot.inputs.flatMap(input => input.state === "resolved" && input.role !== "mask" ? [input.versionId] : []); if (ids.length === 1 && ids[0]) { setInspectedRequest(undefined); setViewerOrigin("conversation"); controller.viewMedia(ids[0]); setPane("viewer"); } else { setSourceVersionIds(ids); showView("media"); } };
  const hideFromMedia = (request: AcceptedRequest): void => { void perform(async () => { for (const slot of request.slots) if (slot.versionId) { const updated = await mediaActions.change(slot.versionId, { hidden: true }); if (scopeAlive.current) controller.updateMedia(updated); } }); };
  /** A deliberate jump to one request leaves the end; reaching the end again resumes following. */
  const revealRequest = (requestId: string, behavior: ScrollBehavior): void => {
    const stage = feedStage.current;
    followingFeed.current = false;
    if (stage) feedGeometry.current = { height: stage.scrollHeight, client: stage.clientHeight };
    document.getElementById(`vf-request-${requestId}`)?.scrollIntoView({ block: "start", behavior });
  };
  const statusNotices = <>
    {controller.loading ? <p className="vf-notice" role="status">Opening saved work…</p> : null}
    {controller.error ? <div className="vf-notice" role="status"><p>{controller.error}</p>{loadProblemAction}</div> : null}
    {actionError ? <div className="vf-notice" role="alert"><p>{actionError}</p><FreshButton tone="quiet" onClick={() => setActionError(undefined)}>Dismiss</FreshButton></div> : null}
    {controller.resourceErrors.length ? <div className="vf-notice" role="status">{controller.resourceErrors.map(problem => <p key={problem}>{problem}</p>)}<FreshButton onClick={controller.reload}>Retry loading missing work</FreshButton></div> : null}
    {controller.deviceCopies.length ? <FreshButton tone="quiet" onClick={() => setPanel("recovery")}>Review {controller.deviceCopies.length} retained device {controller.deviceCopies.length === 1 ? "copy" : "copies"}</FreshButton> : null}
    {areaDroppedNotice}
    {failedInput ? <WorkspaceNotice title="The image for this draft could not be made" message="Choose an input or reuse the original setup." actionLabel="Choose input" onAction={() => requestInput(failedInput.role, failedInput)} /> : controller.serviceUnavailable ? <WorkspaceNotice title="New requests are temporarily unavailable" message="The service is at capacity" actionLabel="Check again" onAction={controller.reload} /> : offline ? <WorkspaceNotice title="You are offline" message={active?.retention.onDevice ? "Changes are saved on this device" : "Keep your latest work before leaving"} actionLabel="View history" onAction={() => showView("conversations")} /> : controller.conversation?.status === "archived" ? <WorkspaceNotice title="This conversation is archived" message="Restore it to make changes." actionLabel="Restore" onAction={() => { const conversation = controller.conversation; if (conversation) void perform(async () => { const updated = await managementApi.changeConversation(projectId, conversation.id, { expectedRevision: conversation.revision, status: "active" }); if (scopeAlive.current) controller.observeConversation(updated); }); }} /> : null}
  </>;
  const readOnly = controller.project?.status !== "active" || controller.conversation?.status !== "active";
  const feedVersions = controller.view.requests.flatMap(request => request.slots.flatMap(slot => slot.versionId && controller.media.some(version => version.id === slot.versionId) ? [slot.versionId] : []));
  const focusIndex = selected ? feedVersions.indexOf(selected.id) : -1;
  const focusRequest = selected ? controller.view.requests.find(request => request.slots.some(slot => slot.versionId === selected.id)) : undefined;
  const selectedRequestId = jumpedRequestId ?? controller.view.requests.find(request => request.slots.some(slot => slot.versionId && slot.versionId === selected?.id))?.id ?? controller.view.requests.at(-1)?.id;
  // Focus carries its own copy of the rail; the one under it marks nothing, so one item is current.
  const historyRail = (current: string | undefined): ReactElement => <HistoryRail requests={controller.view.requests} media={controller.media} profiles={controller.profiles} selectedRequestId={current} access={access} onSelect={request => {
    const versionId = request.slots.find(slot => slot.versionId && controller.media.some(version => version.id === slot.versionId))?.versionId;
    if (focusOpen && versionId) { controller.viewMedia(versionId); return; }
    setJumpedRequestId(request.id);
    revealRequest(request.id, "smooth");
    // A linked request was a one-time jump; a reload must not jump back to it.
    if (search.has("request")) { const next = new URLSearchParams(search); next.delete("request"); setSearch(next, { replace: true }); }
  }} />;
  const feedLayout = <div className="vf vf-workspace vf-feed-workspace" data-workspace-entry={entryWorkingCopy ? entryBinding?.kind : undefined} data-library={libraryOpen || undefined} data-focus={focusOpen || inlineVideo || undefined} data-versions={versionsOpen || undefined} style={{ "--vf-composer-height": `${composerHeight}px` } as CSSProperties}>
    {renderRail(libraryOpen ? "media" : "create")}
    {libraryOpen ? <ProjectMediaLibrary ownerId={ownerId} projectId={projectId} versions={sourceVersionIds ? listedMedia.filter(version => sourceVersionIds.includes(version.id)) : listedMedia} imports={imports} onChange={controller.updateMedia} selectedVersionId={selected?.id} {...(selected && !readOnly ? { actionBar: <>{resultActions(selected).map(verb => <FreshButton key={verb.label} tone="quiet" className="vf-generation-verb" disabled={verb.disabled} onClick={() => verb.run(0)}>{verb.label}</FreshButton>)}<span className="vf-action-bar-divider" aria-hidden="true" /><FreshIconButton icon="download" label="Download original" onClick={() => download(selected)} /></> } : {})} onOpen={version => { setInspectedRequest(undefined); setViewerOrigin("media"); controller.viewMedia(version.id); setFocusOpen(true); }} onEdit={edit} onCreate={() => { void perform(() => newDraft("make-video")); }} readonly={controller.project?.status !== "active"} loading={controller.loading} loadError={controller.error ?? controller.resources.media.message} onReload={controller.reload} onProjects={() => { void navigateSafely("/app/projects"); }} onOptions={() => setPanel("options")} /> : <>
      {historyRail(focusOpen ? undefined : selectedRequestId)}
      <main ref={feedStage} className="vf-feed-stage" aria-label={controller.conversation?.name ?? "Conversation"} onScroll={event => {
        const node = event.currentTarget; const previous = feedGeometry.current;
        const resized = previous.height !== node.scrollHeight || previous.client !== node.clientHeight;
        feedGeometry.current = { height: node.scrollHeight, client: node.clientHeight };
        if (resized && followingFeed.current) { node.scrollTop = node.scrollHeight; return; }
        followingFeed.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
      }}>
        <div className="vf-feed-column">
          {/* A conversation with nothing made yet still says which one it is. */}
          {!controller.loading && controller.conversation && !controller.view.requests.length && !controller.submissions.length ? <h1 className="vf-feed-empty">{controller.conversation.name}</h1> : null}
          <GenerationFeed requests={controller.view.requests} media={controller.media} profiles={controller.profiles} pending={controller.submissions} viewedVersionId={controller.view.viewedVersionId} access={access} readOnly={readOnly} onOpen={openFocus} onVerb={runVerb} onDownload={download} onRetry={(request, slot) => { void controller.retryRequest(request, slot); }} onRecover={submission => { void controller.recover(submission); }} onApplyText={(request, text) => { void perform(() => controller.applyText(request, text)); }} onCaptionsToVideo={captionsToVideo} onReuseSetup={request => { void perform(() => reuseRequest(request)); }} onNewVariation={request => { void perform(() => reuseRequest(request, true)); }} onUseWords={useWords} onViewSources={viewSources} onViewVersions={request => { const id = request.slots.find(slot => slot.versionId === selected?.id)?.versionId ?? request.slots.find(slot => slot.versionId)?.versionId; if (id) { setInspectedRequest(undefined); controller.viewMedia(id); setVersionsOpen(true); } }} onHideFromMedia={hideFromMedia} />
        </div>
      </main>
      {/* Notices sit on the composer, where the creator is looking, never at the top of a feed that opens at its end. */}
      <div ref={composerDock} className="vf-feed-composer"><div className="vf-feed-notices">{statusNotices}</div>{active?.record.status === "submitted" ? <FreshButton className="vf-new-draft" onClick={() => { void perform(() => controller.newDraft(active.content.action)); }}>New draft</FreshButton> : null}{renderComposer()}</div>
    </>}
    {versionsOpen ? <VersionsPanel versions={controller.media} selectedVersionId={selected?.id} {...(preferred ? { preferredVersionId: preferred } : {})} requests={controller.view.requests} access={access} readOnly={readOnly} canVary={version => version.origin.kind === "generated" && controller.view.requests.some(request => request.id === (version.origin.kind === "generated" ? version.origin.requestId : ""))} onView={id => { setInspectedRequest(undefined); controller.viewMedia(id); }} onClose={() => setVersionsOpen(false)} onPreferred={makePreferred} onVariation={version => { if (version.origin.kind === "generated") { const requestId = version.origin.requestId; const request = controller.view.requests.find(row => row.id === requestId); if (request) void perform(() => reuseRequest(request, true)); } }} onEdit={edit} /> : null}
    {(focusOpen && (selected || panel === "area")) || inlineVideo ? <FocusView rail={inlineVideo || viewerOrigin === "media" ? null : historyRail(selectedRequestId)} viewedId={selected?.id} onClose={() => {
      if (inlineVideo) showView(); if (panel === "area") setPanel("none"); setFocusOpen(false);
      if (viewerOrigin === "media") { showView("media"); return; }
      // The feed returns to the result Focus ended on, which the history rail already highlights.
      const target = focusRequest?.id;
      if (target) requestAnimationFrame(() => revealRequest(target, "auto"));
    }} {...(!inlineVideo && focusIndex > 0 ? { onPrevious: () => controller.viewMedia(feedVersions[focusIndex - 1] ?? "") } : {})} {...(!inlineVideo && focusIndex >= 0 && focusIndex < feedVersions.length - 1 ? { onNext: () => controller.viewMedia(feedVersions[focusIndex + 1] ?? "") } : {})}>{inlineVideo ? <div className="vf-inline-editor">{renderEditor("embedded")}</div> : <>{renderViewer()}{focusRequest && panel !== "area" ? <div className="vf-focus-caption"><p>{focusRequest.snapshot.instructions || selected?.label}</p><p>{requestHistoryDescription(focusRequest, controller.profiles)}</p></div> : null}</>}</FocusView> : null}
    {options}{sharing}
    {savedImport ? <SavedImportSheet ownerId={ownerId} projectId={projectId} projectName={controller.project?.name ?? "this project"} version={savedImport} access={access} readOnly={readOnly || !active || !["open", "parked"].includes(active.record.status)} onClose={() => { const next = new URLSearchParams(search); next.delete("savedImport"); setSearch(next, { replace: true }); }} onUseInput={version => { controller.applyMediaInput(version); const next = new URLSearchParams(search); next.delete("savedImport"); next.delete("view"); setSearch(next, { replace: true }); }} /> : null}
    {workspaceDialog}
  </div>;
  if (!isMobile) return feedLayout;
  return <div className="vf vf-workspace" data-workspace-entry={entryWorkingCopy ? entryBinding?.kind : undefined} data-mobile-pane={pane} data-library={libraryOpen || undefined} data-area={panel === "area" || undefined} data-mobile-preview={mobilePreviewKind} data-versions={versionsOpen || undefined} data-empty={!libraryOpen && !inlineVideo && !controller.view.requests.length && !controller.submissions.length && !selected || undefined}>
    {renderRail(libraryOpen || selected && (viewerOrigin === "media" || isMobile && pane === "viewer") ? "media" : "create")}
    {libraryOpen ? <ProjectMediaLibrary ownerId={ownerId} projectId={projectId} versions={sourceVersionIds ? listedMedia.filter(version => sourceVersionIds.includes(version.id)) : listedMedia} imports={imports} onChange={controller.updateMedia} onOpen={version => { setInspectedRequest(undefined); setViewerOrigin("media"); controller.viewMedia(version.id); setPane("viewer"); showView(); }} onEdit={edit} onCreate={() => { void perform(() => newDraft("make-video")); }} readonly={controller.project?.status !== "active"} loading={controller.loading} loadError={controller.error ?? controller.resources.media.message} onReload={controller.reload} onProjects={() => { void navigateSafely("/app/projects"); }} onOptions={() => setPanel("options")} /> : null}
    <header className="vf-project-bar"><FreshIconButton icon="folder" label="Project options" onClick={() => setPanel("options")} /><div className="vf-flex" />{controller.view.requests.length || selected ? <FreshIconButton icon="more" label="More project options" onClick={() => setPanel("options")} /> : null}</header>
    <aside className="vf-conversation">
      {controller.loading ? <p className="vf-notice" role="status">Opening saved work…</p> : null}
      {controller.error ? <div className="vf-notice" role="status"><p>{controller.error}</p>{loadProblemAction}</div> : null}
      {actionError ? <div className="vf-notice" role="alert"><p>{actionError}</p><FreshButton tone="quiet" onClick={() => setActionError(undefined)}>Dismiss</FreshButton></div> : null}
      {controller.resourceErrors.length ? <div className="vf-notice" role="status">{controller.resourceErrors.map(problem => <p key={problem}>{problem}</p>)}<FreshButton onClick={controller.reload}>Retry loading missing work</FreshButton></div> : null}
      {controller.deviceCopies.length ? <FreshButton tone="quiet" onClick={() => setPanel("recovery")}>Review {controller.deviceCopies.length} retained device {controller.deviceCopies.length === 1 ? "copy" : "copies"}</FreshButton> : null}
      {areaDroppedNotice}
      <ConversationHistory readOnly={controller.project?.status !== "active" || controller.conversation?.status !== "active"} onInspectRequest={request => { setInspectedRequest({ conversationId: request.conversationId, requestId: request.id }); if (inlineVideo) setInspectingVideo(true); setVersionsOpen(false); setPane("viewer"); }} requests={controller.view.requests} media={controller.media} selected={controller.view.viewedVersionId} pending={controller.submissions} access={access} onView={id => { setInspectedRequest(undefined); setViewerOrigin("conversation"); controller.viewMedia(id); setPane("viewer"); if (inlineVideo) setInspectingVideo(true); }} onRecover={submission => { void controller.recover(submission); }} onRetry={(request, slot) => { void controller.retryRequest(request, slot); }} onReuseSetup={request => { void perform(() => reuseRequest(request)); }} onApplyText={(request, text) => { void perform(() => controller.applyText(request, text)); }} {...(newlyReadyVersionId ? { newlyReadyVersionId } : {})} onNewVariation={request => { void perform(() => reuseRequest(request, true)); }} onUseWords={useWords} onViewSources={viewSources} onViewVersions={request => { const id = request.slots.find(slot => slot.versionId === selected?.id)?.versionId ?? request.slots.find(slot => slot.versionId)?.versionId; if (id) { setInspectedRequest(undefined); controller.viewMedia(id); setVersionsOpen(true); setPane("viewer"); } }} onHideFromMedia={hideFromMedia} {...(!isMobile ? { describeRequest: (request: AcceptedRequest) => requestHistoryDescription(request, controller.profiles) } : {})} />
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
  const location = useLocation();
  const browsing = location.pathname === "/app/projects";
  const project = ProjectIdSchema.safeParse(params.projectId ?? search.get("project"));
  const openProject = (id: string): void => { if (!user) return; const next = new URLSearchParams(search); next.delete("project"); const target = { ownerId: user.uid, projectId: id }; navigate(`/app/project/${encodeURIComponent(id)}${next.size ? `?${next}` : ""}`, { state: reopenWorkspaceState(target) }); };
  if (!resolved) return <SystemRoutePage state="loading" />;
  // Saved projects, conversations and views need their owner, so a signed-out visitor signs in first; anyone can start writing a request.
  const savedWork = search.has("conversation") || WORKSPACE_VIEWS.includes(search.get("view") ?? "");
  if (!user) return project.success || browsing || savedWork ? <Navigate to={`/signin?redirect=${encodeURIComponent(`${location.pathname}${location.search}`)}`} replace /> : <GuestWorkspace />;
  if (project.success) return <OwnedWorkspace key={`${user.uid}:${project.data}`} ownerId={user.uid} projectId={project.data} />;
  if (browsing) return <ProjectBrowser key={user.uid} ownerId={user.uid} onOpen={openProject} onOpenFolder={id => navigate(`/app?folder=${encodeURIComponent(id)}`)} />;
  return <LibraryWorkspace key={user.uid} ownerId={user.uid} />;
}
