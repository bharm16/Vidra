import React, { useCallback, useEffect, useMemo, useState } from "react";
import { VIDEO_DRAFT_MODELS } from "@/components/ToolSidebar/config/modelConfig";
import {
  useGenerationControlsStoreActions,
  useGenerationControlsStoreState,
} from "@features/generation-controls";
import { useOptionalPromptServices } from "@/features/prompt-optimizer/context/PromptStateContext";
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
import { useVideoModelSelection } from "./hooks/useVideoModelSelection";
import { readTakeOrigin } from "@/features/generations/utils/serverOwnedRecordFields";
import { SelectedResult } from "./components/SelectedResult";
import { cn } from "@/utils/cn";
import { useCompactViewport } from "@/hooks/useCompactViewport";

import { NavRail } from "@/components/navigation/NavRail";
import { buildGalleryGenerationEntries } from "./utils/galleryGeneration";
import { deriveWorkspaceStage } from "./utils/deriveWorkspaceStage";
import { computeWorkspaceArtifacts } from "./utils/computeWorkspaceArtifacts";
import { groupShots } from "./utils/groupShots";
import { resolveTakePosterUrl } from "./utils/takePosterUrl";
import { useWorkspaceKeyboardShortcuts } from "./hooks/useWorkspaceKeyboardShortcuts";
import { useAnchorDraft } from "./hooks/useAnchorDraft";
import { TileStateAnnouncer } from "./components/TileStateAnnouncer";
import {
  usePromptResultsActions,
  usePromptResultsData,
} from "@/features/prompt-optimizer/context/PromptResultsActionsContext";
import { WorkspaceTopBar } from "./components/WorkspaceTopBar";
import { FrameStage } from "./components/FrameStage";
import { VideoComposer } from "./components/VideoComposer";
import { PromptEditorSurface } from "./components/PromptEditorSurface";
import { CanvasSettingsRow } from "./components/CanvasSettingsRow";
import { YourWordsChip } from "./components/YourWordsChip";
import { FailureNotice } from "./components/FailureNotice";
import { TheSpace } from "@/features/space/components/TheSpace";
import { CanvasViewport } from "@/components/canvas/CanvasViewport";
import { SpaceNodeMenu } from "@/features/space/components/SpaceNodeMenu";
import { deriveSpaceNodesFromVersions } from "@/features/space/lineage/deriveSpaceNodes";
import { resolveWordsForNode } from "@/features/space/lineage/resolveWordsForNode";
import { buildAnimateStartFrame } from "./utils/animateStartFrame";
import { nonLeafIds, isRemovableLeaf } from "@/features/space/lineage/leaf";
import { createShare } from "@/features/share/api/createShare";
import { createStudioProjectFromSessionPicture } from "@/features/studio/api/studioApi";
import { useToast } from "@components/Toast";
import { resolveMediaUrl } from "@/services/media/MediaUrlResolver";
import { downloadMedia } from "@/utils/downloadMedia";
import type { SpaceNode } from "@/features/space/lineage/types";
import { archiveGeneration } from "@/features/space/api/spaceApi";
import { ApiError } from "@/services/http/ApiError";
import type {
  PromptEditorWiring,
  PromptEditorSurfaceProps,
} from "./components/PromptEditorSurface";

interface CanvasWorkspaceProps {
  generationsPanelProps: GenerationsPanelProps;
  editing: PromptEditorWiring;
  onReuseGeneration: (generation: Generation) => void;
  onToggleGenerationFavorite: (
    generationId: string,
    isFavorite: boolean,
  ) => void;
  /**
   * Take the creator to a studio project (ADR-0022 decision 4). Supplied by
   * the route layer, which owns navigation — the workspace knows which project
   * to open, not how to get there. Absent means the studio bridge is not
   * wired, and "Refine in the studio" is not offered.
   */
  onOpenStudioProject?: (projectId: string) => void;
  onOpenSketch?: (() => void) | undefined;
}

