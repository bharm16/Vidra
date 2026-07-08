/**
 * PromptOptimizerWorkspace - Main Orchestrator
 *
 * Coordinates business logic and renders the canvas view with a unified top bar.
 *
 * This component focuses on:
 * - Coordinating hooks
 * - Business logic delegation
 * - Conditional layout rendering
 */

import React, { useCallback, useMemo, useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useKeyboardShortcuts } from "@components/KeyboardShortcuts";
import { useToast } from "@components/Toast";
import { logger } from "@/services/LoggingService";
import { useAuthUser } from "@hooks/useAuthUser";
import type { User } from "../context/types";
import type {
  CameraMotionCategory,
  CameraPath,
  ConvergenceHandoff,
} from "@/features/convergence/types";
import type { CapabilityValues } from "@shared/capabilities";
import type {
  PromptHistoryEntry,
  PromptVersionEntry,
} from "@features/prompt-optimizer/types/domain/prompt-session";
import { useAssetsSidebar } from "../components/AssetsSidebar";
import {
  usePromptConfig,
  usePromptUIStateContext,
  usePromptSession,
  usePromptHighlights,
  usePromptServices,
  usePromptActions,
  usePromptNavigation,
  PromptStateProvider,
} from "../context/PromptStateContext";
import {
  useGenerationControlsStoreActions,
  useGenerationControlsStoreState,
} from "@features/generation-controls";
import { scrollToSpanById } from "../utils/scrollToSpanById";
import {
  uploadPreviewImage,
  validatePreviewImageFile,
} from "@/features/preview/api/previewApi";
import {
  usePromptLoader,
  useHighlightsPersistence,
  useUndoRedo,
  usePromptOptimization,
  useImprovementFlow,
  useConceptBrainstorm,
  useEnhancementSuggestions,
  usePromptKeyframesSync,
  useStablePromptContext,
  usePromptCoherence,
  useAssetManagement,
  useEditorShotPromptBinding,
} from "./hooks";
import { useI2VContext } from "../hooks/useI2VContext";
import {
  useIdeaBox,
  usePersistenceTargetRegistrar,
  PersistenceTargetRegistrarContext,
  type PersistenceTarget,
} from "@/features/idea-box";
import { isRemoteSessionId } from "@/repositories/sessionIdNamespace";
import { PromptOptimizerWorkspaceView } from "./components/PromptOptimizerWorkspaceView";
import {
  WorkspaceSessionProvider,
  useWorkspaceSession,
} from "../context/WorkspaceSessionContext";
import { PromptResultsActionsProvider } from "../context/PromptResultsActionsContext";
import { PromptInsertionBusProvider } from "../context/PromptInsertionBusContext";
import { SidebarDataProvider } from "./providers/sidebar";

const log = logger.child("PromptOptimizerWorkspace");
const buildDefaultCameraTransform = (): CameraPath["start"] => ({
  position: { x: 0, y: 0, z: 0 },
  rotation: { pitch: 0, yaw: 0, roll: 0 },
});

const formatCameraMotionLabel = (id: string): string =>
  id
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const inferCameraMotionCategory = (id: string): CameraMotionCategory => {
  if (id === "static") return "static";
  if (
    id.startsWith("pan_") ||
    id.startsWith("tilt_") ||
    id.startsWith("dutch_")
  ) {
    return "pan_tilt";
  }
  if (["push_in", "pull_back", "track_left", "track_right"].includes(id)) {
    return "dolly";
  }
  if (id.startsWith("crane_") || id.startsWith("pedestal_")) {
    return "crane";
  }
  if (id.startsWith("arc_")) {
    return "orbital";
  }
  if (id === "reveal") {
    return "compound";
  }
  return "static";
};

interface HydratedPromptHistoryInput {
  id?: string;
  uuid?: string;
  title?: string | null;
  input?: string;
  output?: string;
  score?: number | null;
  mode?: string;
  targetModel?: string | null;
  generationParams?: string | Record<string, unknown> | null;
  keyframes?: PromptHistoryEntry["keyframes"];
  brainstormContext?: string | Record<string, unknown> | null;
  highlightCache?: Record<string, unknown> | null;
  timestamp?: string;
  versions?: PromptVersionEntry[];
}

