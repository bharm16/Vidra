import React, {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { VIDEO_DRAFT_MODEL } from "@/components/ToolSidebar/config/modelConfig";
import type { AssetSuggestion } from "@/features/assets/hooks/useTriggerAutocomplete";
import type { CameraPath } from "@/features/convergence/types";
import {
  useGenerationControlsStoreActions,
  useGenerationControlsStoreState,
} from "@features/generation-controls";
import { useOptionalPromptHighlights } from "@/features/prompt-optimizer/context/PromptStateContext";
import {
  useRegisterPersistenceTarget,
  type PersistenceTarget,
} from "@/features/idea-box";
import { useWorkspaceSession } from "@/features/prompt-optimizer/context/WorkspaceSessionContext";
import { useGenerationsRuntime } from "@features/generations";
import type {
  Generation,
  GenerationsPanelProps,
  GenerationsPanelStateSnapshot,
} from "@features/generations/types";
import type {
  InlineSuggestion,
  SuggestionItem,
} from "@/features/prompt-optimizer/PromptCanvas/types";
import { trackModelRecommendationEvent } from "@/features/model-intelligence/api";
import { useModelSelectionRecommendation } from "@/components/ToolSidebar/components/panels/GenerationControlsPanel/hooks/useModelSelectionRecommendation";
import { useSidebarGenerationDomain } from "@/components/ToolSidebar/context";
import { GenerationPopover } from "@/features/prompt-optimizer/components/GenerationPopover";
import { cn } from "@/utils/cn";
import {
  AmbientLight,
  DottedGrid,
  Grain,
  Vignette,
} from "@/components/atmosphere";
import { NavRail } from "@/components/navigation/NavRail";
import { buildGalleryGenerationEntries } from "./utils/galleryGeneration";
import { deriveWorkspaceStage } from "./utils/deriveWorkspaceStage";
import { computeWorkspaceArtifacts } from "./utils/computeWorkspaceArtifacts";
import { groupShots } from "./utils/groupShots";
import { useFeaturedTile } from "./hooks/useFeaturedTile";
import { useWorkspaceKeyboardShortcuts } from "./hooks/useWorkspaceKeyboardShortcuts";
import { useAnchorDraft } from "./hooks/useAnchorDraft";
import { ShotRow } from "./components/ShotRow";
import { ShotDivider } from "./components/ShotDivider";
import { TileStateAnnouncer } from "./components/TileStateAnnouncer";
import { FEATURES } from "@/config/features.config";
import {
  usePromptResultsActions,
  usePromptResultsData,
} from "@/features/prompt-optimizer/context/PromptResultsActionsContext";
import { WorkspaceTopBar } from "./components/WorkspaceTopBar";
import { FrameStage } from "./components/FrameStage";
import { CanvasPromptBar } from "./components/CanvasPromptBar";
import { useComposerFocus } from "./hooks/useComposerFocus";
import { CanvasSettingsRow } from "./components/CanvasSettingsRow";
import { YourWordsChip } from "./components/YourWordsChip";
import { FailureNotice } from "./components/FailureNotice";
import { TheSpace } from "@/features/space/components/TheSpace";
import { CanvasViewport } from "@/components/canvas/CanvasViewport";
import { SpaceNodeMenu } from "@/features/space/components/SpaceNodeMenu";
import { deriveSpaceNodesFromVersions } from "@/features/space/lineage/deriveSpaceNodes";
import { resolveWordsForNode } from "@/features/space/lineage/resolveWordsForNode";
import { nonLeafIds, isRemovableLeaf } from "@/features/space/lineage/leaf";
import { createShare } from "@/features/share/api/createShare";
import { useToast } from "@components/Toast";
import type { SpaceNode } from "@/features/space/lineage/types";
import { archiveGeneration } from "@/features/space/api/spaceApi";
import type { PromptEditorSurfaceProps } from "./components/PromptEditorSurface";

// Lazy-loaded so the Three.js bundle (~120 KB compressed, only used inside
// CameraMotionModal's renderer) stays out of the workspace landing chunk.
const CameraMotionModal = lazy(() =>
  import("@/components/modals/CameraMotionModal").then((m) => ({
    default: m.CameraMotionModal,
  })),
);

interface CanvasWorkspaceProps {
  generationsPanelProps: GenerationsPanelProps;
  copied: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onCopy: () => void;
  onShare: () => void;
  onUndo: () => void;
  onRedo: () => void;
  editorRef: React.RefObject<HTMLDivElement>;
  onTextSelection: (event: React.MouseEvent<HTMLDivElement>) => void;
  onHighlightClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  onHighlightMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  onHighlightMouseEnter: (event: React.MouseEvent<HTMLDivElement>) => void;
  onHighlightMouseLeave: (event: React.MouseEvent<HTMLDivElement>) => void;
  onCopyEvent: (event: React.ClipboardEvent<HTMLDivElement>) => void;
  onInput: (event: React.FormEvent<HTMLDivElement>) => void;
  onEditorKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onEditorBlur: (event: React.FocusEvent<HTMLDivElement>) => void;
  autocompleteOpen: boolean;
  autocompleteSuggestions: AssetSuggestion[];
  autocompleteSelectedIndex: number;
  autocompletePosition: { top: number; left: number };
  autocompleteLoading: boolean;
  onAutocompleteSelect: (asset: AssetSuggestion) => void;
  onAutocompleteClose: () => void;
  onAutocompleteIndexChange: (index: number) => void;
  onReuseGeneration: (generation: Generation) => void;
  onToggleGenerationFavorite: (
    generationId: string,
    isFavorite: boolean,
  ) => void;
}

const parseDurationSeconds = (
  generationParams: Record<string, unknown>,
): number => {
  const value = generationParams.duration_s;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 5;
};

export function CanvasWorkspace({
  generationsPanelProps,
  editorRef,
  onTextSelection,
  onHighlightClick,
  onHighlightMouseDown,
  onHighlightMouseEnter,
  onHighlightMouseLeave,
  onCopyEvent,
  onInput,
  onEditorKeyDown,
  onEditorBlur,
  autocompleteOpen,
  autocompleteSuggestions,
  autocompleteSelectedIndex,
  autocompletePosition,
  autocompleteLoading,
  onAutocompleteSelect,
  onAutocompleteClose,
  onAutocompleteIndexChange,
  onReuseGeneration,
  onToggleGenerationFavorite,
}: CanvasWorkspaceProps): React.ReactElement {
  const storeActions = useGenerationControlsStoreActions();
  const { domain } = useGenerationControlsStoreState();
  const promptHighlights = useOptionalPromptHighlights();
  const { session, hasActiveContinuityShot, currentShot, updateShot } =
    useWorkspaceSession();
  const toast = useToast();
  const { onComposerFill, onIdeaBoxExpand } = usePromptResultsActions();

  // M5 D4: publish the words-version a golden-path first frame should persist
  // onto. This lives here because the canvas owns version creation
  // (onCreateVersionIfNeeded) while useIdeaBox — which posts the frame — sits
  // above this subtree. Mints/reuses the version at frame time only; the
  // owner adds the session id (a route concern it already holds).
  const { onCreateVersionIfNeeded } = generationsPanelProps;
  const resolvePersistenceTarget = useCallback<() => PersistenceTarget>(() => {
    const versionId = onCreateVersionIfNeeded();
    return versionId ? { promptVersionId: versionId } : {};
  }, [onCreateVersionIfNeeded]);
  useRegisterPersistenceTarget(resolvePersistenceTarget);
  // Generation domain provides the upload handlers wired through to
  // CanvasSettingsRow's start-frame / video-reference popovers. Null when
  // SidebarDataContextProvider isn't mounted (tests, isolated stories).
  const generationDomain = useSidebarGenerationDomain();
  useWorkspaceKeyboardShortcuts();
  const [showCameraMotionModal, setShowCameraMotionModal] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const prompt = generationsPanelProps.prompt;
  const durationSeconds = parseDurationSeconds(
    domain.generationParams as Record<string, unknown>,
  );

  const {
    recommendationMode,
    modelRecommendation,
    recommendedModelId,
    efficientModelId,
    renderModelOptions,
    renderModelId,
    recommendationAgeMs,
  } = useModelSelectionRecommendation({
    prompt,
    activeTab: "video",
    keyframesCount: domain.startFrame ? 1 : 0,
    durationSeconds,
    selectedModel: domain.selectedModel,
    videoTier: domain.videoTier,
    promptHighlights: promptHighlights?.initialHighlights ?? null,
  });

  const handleModelChange = useCallback(
    (modelId: string): void => {
      const nextTier = modelId === VIDEO_DRAFT_MODEL.id ? "draft" : "render";
      if (modelId === domain.selectedModel) return;

      void trackModelRecommendationEvent({
        event: "model_selected",
        recommendationId: modelRecommendation?.promptId,
        promptId: modelRecommendation?.promptId,
        recommendedModelId,
        selectedModelId: modelId,
        mode: recommendationMode,
        durationSeconds,
        ...(typeof recommendationAgeMs === "number"
          ? {
              timeSinceRecommendationMs: Math.max(
                0,
                Math.round(recommendationAgeMs),
              ),
            }
          : {}),
      });

      storeActions.setSelectedModel(modelId);
      if (nextTier !== domain.videoTier) storeActions.setVideoTier(nextTier);

      if (
        hasActiveContinuityShot &&
        currentShot &&
        currentShot.modelId !== modelId
      ) {
        void updateShot(currentShot.id, { modelId });
      }
    },
    [
      currentShot,
      domain.selectedModel,
      domain.videoTier,
      durationSeconds,
      hasActiveContinuityShot,
      modelRecommendation?.promptId,
      recommendationAgeMs,
      recommendationMode,
      recommendedModelId,
      storeActions,
      updateShot,
    ],
  );

  const onStateSnapshotProp = generationsPanelProps.onStateSnapshot;
  const handleSnapshot = useCallback(
    (nextSnapshot: GenerationsPanelStateSnapshot) => {
      onStateSnapshotProp?.(nextSnapshot);
    },
    [onStateSnapshotProp],
  );

  const generationsRuntime = useGenerationsRuntime({
    ...generationsPanelProps,
    presentation: "hero",
    onStateSnapshot: handleSnapshot,
  });

  useEffect(() => {
    setViewingId(null);
  }, [generationsPanelProps.promptVersionId]);

  const heroGeneration = generationsRuntime.heroGeneration;

  // ADR-0015: the composer is bound to the words node's focus. Words are
  // focused by default while writing; a take steals focus the moment it
  // exists; the demoted chip is the manual way back.
  const { wordsFocused, focusedWordsId, focusWords, blurWords } =
    useComposerFocus(heroGeneration?.id ?? null);

  const galleryEntries = useMemo(() => {
    // When runtimeGenerations is empty (e.g., after po:workspace-reset), skip
    // version-based entries to prevent stale gallery items from a prior session
    // remaining visible during the transition to a new draft.
    const versions =
      generationsRuntime.generations.length === 0
        ? []
        : generationsPanelProps.versions;
    return buildGalleryGenerationEntries({
      versions,
      runtimeGenerations: generationsRuntime.generations,
    });
  }, [generationsPanelProps.versions, generationsRuntime.generations]);

  const galleryGenerations = useMemo(
    () => galleryEntries.map((entry) => entry.gallery),
    [galleryEntries],
  );

  const generationLookup = useMemo(() => {
    const lookup = new Map<string, Generation>();
    for (const entry of galleryEntries) {
      lookup.set(entry.generation.id, entry.generation);
    }
    return lookup;
  }, [galleryEntries]);

  const shotInputGenerations = useMemo(
    () => galleryEntries.map((entry) => entry.generation),
    [galleryEntries],
  );
  const shots = useMemo(
    () => groupShots(shotInputGenerations),
    [shotInputGenerations],
  );
  const featuredTile = useFeaturedTile({
    shots,
    heroGeneration: heroGeneration ?? null,
    currentPrompt: prompt,
  });

  useEffect(() => {
    if (!viewingId) return;
    if (generationLookup.has(viewingId)) return;
    setViewingId(null);
  }, [generationLookup, viewingId]);

  const handleSelectGeneration = useCallback((generationId: string): void => {
    setViewingId(generationId);
  }, []);

  const handleRetryTile = useCallback(
    (generationId: string): void => {
      const target = shots
        .flatMap((shot) => shot.tiles)
        .find((tile) => tile.id === generationId);
      if (target) generationsRuntime.handleRetry(target);
    },
    [shots, generationsRuntime],
  );

  // Pinned per render — stable enough for relative-time labels in this view
  // (timestamps update on the next orchestrator render, which happens on any
  // shot/tile change). Lifted here so ShotRow + formatRelative can be pure.
  const renderedAt = Date.now();

  const handleReuse = useCallback(
    (generationId: string): void => {
      const generation = generationLookup.get(generationId);
      if (!generation) return;
      onReuseGeneration(generation);
      setViewingId(null);
    },
    [generationLookup, onReuseGeneration],
  );
  const handleCameraMotionSelect = useCallback(
    (cameraPath: CameraPath): void => {
      storeActions.setCameraMotion(cameraPath);
      setShowCameraMotionModal(false);
    },
    [storeActions],
  );

  // Opens the camera-motion modal from the start-frame popover. Guarded on
  // domain.startFrame so the modal mount (which dereferences startFrame.url)
  // never sees a null start frame.
  const handleOpenMotion = useCallback((): void => {
    if (!domain.startFrame) return;
    setShowCameraMotionModal(true);
  }, [domain.startFrame]);

  // Pre-work: nothing has happened yet — no shots, no frame, loop idle, and
  // the session holds no expanded prompt. Unlike moment === "empty" this
  // survives focus and typing, so the hero stays on screen while the creator
  // answers it and the raised composer doesn't jump away from the cursor on
  // click. Once work starts (submit), the composer glides to its docked
  // position and the stage takes over. Every input here is session or loop
  // content — never transient UI state — so restored sessions with an
  // expanded prompt land on the FrameStage, and the hero cannot flicker when
  // panels like the suggestion tray open or close (CONTEXT.md, "First
  // frame": the frame or its empty/failed state owns the canvas).
  const { ideaBoxStage, isExpanding, hasExpandedPrompt, writingFailed } =
    usePromptResultsData();
  const workspaceStage = deriveWorkspaceStage(
    computeWorkspaceArtifacts({
      tiles: shots.flatMap((shot) => shot.tiles),
      ideaBoxStageKind: ideaBoxStage?.kind ?? "idle",
      isExpanding: isExpanding ?? false,
      hasExpandedPrompt: hasExpandedPrompt ?? false,
      hasStartFrame: Boolean(domain.startFrame),
      writingFailed: writingFailed ?? false,
    }),
  );
  const isPreWork = workspaceStage.stage === "empty";

  // Persist the front-door prompt across reloads (the session autosave only
  // covers post-submit words); restore replays through the editor's input path.
  useAnchorDraft({ isPreWork, prompt, editorRef });

  // "Your words" — once the one-liner has grown into the full description, offer
  // an explicit way back to the immutable original (SessionPrompt.input, D1).
  // Restoring refills the composer via onComposerFill (fill-only, never submit).
  const originalWords = (session?.prompt?.input ?? "").trim();
  const yourWordsSlot =
    hasExpandedPrompt && originalWords && onComposerFill ? (
      <div className="px-4 pt-2.5">
        <YourWordsChip
          originalWords={originalWords}
          onRestore={() => onComposerFill(originalWords)}
        />
      </div>
    ) : null;

  // The space (M5, ADR-0012/0013) — the session's takes as a lineage network,
  // behind FEATURES.SPACE_LINEAGE. Read from the PERSISTED versions so the
  // space survives reload and shows the full reword chain (each version's
  // synced generations become picture/clip nodes). Deliberately NOT gated on
  // an empty runtime the way the gallery is: on reload the runtime starts
  // empty but the persisted history is exactly what the space must render.
  // Optimistic removal set: a just-archived node is dropped from the space
  // immediately, before the server round-trip's archived:true lands on the
  // persisted record (which makes it durable across reloads).
  const [locallyArchivedIds, setLocallyArchivedIds] = useState<
    ReadonlySet<string>
  >(() => new Set());

  const spaceNodes = useMemo(() => {
    const nodes = deriveSpaceNodesFromVersions(generationsPanelProps.versions);
    if (locallyArchivedIds.size === 0) return nodes;
    return nodes.map((node) =>
      locallyArchivedIds.has(node.id) ? { ...node, archived: true } : node,
    );
  }, [generationsPanelProps.versions, locallyArchivedIds]);

  const spaceNonLeafIds = useMemo(() => nonLeafIds(spaceNodes), [spaceNodes]);

  // Take-restore-on-select (M5, ADR-0012): selecting a node refills the
  // composer with its paired words. Fill-only via onComposerFill — never
  // submits — so browsing the space stays read-only until the creator acts.
  const handleSelectSpaceNode = useCallback(
    (nodeId: string): void => {
      const words = resolveWordsForNode(nodeId, spaceNodes);
      if (words) onComposerFill?.(words);
      // ADR-0015: a words node takes focus (box opens); a take returns focus
      // to the media (box collapses). The fill happens either way.
      const node = spaceNodes.find((n) => n.id === nodeId);
      if (node?.kind === "words") focusWords(nodeId);
      else blurWords();
    },
    [spaceNodes, onComposerFill, focusWords, blurWords],
  );

  // Leaf-only removal (M5, ADR-0012). The server re-enforces the rule and
  // returns 409 for a non-leaf; a rejection leaves the node in place.
  const handleRemoveSpaceNode = useCallback(
    (node: SpaceNode): void => {
      const sessionId = session?.id;
      if (!sessionId) return;
      void archiveGeneration(sessionId, node.id)
        .then(() => setLocallyArchivedIds((prev) => new Set(prev).add(node.id)))
        .catch(() => {
          /* leaf conflict or network — the node stays */
        });
    },
    [session?.id],
  );

  // Animate (RULINGS §5): set a picture as the start frame, arming the video
  // loop from it. Its generationId rides through as sourceGenerationId (M5 2b)
  // so the resulting clip names this picture as its source.
  const handleAnimateSpaceNode = useCallback(
    (node: SpaceNode): void => {
      if (!node.mediaUrl) return;
      const words = resolveWordsForNode(node.id, spaceNodes);
      storeActions.setStartFrame({
        id: `space-animate-${node.id}`,
        url: node.mediaUrl,
        source: "generation",
        generationId: node.id,
        ...(words ? { sourcePrompt: words } : {}),
      });
    },
    [spaceNodes, storeActions],
  );

  // Download (RULINGS §5): reuse the gallery's download handler for the clip's
  // underlying generation record.
  const handleDownloadSpaceNode = useCallback(
    (node: SpaceNode): void => {
      const generation = generationLookup.get(node.id);
      if (generation) generationsRuntime.handleDownload(generation);
    },
    [generationLookup, generationsRuntime],
  );

  // Share (RULINGS §5, ADR-0010 D8): mint a public /share link for this clip
  // and copy it. The server verifies ownership; node.id is the generation id.
  const handleShareSpaceNode = useCallback(
    (node: SpaceNode): void => {
      const sessionId = session?.id;
      if (!sessionId) return;
      void createShare({ sessionId, generationId: node.id })
        .then((shareId) =>
          navigator.clipboard
            .writeText(`${window.location.origin}/share/${shareId}`)
            .then(() => toast.success("Share link copied")),
        )
        .catch(() => toast.error("Couldn't create a share link"));
    },
    [session?.id, toast],
  );

  const renderSpaceNodeMenu = useCallback(
    (node: SpaceNode): React.ReactNode => (
      <SpaceNodeMenu
        node={node}
        removable={isRemovableLeaf(node, spaceNonLeafIds)}
        onReword={(target) => handleSelectSpaceNode(target.id)}
        onRemove={handleRemoveSpaceNode}
        onAnimate={handleAnimateSpaceNode}
        onDownload={handleDownloadSpaceNode}
        onShare={handleShareSpaceNode}
      />
    ),
    [
      spaceNonLeafIds,
      handleSelectSpaceNode,
      handleRemoveSpaceNode,
      handleAnimateSpaceNode,
      handleDownloadSpaceNode,
      handleShareSpaceNode,
    ],
  );

  const surfaceProps: PromptEditorSurfaceProps = {
    editorRef,
    prompt,
    onTextSelection,
    onHighlightClick,
    onHighlightMouseDown,
    onHighlightMouseEnter,
    onHighlightMouseLeave,
    onCopyEvent,
    onInput,
    onEditorKeyDown,
    onEditorBlur,
    autocompleteOpen,
    autocompleteSuggestions,
    autocompleteSelectedIndex,
    autocompletePosition,
    autocompleteLoading,
    onAutocompleteSelect,
    onAutocompleteClose,
    onAutocompleteIndexChange,
  };

  const onStartFrameUpload = generationDomain?.onStartFrameUpload;
  const onUploadSidebarImage = generationDomain?.onUploadSidebarImage;
  const recommendationPromptId = modelRecommendation?.promptId;
  const hasGenerations = galleryEntries.length > 0;

  const chromeSlot = useMemo(
    () => (
      <div
        className={cn(
          isPreWork
            ? "mt-1"
            : wordsFocused
              ? "border-tool-rail-border border-t"
              : undefined,
        )}
      >
        <CanvasSettingsRow
          variant={isPreWork ? "sheet" : "docked"}
          prompt={prompt}
          renderModelId={renderModelId}
          renderModelOptions={renderModelOptions}
          modelRecommendation={modelRecommendation}
          {...(recommendedModelId ? { recommendedModelId } : {})}
          {...(efficientModelId ? { efficientModelId } : {})}
          {...(recommendationPromptId ? { recommendationPromptId } : {})}
          {...(recommendationMode ? { recommendationMode } : {})}
          {...(typeof recommendationAgeMs === "number"
            ? { recommendationAgeMs }
            : {})}
          onModelChange={handleModelChange}
          showPreviewButton={hasGenerations}
        />
      </div>
    ),
    [
      prompt,
      renderModelId,
      renderModelOptions,
      modelRecommendation,
      recommendedModelId,
      efficientModelId,
      recommendationPromptId,
      recommendationMode,
      recommendationAgeMs,
      handleModelChange,
      hasGenerations,
      isPreWork,
      wordsFocused,
    ],
  );

  // Fill-only starter pills below the Anchor sheet — clicking one loads the
  // composer (never submits), so editing stays explicit.
  const starterPillsSlot = isPreWork ? (
    <div
      className="mt-[26px] flex flex-wrap justify-center gap-[11px]"
      aria-label="Example prompts"
    >
      {STARTER_CHIPS.map((chip) => (
        <button
          key={chip}
          type="button"
          onClick={() => onComposerFill?.(chip)}
          className="text-tool-text-dim hover:text-foreground rounded-full border border-white/[0.10] bg-white/[0.03] px-[15px] py-[9px] text-sm backdrop-blur-[6px] transition-all hover:-translate-y-px hover:border-[color:var(--accent)] hover:bg-white/[0.06]"
        >
          {chip}
        </button>
      ))}
    </div>
  ) : null;

  // Continue Scene seeds the next render's start frame from the visible
  // poster of the source generation. Memoized so CanvasPromptBar's
  // listener-effect dep doesn't fire on every parent rerender.
  const handleContinueScene = useCallback(
    (fromGenerationId: string) => {
      const allTiles = shots.flatMap((shot) => shot.tiles);
      const target = allTiles.find((tile) => tile.id === fromGenerationId);
      if (!target) return;
      const frameUrl = target.thumbnailUrl ?? target.mediaUrls[0];
      if (!frameUrl) return;
      storeActions.setStartFrame({
        id: `continue-scene-${target.id}`,
        url: frameUrl,
        source: "generation",
        ...(target.prompt.trim() ? { sourcePrompt: target.prompt.trim() } : {}),
      });
    },
    [shots, storeActions],
  );

  return (
    <div className="text-foreground flex h-full overflow-hidden">
      {/* The nav rail is chrome for every workspace moment — hiding it on the
        empty state stranded the home page with no way to reach Library, the
        Live editor, or Account. */}
      <NavRail active="new" />
      <div
        className={cn(
          "relative isolate grid h-full min-w-0 flex-1 grid-rows-[var(--workspace-topbar-h)_1fr] overflow-hidden",
          "[background:var(--ps-bg)]",
        )}
        style={
          // Pre-work: the composer rises to mid-screen so the hero question and
          // its answer box read as one unit; it glides down once work starts.
          isPreWork
            ? ({
                "--workspace-composer-bottom": "40vh",
              } as React.CSSProperties)
            : undefined
        }
      >
        {/* Backdrop — the design-handoff atmosphere (ADR-0014). The empty state
          gets ambient light + grain behind + the anchor vignette over; the
          working canvas gets the dotted grid (behind content, negative z). */}
        {isPreWork ? (
          <>
            <AmbientLight />
            <Grain />
            <Vignette intensity="anchor" />
          </>
        ) : (
          <DottedGrid />
        )}
        <WorkspaceTopBar minimal={isPreWork} />
        <div className="grid min-h-0 grid-cols-1">
          <div className="relative min-h-0 overflow-y-auto scroll-smooth px-7 pb-[140px]">
            <TileStateAnnouncer shots={shots} />

            {isPreWork ? null : workspaceStage.failure === "writing" ? (
              // Expansion failed — surface it with a retry instead of a silently
              // dead composer (M4). Picture/motion/video failures keep their own
              // surfaces (FrameStage / tiles); the flag drives this one.
              <FailureNotice
                failure="writing"
                onRetry={() => void onIdeaBoxExpand?.()}
              />
            ) : shots.length === 0 ? (
              /* Pre-render beats: the first frame (or its pending/failed state)
               owns the canvas — see CONTEXT.md, "First frame". */
              <FrameStage startFrame={domain.startFrame} prompt={prompt} />
            ) : FEATURES.SPACE_LINEAGE ? (
              // The space (M5, ADR-0012/0013): the session's takes as a lineage
              // network. Off by default; replaces the shots grid when enabled.
              <CanvasViewport
                liveNodeId={heroGeneration?.id ?? null}
                onBackgroundClick={blurWords}
              >
                <TheSpace
                  nodes={spaceNodes}
                  liveNodeId={heroGeneration?.id ?? null}
                  focusedNodeId={focusedWordsId}
                  onSelectNode={handleSelectSpaceNode}
                  renderNodeMenu={renderSpaceNodeMenu}
                />
              </CanvasViewport>
            ) : (
              <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
                {shots.map((shot, idx) => (
                  <React.Fragment key={shot.id}>
                    <ShotRow
                      shot={shot}
                      now={renderedAt}
                      layout={idx === 0 ? "featured" : "compact"}
                      featuredTileId={
                        idx === 0 ? (featuredTile?.id ?? null) : null
                      }
                      onSelectTile={handleSelectGeneration}
                      onRetryTile={handleRetryTile}
                    />
                    {idx < shots.length - 1 && <ShotDivider />}
                  </React.Fragment>
                ))}
              </div>
            )}

            <CanvasPromptBar
              surfaceProps={surfaceProps}
              chromeSlot={chromeSlot}
              yourWordsSlot={yourWordsSlot}
              onContinueScene={handleContinueScene}
              isPreWork={isPreWork}
              footerSlot={starterPillsSlot}
              collapsed={!isPreWork && !wordsFocused}
            />
          </div>
        </div>

        {viewingId ? (
          <GenerationPopover
            generations={galleryGenerations}
            activeId={viewingId}
            onChange={setViewingId}
            onClose={() => setViewingId(null)}
            onReuse={handleReuse}
            onToggleFavorite={onToggleGenerationFavorite}
          />
        ) : null}

        {FEATURES.CONVERGENCE_UI && domain.startFrame ? (
          <Suspense fallback={null}>
            <CameraMotionModal
              isOpen={showCameraMotionModal}
              onClose={() => setShowCameraMotionModal(false)}
              imageUrl={domain.startFrame.url}
              imageStoragePath={domain.startFrame.storagePath ?? null}
              imageAssetId={domain.startFrame.assetId ?? null}
              initialSelection={domain.cameraMotion}
              onSelect={handleCameraMotionSelect}
            />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
}

const STARTER_CHIPS = [
  "A product hero shot",
  "A character in a scene",
  "An abstract loop",
  "B-roll establishing",
] as const;