export function CanvasWorkspace({
  generationsPanelProps,
  editing,
  onReuseGeneration,
  onToggleGenerationFavorite,
  onOpenStudioProject,
  onOpenSketch,
}: CanvasWorkspaceProps): React.ReactElement {
  const storeActions = useGenerationControlsStoreActions();
  const { domain } = useGenerationControlsStoreState();
  const promptServices = useOptionalPromptServices();
  const { session } = useWorkspaceSession();
  const toast = useToast();
  const { onComposerFill, onIdeaBoxExpand, onClearPendingReference } =
    usePromptResultsActions();

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
  useWorkspaceKeyboardShortcuts();
  const [viewingId, setViewingId] = useState<string | null>(null);
  const mobileLayout = useCompactViewport();

  const prompt = generationsPanelProps.prompt;
  const { renderModelOptions, renderModelId } = useVideoModelSelection({
    selectedModel: domain.selectedModel,
    videoTier: domain.videoTier,
  });

  const handleModelChange = useCallback(
    (modelId: string): void => {
      const nextTier = VIDEO_DRAFT_MODELS.some((model) => model.id === modelId)
        ? "draft"
        : "render";
      if (modelId === domain.selectedModel) return;
      storeActions.setSelectedModel(modelId);
      if (nextTier !== domain.videoTier) storeActions.setVideoTier(nextTier);
    },
    [domain.selectedModel, domain.videoTier, storeActions],
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
  }, [session?.id]);

  const heroGeneration = generationsRuntime.heroGeneration;

  const galleryEntries = useMemo(() => {
    // Versions flow in unconditionally: they are identity-gated at the
    // source (no working identity resolves to no entry, and "/" clears the
    // identity), so a fresh draft has no version entries by construction.
    // The old proxy guard — skip versions while runtimeGenerations is empty —
    // also killed the gallery for every HYDRATED session, where runtime is
    // legitimately empty and the persisted versions are the whole point:
    // completed clips became invisible and unplayable after reload.
    return buildGalleryGenerationEntries({
      versions: generationsPanelProps.versions,
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
  useEffect(() => {
    if (!viewingId) return;
    if (generationLookup.has(viewingId)) return;
    setViewingId(null);
  }, [generationLookup, viewingId]);

  const handleReuse = useCallback(
    (generationId: string): void => {
      const generation = generationLookup.get(generationId);
      if (!generation) return;
      onReuseGeneration(generation);
      setViewingId(null);
    },
    [generationLookup, onReuseGeneration],
  );
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
  const {
    ideaBoxStage,
    isExpanding,
    hasExpandedPrompt,
    writingFailed,
    pendingReference,
    unattachedFrameTake,
  } = usePromptResultsData();
  const workspaceStage = deriveWorkspaceStage(
    computeWorkspaceArtifacts({
      tiles: shots.flatMap((shot) => shot.tiles),
      ideaBoxStageKind: ideaBoxStage?.kind ?? "idle",
      isExpanding: isExpanding ?? false,
      hasExpandedPrompt: hasExpandedPrompt ?? false,
      hasStartFrame: Boolean(
        domain.startFrame || pendingReference || unattachedFrameTake,
      ),
      writingFailed: writingFailed ?? false,
    }),
  );
  const isPreWork = workspaceStage.stage === "empty";
  // An attached upload or an expansion attempt is still a setup. The first
  // actual generation opens the side editor; its draft subtree stays mounted.
  const beforeFirstGeneration = ![
    ...generationsPanelProps.versions.flatMap(
      (version) => version.generations ?? [],
    ),
    ...generationsRuntime.generations,
  ].some((generation) => readTakeOrigin(generation) !== "upload");

  // Persist the front-door prompt across reloads (the session autosave only
  // covers post-submit words); restore replays through the editor's input path.
  useAnchorDraft({ isPreWork, prompt, editorRef: editing.editorRef });

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

  // The space (M5, ADR-0012/0013) — the session's takes as a lineage network.
  // Read from the PERSISTED versions so the
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

  useEffect(() => {
    if (
      viewingId &&
      spaceNodes.some((node) => node.id === viewingId && node.archived)
    )
      setViewingId(null);
  }, [spaceNodes, viewingId]);

  const generationRows = useMemo(() => {
    const records = new Map(
      [
        ...generationsPanelProps.versions.flatMap(
          (version) => version.generations ?? [],
        ),
        ...generationsRuntime.generations,
      ].map((generation) => [generation.id, generation]),
    );
    const ordered = spaceNodes
      .filter((node) => node.kind !== "words" && !node.archived)
      .sort(
        (left, right) =>
          (records.get(left.id)?.createdAt ?? 0) -
          (records.get(right.id)?.createdAt ?? 0),
      );
    const groups = new Map<string, string[]>();
    for (const node of ordered) {
      const dispatchId = records.get(node.id)?.jobId || node.id;
      const group = groups.get(dispatchId) ?? [];
      group.push(node.id);
      groups.set(dispatchId, group);
    }
    return [...groups.values()];
  }, [
    generationsPanelProps.versions,
    generationsRuntime.generations,
    spaceNodes,
  ]);

  const spaceNonLeafIds = useMemo(() => nonLeafIds(spaceNodes), [spaceNodes]);

  // Take-restore (M5, ADR-0012): refill the composer with a node's paired
  // words. Fill-only via onComposerFill — never submits — so browsing the
  // space stays read-only until the creator acts.
  const restoreTakeWords = useCallback(
    (nodeId: string): void => {
      const words = resolveWordsForNode(nodeId, spaceNodes);
      if (words) onComposerFill?.(words);
    },
    [spaceNodes, onComposerFill],
  );

  // Open a media take in the viewer — a clip PLAYS, a picture shows
  // full-size. Read-only browsing (UX rule 1): the popover never touches
  // the working prompt.
  const viewSpaceNode = useCallback(
    (nodeId: string): void => {
      if (generationLookup.has(nodeId)) {
        setViewingId(nodeId);
      }
    },
    [generationLookup],
  );

  const handleSelectSpaceNode = viewSpaceNode;

  // Leaf-only removal (M5, ADR-0012). The server re-enforces the rule and
  // returns 409 for a non-leaf; a rejection leaves the node in place.
  const handleRemoveSpaceNode = useCallback(
    (node: SpaceNode): void => {
      const sessionId = session?.id;
      if (!sessionId) return;
      void archiveGeneration(sessionId, node.id)
        .then(() => {
          setLocallyArchivedIds((prev) => new Set(prev).add(node.id));
          setViewingId((current) => (current === node.id ? null : current));
        })
        .catch((error: unknown) => {
          // The node stays put — locallyArchivedIds is only added to on
          // success — and, like the neighbouring share and studio actions,
          // the creator is told rather than left guessing. A 409 is the
          // leaf-only rule (a child attached since the menu opened); anything
          // else is a conflict or the network.
          toast.error(
            error instanceof ApiError && error.status === 409
              ? "Only a childless node can be removed"
              : "Couldn't remove this node",
          );
        });
    },
    [session?.id, toast],
  );

  // Animate (RULINGS §5): set a picture as the start frame, arming the video
  // loop from it. Its generationId rides through as sourceGenerationId (M5 2b)
  // so the resulting clip names this picture as its source.
  const handleAnimateSpaceNode = useCallback(
    (node: SpaceNode): void => {
      const words = resolveWordsForNode(node.id, spaceNodes);
      // Issue #125: arm the durable handle, not just the URL, so an expired
      // node still animates. `null` means there was nothing to arm.
      const startFrame = buildAnimateStartFrame(node, words);
      if (!startFrame) return;
      storeActions.setStartFrame(startFrame);
    },
    [spaceNodes, storeActions],
  );

  // Download (RULINGS §5): reuse the gallery's download handler for the clip's
  // underlying generation record.
  const handleDownloadSpaceNode = useCallback(
    (node: SpaceNode): void => {
      const result = galleryGenerations.find((entry) => entry.id === node.id);
      if (!result) return;
      void resolveMediaUrl({
        kind: result.mediaType === "video" ? "video" : "image",
        url: result.mediaUrl,
        storagePath: node.storagePath ?? null,
        assetId: result.mediaAssetId ?? node.assetId ?? null,
        preferFresh: true,
      })
        .then((media) => {
          if (media.url) downloadMedia(media.url);
          else toast.error("Media unavailable");
        })
        .catch(() => toast.error("Couldn't download this result"));
    },
    [galleryGenerations, toast],
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

  // Refine in the studio (ADR-0022 decision 4): birth a studio project from
  // this picture and go there. The session picture is not touched — the
  // project works on its own durable copy, and records the session,
  // words-version and take identity it was born from. node.id is the take
  // identity; the server reads the words-version out of the session.
  const handleRefineSpaceNode = useCallback(
    (node: SpaceNode): void => {
      const sessionId = session?.id;
      if (!sessionId || !onOpenStudioProject) return;
      void createStudioProjectFromSessionPicture({
        sessionId,
        generationId: node.id,
      })
        .then((project) => onOpenStudioProject(project.id))
        .catch(() => toast.error("Couldn't open this picture in the studio"));
    },
    [session?.id, onOpenStudioProject, toast],
  );

  const renderSpaceNodeMenu = useCallback(
    (node: SpaceNode, onFullscreen?: () => void): React.ReactNode => (
      <SpaceNodeMenu
        node={node}
        removable={isRemovableLeaf(node, spaceNonLeafIds)}
        onReword={(target) => restoreTakeWords(target.id)}
        onRemove={handleRemoveSpaceNode}
        onAnimate={handleAnimateSpaceNode}
        {...(onOpenStudioProject && session?.id
          ? { onRefine: handleRefineSpaceNode }
          : {})}
        onDownload={handleDownloadSpaceNode}
        onShare={handleShareSpaceNode}
        onView={onFullscreen ? undefined : (target) => viewSpaceNode(target.id)}
        onFullscreen={onFullscreen}
        onCloseView={onFullscreen ? () => setViewingId(null) : undefined}
      />
    ),
    [
      spaceNonLeafIds,
      restoreTakeWords,
      viewSpaceNode,
      handleRemoveSpaceNode,
      handleAnimateSpaceNode,
      handleRefineSpaceNode,
      onOpenStudioProject,
      session?.id,
      handleDownloadSpaceNode,
      handleShareSpaceNode,
    ],
  );

  const surfaceProps: PromptEditorSurfaceProps = editing;

  const composer = (
    <CanvasSettingsRow
      prompt={prompt}
      hasPendingReference={Boolean(pendingReference)}
      pendingReference={pendingReference}
      onClearPendingReference={onClearPendingReference}
      isReferenceUploading={pendingReference?.uploading ?? false}
      isExpanding={isExpanding ?? false}
      renderModelId={renderModelId}
      renderModelOptions={renderModelOptions}
      onModelChange={handleModelChange}
      onOpenSketch={onOpenSketch}
      renderComposer={(slots) => (
        <VideoComposer
          {...slots}
          layout={
            mobileLayout ? "mobile" : beforeFirstGeneration ? "new" : "ongoing"
          }
          writing={<PromptEditorSurface {...surfaceProps} variant="composer" />}
        />
      )}
    />
  );

  // Fill-only starter pills below the Anchor sheet — clicking one loads the
  // composer (never submits), so editing stays explicit.
  const starterPillsSlot = isPreWork ? (
    <div
      className="mt-6 flex flex-wrap justify-start gap-2"
      aria-label="Example prompts"
    >
      {STARTER_CHIPS.map((chip) => (
        <button
          key={chip}
          type="button"
          onClick={() => onComposerFill?.(chip)}
          className="ps-btn ps-btn--md ps-btn--pill"
        >
          {chip}
        </button>
      ))}
    </div>
  ) : null;

  const selectedNode = spaceNodes.find((node) => node.id === viewingId);
  const renderSelectedResult = (): React.ReactNode => {
    if (!viewingId) return null;
    const result = galleryGenerations.find((entry) => entry.id === viewingId);
    const generation = generationLookup.get(viewingId);
    if (!result || !generation) return null;
    return (
      <SelectedResult
        key={viewingId}
        generation={result}
        onClose={() => setViewingId(null)}
        onReuse={() => handleReuse(viewingId)}
        onToggleFavorite={(favorite) =>
          onToggleGenerationFavorite(viewingId, favorite)
        }
        onDownload={downloadMedia}
        renderTakeMenu={
          selectedNode
            ? (onFullscreen) => renderSpaceNodeMenu(selectedNode, onFullscreen)
            : undefined
        }
        onShare={
          selectedNode && selectedNode.kind === "clip" && session?.id
            ? () => handleShareSpaceNode(selectedNode)
            : undefined
        }
      />
    );
  };

  return (
    <div className="text-foreground flex h-full overflow-hidden">
      {/* The nav rail is chrome for every workspace moment — hiding it on the
        empty state stranded the home page with no way to reach Library, the
        Live editor, or Account. */}
      <NavRail active="new" />
      <div
        className={cn(
          "relative isolate grid h-full min-w-0 flex-1 grid-rows-[var(--workspace-topbar-h)_1fr] overflow-hidden",
          "bg-black",
        )}
        style={
          // Pre-work: the composer rises to mid-screen so the hero question and
          // its answer box read as one unit; it glides down once work starts.
          //
          // The offset centers the block (composer + starter chips, ~248 tall)
          // in the viewport and then lifts it a deliberate 32px — optical
          // centering reads better than true centering for a single focal
          // element. The previous 40vh produced a 38px lift at exactly one
          // viewport height and drifted everywhere else.
          //
          // The half-topbar term is not a fudge: this element's containing
          // block starts below the top bar, so its 50% sits half a topbar
          // lower than the viewport's. Adding it back centers against what
          // the eye actually reads as the canvas.
          isPreWork
            ? ({
                "--workspace-composer-bottom":
                  "calc(50% - 124px + 32px + (var(--workspace-topbar-h) / 2))",
              } as React.CSSProperties)
            : undefined
        }
      >
        <WorkspaceTopBar minimal={isPreWork} />
        <div
          className={cn(
            "relative grid min-h-0 grid-cols-1",
            !beforeFirstGeneration &&
              "max-md:grid-rows-[minmax(0,42%)_minmax(0,1fr)] md:grid-cols-[432px_minmax(0,1fr)]",
          )}
        >
          <aside
            aria-label="Conversation"
            className={
              beforeFirstGeneration
                ? "absolute left-1/2 z-10 w-[896px] max-w-[calc(100%-32px)] -translate-x-1/2"
                : "border-border flex min-h-0 flex-col gap-5 overflow-y-auto border-r bg-black px-4 py-6"
            }
            style={
              beforeFirstGeneration
                ? {
                    bottom: isPreWork
                      ? "var(--workspace-composer-bottom)"
                      : "var(--space-4)",
                  }
                : undefined
            }
          >
            {!beforeFirstGeneration ? (
              <h2 className="text-body-lg font-normal">Video</h2>
            ) : null}
            {composer}
            {yourWordsSlot}
            <div hidden={beforeFirstGeneration} className="flex-none">
              {generationsPanelProps.versions.map((version) => (
                <article
                  key={version.versionId}
                  className="rounded-card bg-fill text-ui mb-4 p-4"
                >
                  <p className="text-foreground whitespace-pre-wrap break-words">
                    {version.prompt}
                  </p>
                  <button
                    type="button"
                    data-testid={"conversation-words-" + version.versionId}
                    className="ps-btn ps-btn--sm ps-btn--pill mt-2"
                    onClick={() => onComposerFill?.(version.prompt)}
                  >
                    Use words
                  </button>
                </article>
              ))}
            </div>
            {isPreWork ? starterPillsSlot : null}
          </aside>
          <div className="relative min-h-0 overflow-hidden px-4 pb-4">
            {mobileLayout && viewingId ? (
              <aside className="rounded-card bg-canvas absolute left-4 right-4 top-4 z-30 max-h-[calc(100%-32px)] overflow-y-auto">
                {renderSelectedResult()}
              </aside>
            ) : null}
            <TileStateAnnouncer shots={shots} />

            {isPreWork ? null : workspaceStage.failure === "writing" ? (
              // Expansion failed — surface it with a retry instead of a silently
              // dead composer (M4). Picture/motion/video failures keep their own
              // surfaces (FrameStage / tiles); the flag drives this one.
              <FailureNotice
                failure="writing"
                onRetry={() => void onIdeaBoxExpand?.()}
              />
            ) : shots.length === 0 ||
              pendingReference ||
              unattachedFrameTake ? (
              /* Pre-render beats: the first frame (or its pending/failed state)
               owns the canvas — see CONTEXT.md, "First frame". */
              <FrameStage startFrame={domain.startFrame} prompt={prompt} />
            ) : (
              // The space (M5, ADR-0012/0013): the session's takes as a
              // lineage network. The shots-grid fallback was removed in the
              // M6 deletion pass (2026-08-27).
              <CanvasViewport
                liveNodeId={viewingId ?? heroGeneration?.id ?? null}
              >
                <TheSpace
                  nodes={spaceNodes}
                  rows={generationRows}
                  liveNodeId={viewingId ?? heroGeneration?.id ?? null}
                  onSelectNode={handleSelectSpaceNode}
                  renderNodeMenu={renderSpaceNodeMenu}
                  selectedNodeId={viewingId}
                  renderSelectedResult={() =>
                    mobileLayout ? null : renderSelectedResult()
                  }
                />
              </CanvasViewport>
            )}
          </div>
        </div>
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