const buildFallbackCameraPath = (cameraMotionId: string): CameraPath => ({
  id: cameraMotionId,
  label: formatCameraMotionLabel(cameraMotionId),
  category: inferCameraMotionCategory(cameraMotionId),
  start: buildDefaultCameraTransform(),
  end: buildDefaultCameraTransform(),
  duration: 1,
});

/**
 * Inner component with access to PromptStateContext
 */
interface PromptOptimizerContentProps {
  user: User | null;
  isAuthResolved: boolean;
  /** Handoff data from Visual Convergence for prompt pre-fill (Requirement 17.2) */
  convergenceHandoff?: ConvergenceHandoff | null | undefined;
}

function PromptOptimizerContent({
  user,
  isAuthResolved,
  convergenceHandoff,
}: PromptOptimizerContentProps): React.ReactElement {
  const location = useLocation();
  // Track if we've already applied the handoff to prevent re-applying
  const handoffAppliedRef = React.useRef<string | null>(null);

  const toast = useToast();
  // Config
  const {
    selectedMode,
    selectedModel,
    setSelectedMode,
    setSelectedModel,
    generationParams,
    setGenerationParams,
  } = usePromptConfig();

  // UI
  const {
    showResults,
    showSettings,
    setShowSettings,
    showShortcuts,
    setShowShortcuts,
    showHistory,
    setShowHistory,
    showImprover,
    setShowImprover,
    showBrainstorm,
    setShowBrainstorm,
    setShowResults,
    setOutputSaveState,
    setOutputLastSavedAt,
  } = usePromptUIStateContext();

  // Session
  const {
    suggestionsData,
    setSuggestionsData,
    setConceptElements,
    promptContext,
    setPromptContext,
    currentPromptUuid,
    currentPromptDocId,
    setCurrentPromptUuid,
    setCurrentPromptDocId,
  } = usePromptSession();

  // Highlights & Refs
  const {
    latestHighlightRef,
    persistedSignatureRef,
    undoStackRef,
    redoStackRef,
    isApplyingHistoryRef,
    skipLoadFromUrlRef,
    setCanUndo,
    setCanRedo,
  } = usePromptHighlights();

  // Services
  const { promptOptimizer, promptHistory } = usePromptServices();

  // Actions
  const {
    applyInitialHighlightSnapshot,
    resetEditStacks,
    registerPromptEdit,
    resetVersionEdits,
    setDisplayedPromptSilently,
    handleCreateNew,
  } = usePromptActions();

  // Navigation
  const { navigate, sessionId } = usePromptNavigation();
  const assetsSidebar = useAssetsSidebar();
  const {
    assetEditorState,
    quickCreateState,
    handlers: assetManagement,
  } = useAssetManagement({
    assets: assetsSidebar.assets,
    refreshAssets: assetsSidebar.refresh,
  });
  const { domain } = useGenerationControlsStoreState();
  const {
    setKeyframes,
    addKeyframe,
    setStartFrame,
    clearStartFrame,
    clearEndFrame,
    clearVideoReferences,
    clearExtendVideo,
    clearKeyframes: clearGenerationKeyframes,
    setCameraMotion,
    setSubjectMotion,
  } = useGenerationControlsStoreActions();
  const keyframes = domain.keyframes;
  const startFrame = domain.startFrame;
  const cameraMotion = domain.cameraMotion;
  const subjectMotion = domain.subjectMotion;
  const setInputPrompt = promptOptimizer.setInputPrompt;
  const i2vContext = useI2VContext();
  const { hasActiveContinuityShot, currentShotId, currentShot, updateShot } =
    useWorkspaceSession();

  const { serializedKeyframes: serializedKeyframesSync, onLoadKeyframes } =
    usePromptKeyframesSync({
      keyframes,
      setKeyframes,
      setStartFrame,
      clearEndFrame,
      clearVideoReferences,
      clearExtendVideo,
      currentPromptUuid,
      currentPromptDocId,
      isLoadingHistory: promptHistory.isLoadingHistory,
      promptHistory,
    });

  // Reset generation controls when a new draft is created via + New.
  // The event is dispatched synchronously from handleCreateNew before navigate,
  // so these state updates are batched with the prompt state resets.
  useEffect(() => {
    const handleWorkspaceReset = (): void => {
      clearStartFrame();
      clearEndFrame();
      clearGenerationKeyframes();
      clearVideoReferences();
      clearExtendVideo();
      setCameraMotion(null);
      setSubjectMotion("");
      setShowResults(false);
    };
    window.addEventListener("po:workspace-reset", handleWorkspaceReset);
    return () =>
      window.removeEventListener("po:workspace-reset", handleWorkspaceReset);
  }, [
    clearStartFrame,
    clearEndFrame,
    clearGenerationKeyframes,
    clearVideoReferences,
    clearExtendVideo,
    setCameraMotion,
    setSubjectMotion,
    setShowResults,
  ]);

  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    const shouldOpenSettings = params.get("settings");
    if (shouldOpenSettings !== "1" && shouldOpenSettings !== "true") return;

    setShowSettings(true);

    params.delete("settings");
    const nextSearch = params.toString();
    const nextUrl = `${location.pathname}${nextSearch ? `?${nextSearch}` : ""}${location.hash}`;
    navigate(nextUrl, { replace: true });
  }, [
    location.hash,
    location.pathname,
    location.search,
    navigate,
    setShowSettings,
  ]);

  /**
   * Handle convergence handoff - pre-fill prompt when provided
   * (Requirement 17.2: Switch to Studio mode with converged prompt pre-filled)
   */
  useEffect(() => {
    if (!convergenceHandoff) return;

    // Create a unique key for this handoff to prevent re-applying
    const handoffKey = `${convergenceHandoff.prompt.slice(0, 50)}-${convergenceHandoff.cameraMotion}`;

    // Skip if we've already applied this handoff
    if (handoffAppliedRef.current === handoffKey) return;

    // Mark this handoff as applied
    handoffAppliedRef.current = handoffKey;

    // Pre-fill the input prompt with the converged prompt
    setInputPrompt(convergenceHandoff.prompt);

    const handoffCameraMotionId = convergenceHandoff.cameraMotion?.trim();
    if (handoffCameraMotionId) {
      setCameraMotion(buildFallbackCameraPath(handoffCameraMotionId));
    }
    const handoffSubjectMotion = convergenceHandoff.subjectMotion?.trim();
    if (handoffSubjectMotion) {
      setSubjectMotion(handoffSubjectMotion);
    }

    // Clear any existing displayed prompt to show the input
    setDisplayedPromptSilently("");
    setShowResults(false);

    // Show a toast notification
    toast.success("Prompt loaded from Visual Convergence");

    // Log the handoff for debugging
    log.info("Applied convergence handoff", {
      promptLength: convergenceHandoff.prompt.length,
      lockedDimensionsCount: convergenceHandoff.lockedDimensions.length,
      cameraMotion: convergenceHandoff.cameraMotion,
      hasSubjectMotion: Boolean(convergenceHandoff.subjectMotion),
    });
  }, [
    convergenceHandoff,
    setInputPrompt,
    setCameraMotion,
    setSubjectMotion,
    setDisplayedPromptSilently,
    setShowResults,
    toast,
  ]);

  useEditorShotPromptBinding({
    currentEditorShot: currentShot,
    hasActiveContinuityShot,
    promptOptimizer,
    updateShot,
    setDisplayedPromptSilently,
    setShowResults,
  });

  useEffect(() => {
    if (!hasActiveContinuityShot || !currentShot) return;
    const shotModelId = currentShot.modelId?.trim();
    if (!shotModelId) return;
    if (selectedModel === shotModelId) return;
    setSelectedModel(shotModelId);
  }, [
    currentShot,
    currentShot?.id,
    currentShot?.modelId,
    hasActiveContinuityShot,
    selectedModel,
    setSelectedModel,
  ]);

  const stablePromptContext = useStablePromptContext(promptContext);
  const promptHistoryEntries = promptHistory.history;
  const createPromptHistoryDraft = promptHistory.createDraft;
  const updatePromptHistoryEntryLocal = promptHistory.updateEntryLocal;

  const upsertHistoryEntryFromSessionLoad = useCallback(
    (entry: HydratedPromptHistoryInput, sessionDocId: string): void => {
      const uuid = typeof entry.uuid === "string" ? entry.uuid.trim() : "";
      if (!uuid) return;

      const mode =
        typeof entry.mode === "string" && entry.mode.trim()
          ? entry.mode.trim()
          : "video";
      const generationParams =
        entry.generationParams && typeof entry.generationParams === "object"
          ? entry.generationParams
          : null;

      const existing = promptHistoryEntries.find((item) => item.uuid === uuid);
      if (!existing) {
        createPromptHistoryDraft({
          mode,
          targetModel: entry.targetModel ?? null,
          generationParams,
          keyframes: entry.keyframes ?? null,
          uuid,
        });
      }

      const normalizedContext =
        typeof entry.brainstormContext === "string"
          ? (() => {
              try {
                const parsed = JSON.parse(entry.brainstormContext) as unknown;
                return parsed && typeof parsed === "object"
                  ? (parsed as Record<string, unknown>)
                  : null;
              } catch {
                return null;
              }
            })()
          : entry.brainstormContext &&
              typeof entry.brainstormContext === "object"
            ? entry.brainstormContext
            : null;

      updatePromptHistoryEntryLocal(uuid, {
        id: entry.id ?? sessionDocId,
        timestamp: entry.timestamp ?? new Date().toISOString(),
        title: entry.title ?? null,
        input: entry.input ?? "",
        output: entry.output ?? "",
        score: entry.score ?? null,
        mode,
        targetModel: entry.targetModel ?? null,
        generationParams,
        keyframes: entry.keyframes ?? null,
        brainstormContext: normalizedContext,
        highlightCache: entry.highlightCache ?? null,
        versions: Array.isArray(entry.versions) ? entry.versions : [],
      });
    },
    [
      promptHistoryEntries,
      createPromptHistoryDraft,
      updatePromptHistoryEntryLocal,
    ],
  );

  // ============================================================================
  // Custom Hooks - Business Logic Delegation
  // ============================================================================

  // Load prompt from URL parameter
  const { isLoading } = usePromptLoader({
    sessionId,
    isAuthResolved,
    historyEntries: promptHistoryEntries,
    createDraftEntry: createPromptHistoryDraft,
    selectedMode,
    selectedModelValue: selectedModel,
    generationParamsValue: generationParams,
    navigate,
    toast,
    user,
    promptOptimizer,
    setDisplayedPromptSilently,
    applyInitialHighlightSnapshot,
    resetEditStacks,
    resetVersionEdits,
    setCurrentPromptDocId,
    setCurrentPromptUuid,
    setShowResults,
    setSelectedMode,
    setSelectedModel,
    setGenerationParams,
    upsertHistoryEntry: upsertHistoryEntryFromSessionLoad,
    setSuggestionsData,
    setConceptElements,
    setPromptContext,
    onLoadKeyframes,
    skipLoadFromUrlRef,
  });

  // Highlights persistence
  const { handleHighlightsPersist } = useHighlightsPersistence({
    currentPromptUuid,
    currentPromptDocId,
    user,
    toast,
    applyInitialHighlightSnapshot,
    promptHistory,
    latestHighlightRef,
    persistedSignatureRef,
  });

  // Undo/Redo functionality
  const { handleUndo, handleRedo, handleDisplayedPromptChange } = useUndoRedo({
    promptOptimizer,
    setDisplayedPromptSilently,
    applyInitialHighlightSnapshot,
    onEdit: ({ previousText, nextText }) =>
      registerPromptEdit({ previousText, nextText, source: "manual" }),
    undoStackRef,
    redoStackRef,
    latestHighlightRef,
    isApplyingHistoryRef,
    setCanUndo,
    setCanRedo,
  });
  const uploadSidebarImage = useCallback(
    async (
      file: File,
    ): Promise<{
      url: string;
      storagePath?: string;
      viewUrlExpiresAt?: string;
    } | null> => {
      const validation = validatePreviewImageFile(file);
      if (!validation.valid) {
        toast.warning(validation.error);
        return null;
      }

      const response = await uploadPreviewImage(
        file,
        {},
        { source: "tool-sidebar" },
      );
      if (!response.success) {
        throw new Error(
          response.error || response.message || "Failed to upload image",
        );
      }

      const imageUrl = response.data.viewUrl || response.data.imageUrl;
      if (!imageUrl) {
        throw new Error("Upload did not return an image URL");
      }

      return {
        url: imageUrl,
        ...(response.data.storagePath
          ? { storagePath: response.data.storagePath }
          : {}),
        ...(response.data.viewUrlExpiresAt
          ? { viewUrlExpiresAt: response.data.viewUrlExpiresAt }
          : {}),
      };
    },
    [toast],
  );

  const handleImageUpload = useCallback(
    async (file: File): Promise<void> => {
      try {
        const uploaded = await uploadSidebarImage(file);
        if (!uploaded) return;
        addKeyframe({
          url: uploaded.url,
          source: "upload",
          ...(uploaded.storagePath
            ? { storagePath: uploaded.storagePath }
            : {}),
          ...(uploaded.viewUrlExpiresAt
            ? { viewUrlExpiresAt: uploaded.viewUrlExpiresAt }
            : {}),
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Upload failed");
      }
    },
    [addKeyframe, toast, uploadSidebarImage],
  );

  const handleStartFrameUpload = useCallback(
    async (file: File): Promise<void> => {
      try {
        const uploaded = await uploadSidebarImage(file);
        if (!uploaded) return;
        setStartFrame({
          id: `start-frame-upload-${Date.now()}`,
          url: uploaded.url,
          source: "upload",
          ...(uploaded.storagePath
            ? { storagePath: uploaded.storagePath }
            : {}),
          ...(uploaded.viewUrlExpiresAt
            ? { viewUrlExpiresAt: uploaded.viewUrlExpiresAt }
            : {}),
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Upload failed");
      }
    },
    [setStartFrame, toast, uploadSidebarImage],
  );

  const clearResultsView = useCallback((): void => {
    if (promptOptimizer.displayedPrompt?.trim()) {
      setDisplayedPromptSilently("");
    }
    setShowResults(false);
  }, [
    promptOptimizer.displayedPrompt,
    setDisplayedPromptSilently,
    setShowResults,
  ]);

  const handleSequenceOptimizationApplied = useCallback(
    async (optimizedPrompt: string): Promise<void> => {
      if (!hasActiveContinuityShot || !currentShotId) return;
      try {
        await updateShot(currentShotId, { prompt: optimizedPrompt });
      } catch (error) {
        log.warn("Failed to persist optimized sequence prompt", {
          shotId: currentShotId,
          error: error instanceof Error ? error.message : String(error),
        });
        toast.error("Failed to save optimized shot prompt");
      }
    },
    [currentShotId, hasActiveContinuityShot, toast, updateShot],
  );

  // Persistence-target bridge (M5 D4): the canvas subtree below registers a
  // resolver that mints/reads the words-version at frame time; this owner adds
  // the session id (a route concern it already holds, gated through
  // isRemoteSessionId so drafts/local ids the server has no record of are
  // omitted rather than 404'd). useIdeaBox invokes the merged resolver so
  // first frames persist as generation records on their version node. Both
  // pieces are stable; the version half is blank until the canvas registers.
  const { resolve: resolveVersionTarget, registrarValue } =
    usePersistenceTargetRegistrar();
  const resolvePersistenceTarget = useCallback<() => PersistenceTarget>(
    () => ({
      ...(isRemoteSessionId(sessionId) ? { sessionId } : {}),
      ...resolveVersionTarget(),
    }),
    [resolveVersionTarget, sessionId],
  );

  // Idea Box: on empty canvas (no start frame), optimization continues into
  // first-frame generation; setting the frame flips the workspace to I2V.
  const {
    stage: ideaBoxStage,
    continueAfterOptimization,
    regenerateFrame,
    acceptFrame,
  } = useIdeaBox({
    startImageUrl: i2vContext.startImageUrl,
    setStartFrame,
    resolvePersistenceTarget,
  });

  const handleOptimizationApplied = useCallback(
    async (optimizedPrompt: string): Promise<void> => {
      await handleSequenceOptimizationApplied(optimizedPrompt);
      await continueAfterOptimization(optimizedPrompt);
    },
    [handleSequenceOptimizationApplied, continueAfterOptimization],
  );

  const handleIdeaBoxRegenerate = useCallback(async (): Promise<void> => {
    // The current prompt text — including any edits made after seeing the
    // frame. Resubmitting can't do this: with a frame set, optimize is
    // bypassed, so regeneration is the gate's only reject path.
    const prompt = (
      promptOptimizer.displayedPrompt ||
      promptOptimizer.inputPrompt ||
      ""
    ).trim();
    if (!prompt) return;
    await regenerateFrame(prompt);
  }, [
    promptOptimizer.displayedPrompt,
    promptOptimizer.inputPrompt,
    regenerateFrame,
  ]);

  const promptForAssets = useMemo(() => {
    if (showResults && promptOptimizer.displayedPrompt) {
      return promptOptimizer.displayedPrompt;
    }
    return promptOptimizer.inputPrompt;
  }, [
    promptOptimizer.displayedPrompt,
    promptOptimizer.inputPrompt,
    showResults,
  ]);

  const optimizationGenerationParams = useMemo<CapabilityValues>(
    () => ({
      ...(generationParams ?? {}),
      ...(cameraMotion?.id ? { camera_motion_id: cameraMotion.id } : {}),
      ...(subjectMotion.trim() ? { subject_motion: subjectMotion.trim() } : {}),
    }),
    [generationParams, cameraMotion?.id, subjectMotion],
  );

  // Prompt optimization
  // A failed expansion (optimize produced no result) surfaces as a "writing"
  // failure on the canvas instead of a silently dead composer (M4).
  const [writingFailed, setWritingFailed] = useState(false);
  const { handleOptimize } = usePromptOptimization({
    promptOptimizer,
    promptHistory,
    promptContext,
    selectedMode,
    selectedModel,
    generationParams: optimizationGenerationParams,
    keyframes: serializedKeyframesSync,
    startFrame,
    startImageUrl: i2vContext.startImageUrl,
    sourcePrompt: i2vContext.startImageSourcePrompt,
    currentPromptUuid,
    setCurrentPromptUuid,
    setCurrentPromptDocId,
    setDisplayedPromptSilently,
    setShowResults,
    applyInitialHighlightSnapshot,
    resetEditStacks,
    persistedSignatureRef,
    skipLoadFromUrlRef,
    navigate,
    onOptimizationApplied: handleOptimizationApplied,
    onOptimizationFailed: () => setWritingFailed(true),
  });

  // Idea Box entry: the canvas generate action routes here when no start
  // frame exists. Optimization's onOptimizationApplied continues the chain
  // (expand -> first frame -> gate).
  const handleIdeaBoxExpand = useCallback(async (): Promise<void> => {
    setWritingFailed(false);
    await handleOptimize();
  }, [handleOptimize]);

  // First-run example chips: fill the composer, never submit — editing stays
  // explicit. Both prompt states update so the editor surface re-renders.
  const composerFillSetInputPrompt = promptOptimizer.setInputPrompt;
  const handleComposerFill = useCallback(
    (text: string): void => {
      composerFillSetInputPrompt(text);
      setDisplayedPromptSilently(text);
    },
    [composerFillSetInputPrompt, setDisplayedPromptSilently],
  );

  // Improvement flow
  const { handleImproveFirst, handleImprovementComplete } = useImprovementFlow({
    promptOptimizer,
    toast,
    setShowImprover,
    handleOptimize,
  });

  // Concept brainstorm flow
  const { handleConceptComplete, handleSkipBrainstorm } = useConceptBrainstorm({
    promptOptimizer,
    promptHistory,
    selectedMode,
    selectedModel,
    generationParams: optimizationGenerationParams,
    keyframes: serializedKeyframesSync,
    setConceptElements,
    setPromptContext,
    setShowBrainstorm,
    setCurrentPromptUuid,
    setCurrentPromptDocId,
    setDisplayedPromptSilently,
    setShowResults,
    applyInitialHighlightSnapshot,
    resetEditStacks,
    persistedSignatureRef,
    skipLoadFromUrlRef,
    navigate,
    toast,
  });

  const {
    issues: coherenceIssues,
    isChecking: isCoherenceChecking,
    isPanelExpanded,
    setIsPanelExpanded,
    affectedSpanIds,
    spanIssueMap,
    runCheck: runCoherenceCheck,
    dismissIssue,
    dismissAll,
    applyFix,
    togglePanelExpanded: toggleCoherencePanelExpanded,
  } = usePromptCoherence({
    promptOptimizer,
    latestHighlightRef,
    applyInitialHighlightSnapshot,
    handleDisplayedPromptChange,
    currentPromptUuid,
    currentPromptDocId,
    promptHistory,
    toast,
    log,
  });

  // Enhancement suggestions
  const { fetchEnhancementSuggestions, handleSuggestionClick } =
    useEnhancementSuggestions({
      promptOptimizer,
      selectedMode,
      suggestionsData,
      setSuggestionsData,
      handleDisplayedPromptChange,
      stablePromptContext,
      toast,
      applyInitialHighlightSnapshot,
      latestHighlightRef,
      currentPromptUuid,
      currentPromptDocId,
      promptHistory,
      onCoherenceCheck: runCoherenceCheck,
    });

  // ============================================================================
  // Keyboard Shortcuts
  // ============================================================================
  useKeyboardShortcuts({
    openShortcuts: () => setShowShortcuts(true),
    openSettings: () => setShowSettings(true),
    createNew: handleCreateNew,
    optimize: () =>
      !i2vContext.isI2VMode &&
      !promptOptimizer.isProcessing &&
      showResults === false &&
      handleOptimize(),
    improveFirst: handleImproveFirst,
    canCopy: () => showResults && Boolean(promptOptimizer.displayedPrompt),
    copy: () => {
      navigator.clipboard.writeText(promptOptimizer.displayedPrompt);
      toast.success("Copied to clipboard!");
    },
    export: () => showResults && toast.info("Use export button in canvas"),
    toggleSidebar: () => setShowHistory(!showHistory),
    switchMode: () => {
      // Implementation from original
    },
    applySuggestion: (index: number) => {
      const suggestion = suggestionsData?.suggestions?.[index];
      if (suggestion) {
        handleSuggestionClick(suggestion);
      }
    },
    closeModal: () => {
      if (showSettings) setShowSettings(false);
      else if (showShortcuts) setShowShortcuts(false);
      else if (showImprover) setShowImprover(false);
      else if (showBrainstorm) setShowBrainstorm(false);
      else if (suggestionsData) setSuggestionsData(null);
    },
  });

  // ============================================================================
  // Render
  // ============================================================================
  // Only show the blocking loading UI when we are actively loading a prompt.
  const shouldShowLoading = isLoading;

  return (
    <PersistenceTargetRegistrarContext.Provider value={registrarValue}>
      <PromptInsertionBusProvider
        inputPrompt={promptOptimizer.inputPrompt}
        setInputPrompt={promptOptimizer.setInputPrompt}
        clearResultsView={clearResultsView}
      >
        <SidebarDataProvider
          assets={assetsSidebar.assets}
          assetsByType={assetsSidebar.byType}
          isLoadingAssets={assetsSidebar.isLoading}
          onEditAsset={assetManagement.onEditAsset}
          onCreateAsset={assetManagement.onCreateAsset}
          onCreateFromTrigger={assetManagement.onCreateFromTrigger}
          onImageUpload={handleImageUpload}
          onStartFrameUpload={handleStartFrameUpload}
          onUploadSidebarImage={uploadSidebarImage}
        >
          <PromptResultsActionsProvider
            currentPromptUuid={currentPromptUuid}
            currentPromptDocId={currentPromptDocId}
            displayedPrompt={promptOptimizer.displayedPrompt}
            isApplyingHistoryRef={isApplyingHistoryRef}
            handleDisplayedPromptChange={handleDisplayedPromptChange}
            updateEntryOutput={promptHistory.updateEntryOutput}
            setOutputSaveState={setOutputSaveState}
            setOutputLastSavedAt={setOutputLastSavedAt}
            user={user}
            onReoptimize={handleOptimize}
            onFetchSuggestions={fetchEnhancementSuggestions}
            onSuggestionClick={handleSuggestionClick}
            onHighlightsPersist={handleHighlightsPersist}
            onUndo={handleUndo}
            onRedo={handleRedo}
            stablePromptContext={stablePromptContext}
            suggestionsData={suggestionsData}
            coherenceAffectedSpanIds={affectedSpanIds}
            coherenceSpanIssueMap={spanIssueMap}
            coherenceIssues={coherenceIssues}
            isCoherenceChecking={isCoherenceChecking}
            isCoherencePanelExpanded={isPanelExpanded}
            onToggleCoherencePanelExpanded={toggleCoherencePanelExpanded}
            onDismissCoherenceIssue={dismissIssue}
            onDismissAllCoherenceIssues={dismissAll}
            onApplyCoherenceFix={applyFix}
            onScrollToCoherenceSpan={scrollToSpanById}
            i2vContext={i2vContext}
            ideaBoxStage={ideaBoxStage}
            isExpanding={promptOptimizer.isProcessing}
            writingFailed={writingFailed}
            hasExpandedPrompt={
              showResults && promptOptimizer.displayedPrompt.trim().length > 0
            }
            onIdeaBoxAccept={acceptFrame}
            onIdeaBoxRegenerate={handleIdeaBoxRegenerate}
            onIdeaBoxExpand={handleIdeaBoxExpand}
            onComposerFill={handleComposerFill}
          >
            <PromptOptimizerWorkspaceView
              showHistory={showHistory}
              onToggleHistory={setShowHistory}
              shouldShowLoading={shouldShowLoading}
              promptModalsProps={{
                onImprovementComplete: handleImprovementComplete,
                onConceptComplete: handleConceptComplete,
                onSkipBrainstorm: handleSkipBrainstorm,
              }}
              quickCreateState={quickCreateState}
              onQuickCreateClose={assetManagement.onCloseQuickCreate}
              onQuickCreateComplete={assetManagement.onQuickCreateComplete}
              assetEditorState={assetEditorState}
              assetEditorHandlers={{
                onClose: assetManagement.onCloseAssetEditor,
                onCreate: assetManagement.onCreate,
                onUpdate: assetManagement.onUpdate,
                onAddImage: assetManagement.onAddImage,
                onDeleteImage: assetManagement.onDeleteImage,
                onSetPrimaryImage: assetManagement.onSetPrimaryImage,
              }}
              detectedAssetsPrompt={promptForAssets}
              detectedAssets={assetsSidebar.assets}
              onEditAsset={assetManagement.onEditAsset}
              onCreateFromTrigger={assetManagement.onCreateFromTrigger}
              debugProps={{
                enabled:
                  false &&
                  (import.meta.env.DEV ||
                    new URLSearchParams(window.location.search).get("debug") ===
                      "true"),
                inputPrompt: promptOptimizer.inputPrompt,
                displayedPrompt: promptOptimizer.displayedPrompt,
                optimizedPrompt: promptOptimizer.optimizedPrompt,
                selectedMode,
                promptContext: stablePromptContext as unknown as Record<
                  string,
                  unknown
                > | null,
              }}
            />
          </PromptResultsActionsProvider>
        </SidebarDataProvider>
      </PromptInsertionBusProvider>
    </PersistenceTargetRegistrarContext.Provider>
  );
}

/**
 * Outer component with auth state management
 */
interface PromptOptimizerWorkspaceProps {
  /** Handoff data from Visual Convergence for prompt pre-fill (Requirement 17.2) */
  convergenceHandoff?: ConvergenceHandoff | null;
}

function PromptOptimizerWorkspace({
  convergenceHandoff,
}: PromptOptimizerWorkspaceProps): React.ReactElement {
  const [isAuthResolved, setIsAuthResolved] = React.useState(false);
  const user = useAuthUser({
    onChange: () => {
      setIsAuthResolved(true);
    },
  });
  const { sessionId } = useParams<{ sessionId?: string }>();

  return (
    <WorkspaceSessionProvider {...(sessionId ? { sessionId } : {})}>
      <PromptStateProvider user={user}>
        <PromptOptimizerContent
          user={user}
          isAuthResolved={isAuthResolved}
          convergenceHandoff={convergenceHandoff}
        />
      </PromptStateProvider>
    </WorkspaceSessionProvider>
  );
}

export default PromptOptimizerWorkspace;
