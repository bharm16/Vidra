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
import { buildGalleryGenerationEntries } from "./utils/galleryGeneration";
import { deriveWorkspaceStage } from "./utils/deriveWorkspaceStage";
import { computeWorkspaceArtifacts } from "./utils/computeWorkspaceArtifacts";
import { groupShots } from "./utils/groupShots";
import { useFeaturedTile } from "./hooks/useFeaturedTile";
import { useWorkspaceKeyboardShortcuts } from "./hooks/useWorkspaceKeyboardShortcuts";
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
import { CanvasSettingsRow } from "./components/CanvasSettingsRow";
import { YourWordsChip } from "./components/YourWordsChip";
import type { PromptEditorSurfaceProps } from "./components/PromptEditorSurface";

// Lazy-loaded so the Three.js bundle (~120 KB compressed, only used inside
// CameraMotionModal's renderer) stays out of the workspace landing chunk.
const CameraMotionModal = lazy(() =>
  import("@/components/modals/CameraMotionModal").then((m) => ({
    default: m.CameraMotionModal,
  })),
);
import { TuneDrawer } from "./components/TuneDrawer";
import type { TuneChipId } from "./utils/tuneChips";

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
  onEnhance?: () => void;
  isEnhancing?: boolean;
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
  onEnhance,
  isEnhancing = false,
}: CanvasWorkspaceProps): React.ReactElement {
  const storeActions = useGenerationControlsStoreActions();
  const { domain } = useGenerationControlsStoreState();
  const promptHighlights = useOptionalPromptHighlights();
  const { session, hasActiveContinuityShot, currentShot, updateShot } =
    useWorkspaceSession();
  const { onComposerFill } = usePromptResultsActions();
  // Generation domain provides the upload handlers wired through to
  // CanvasSettingsRow's start-frame / video-reference popovers. Null when
  // SidebarDataContextProvider isn't mounted (tests, isolated stories).
  const generationDomain = useSidebarGenerationDomain();
  useWorkspaceKeyboardShortcuts();
  const [showCameraMotionModal, setShowCameraMotionModal] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [tuneOpen, setTuneOpen] = useState<boolean>(false);
  const [selectedChipIds, setSelectedChipIds] = useState<
    ReadonlyArray<TuneChipId>
  >([]);

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
  const { ideaBoxStage, isExpanding, hasExpandedPrompt } =
    usePromptResultsData();
  const workspaceStage = deriveWorkspaceStage(
    computeWorkspaceArtifacts({
      tiles: shots.flatMap((shot) => shot.tiles),
      ideaBoxStageKind: ideaBoxStage?.kind ?? "idle",
      isExpanding: isExpanding ?? false,
      hasExpandedPrompt: hasExpandedPrompt ?? false,
      hasStartFrame: Boolean(domain.startFrame),
    }),
  );
  const isPreWork = workspaceStage.stage === "empty";

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

  const handleToggleChip = useCallback((id: TuneChipId) => {
    setSelectedChipIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }, []);
  const handleCloseTune = useCallback(() => setTuneOpen(false), []);
  const handleToggleTune = useCallback(() => setTuneOpen((open) => !open), []);

  const selectedChipCount = selectedChipIds.length;
  const onStartFrameUpload = generationDomain?.onStartFrameUpload;
  const onUploadSidebarImage = generationDomain?.onUploadSidebarImage;
  const recommendationPromptId = modelRecommendation?.promptId;
  const hasGenerations = galleryEntries.length > 0;

  // Enhance prompt is gated on a non-empty prompt — the upstream handler is
  // a no-op for empty prompts (ISSUE-39). Disable the Tune-drawer Enhance
  // button visually so users don't click into nothing.
  const enhanceDrawerDisabled = !onEnhance || !prompt.trim();

  // I2V mode (start image set) bypasses optimization — see Phase 4 of the
  // i2v-pipeline-simplification spec. Hide the Enhance trigger entirely so
  // the UX matches what the pipeline actually does.
  const isI2VMode = Boolean(domain.startFrame?.url);

  const tuneSlot = useMemo(
    () =>
      tuneOpen ? (
        <TuneDrawer
          selectedChipIds={selectedChipIds}
          onToggleChip={handleToggleChip}
          onClose={handleCloseTune}
          {...(onEnhance ? { onEnhance } : {})}
          isEnhancing={isEnhancing}
          enhanceDisabled={enhanceDrawerDisabled}
          isI2VMode={isI2VMode}
        />
      ) : null,
    [
      tuneOpen,
      selectedChipIds,
      handleToggleChip,
      handleCloseTune,
      onEnhance,
      isEnhancing,
      enhanceDrawerDisabled,
      isI2VMode,
    ],
  );

  const chromeSlot = useMemo(
    () => (
      <div className="border-tool-rail-border border-t">
        <CanvasSettingsRow
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
          tuneOpen={tuneOpen}
          selectedChipCount={selectedChipCount}
          onToggleTune={handleToggleTune}
          onOpenMotion={handleOpenMotion}
          {...(onStartFrameUpload ? { onStartFrameUpload } : {})}
          {...(onUploadSidebarImage ? { onUploadSidebarImage } : {})}
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
      tuneOpen,
      selectedChipCount,
      handleToggleTune,
      handleOpenMotion,
      onStartFrameUpload,
      onUploadSidebarImage,
      hasGenerations,
    ],
  );

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
    <div
      className="text-foreground grid h-full grid-rows-[var(--workspace-topbar-h)_1fr] overflow-hidden [background:var(--tool-canvas-bg)]"
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
      <WorkspaceTopBar />
      <div className="grid min-h-0 grid-cols-[var(--tool-rail-width)_1fr]">
        {/*
          ToolSidebar already mounts elsewhere in the app shell. The
          workspace shell does NOT render the rail itself. Leave this column
          empty for now; the rail keeps mounting at its existing parent and
          visually overlaps the empty column. The rail mount can be moved
          into this column in a future polish pass if desired.
        */}
        <div aria-hidden="true" />
        <div className="relative min-h-0 overflow-y-auto scroll-smooth px-7 pb-[140px]">
          <TileStateAnnouncer shots={shots} />

          {isPreWork ? (
            <EmptyHero />
          ) : shots.length === 0 ? (
            /* Pre-render beats: the first frame (or its pending/failed state)
               owns the canvas — see CONTEXT.md, "First frame". */
            <FrameStage startFrame={domain.startFrame} prompt={prompt} />
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
            tuneSlot={tuneSlot}
            chromeSlot={chromeSlot}
            yourWordsSlot={yourWordsSlot}
            onContinueScene={handleContinueScene}
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
  );
}

const STARTER_CHIPS = [
  "A product hero shot",
  "A character in a scene",
  "An abstract loop",
  "B-roll establishing",
] as const;

function EmptyHero(): React.ReactElement {
  // Chips fill the composer with a starter one-liner — fill-only, never
  // submit, so editing stays explicit. Expansion turns the thin phrase into
  // a full shot description, which is the product's whole pitch.
  const { onComposerFill } = usePromptResultsActions();
  // Sized to bottom out just above the raised pre-work composer: its bottom
  // sits at 40vh, so its top edge is ~60vh-minus-composer-height from the
  // viewport top. 160px covers the composer plus a breathing gap, keeping
  // the question directly over its answer box without sliding behind it.
  return (
    <div className="mx-auto flex min-h-[calc(60vh-var(--workspace-topbar-h)-160px)] max-w-[640px] flex-col items-center justify-end gap-[18px] text-center">
      <h1 className="text-[40px] font-semibold leading-[1.1] tracking-[-0.02em]">
        What are you making?
      </h1>
      <p className="text-tool-text-subdued m-0 max-w-[520px] text-[15px] leading-[1.55]">
        Describe a shot below. Each generation lands on this canvas — iterate,
        refine, and build up a scene.
      </p>
      <div
        className="mt-3 flex flex-wrap justify-center gap-2"
        aria-label="Example prompts"
      >
        {STARTER_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => onComposerFill?.(chip)}
            className="border-tool-rail-border bg-tool-surface-card text-tool-text-dim hover:border-tool-text-label hover:text-foreground rounded-full border px-3 py-1 text-xs transition-colors"
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}
