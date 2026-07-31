/**
 * PromptStateContext - Centralized State Management for Prompt Optimizer
 *
 * Replaces massive prop drilling in PromptOptimizerContainer
 * Manages all prompt-related state in one place
 */

import React, { createContext, useContext, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { VideoCamera } from "@promptstudio/system/components/ui";
import { usePromptOptimizer } from "@hooks/usePromptOptimizer";
import { usePromptHistory } from "@hooks/usePromptHistory";
import { useDebugLogger } from "@hooks/useDebugLogger";
import { useGenerationControlsStoreState } from "@features/generation-controls";
import type {
  PromptActionsState,
  PromptConfigState,
  PromptHighlightState,
  PromptNavigationState,
  PromptServicesState,
  PromptSessionState,
  PromptStateProviderProps,
  PromptUIState,
  Mode,
} from "./types";
import { usePromptHistoryActions } from "./usePromptHistoryActions";
import { useDraftHistorySync } from "./hooks/useDraftHistorySync";
import { usePromptStatePersistence } from "./hooks/usePromptStatePersistence";
import { usePromptConfigState } from "./hooks/usePromptConfigState";
import { usePromptUiState } from "./hooks/usePromptUiState";
import { usePromptSessionState } from "./hooks/usePromptSessionState";
import { useHighlightState } from "./hooks/useHighlightState";
import { useVersionEditTracking } from "./hooks/useVersionEditTracking";
import { useHistoryActionRefs } from "./hooks/useHistoryActionRefs";

const PromptConfigContext = createContext<PromptConfigState | null>(null);
const PromptUIContext = createContext<PromptUIState | null>(null);
const PromptSessionContext = createContext<PromptSessionState | null>(null);
const PromptHighlightContext = createContext<PromptHighlightState | null>(null);
const PromptServicesContext = createContext<PromptServicesState | null>(null);
const PromptActionsContext = createContext<PromptActionsState | null>(null);
const PromptNavigationContext = createContext<PromptNavigationState | null>(
  null,
);

export function usePromptConfig(): PromptConfigState {
  const context = useContext(PromptConfigContext);
  if (!context) {
    throw new Error("usePromptConfig must be used within PromptStateProvider");
  }
  return context;
}

export function usePromptUIStateContext(): PromptUIState {
  const context = useContext(PromptUIContext);
  if (!context) {
    throw new Error(
      "usePromptUIStateContext must be used within PromptStateProvider",
    );
  }
  return context;
}

export function usePromptSession(): PromptSessionState {
  const context = useContext(PromptSessionContext);
  if (!context) {
    throw new Error("usePromptSession must be used within PromptStateProvider");
  }
  return context;
}

export function usePromptHighlights(): PromptHighlightState {
  const context = useContext(PromptHighlightContext);
  if (!context) {
    throw new Error(
      "usePromptHighlights must be used within PromptStateProvider",
    );
  }
  return context;
}

export function useOptionalPromptHighlights(): PromptHighlightState | null {
  return useContext(PromptHighlightContext);
}

export function usePromptServices(): PromptServicesState {
  const context = useContext(PromptServicesContext);
  if (!context) {
    throw new Error(
      "usePromptServices must be used within PromptStateProvider",
    );
  }
  return context;
}

export function usePromptActions(): PromptActionsState {
  const context = useContext(PromptActionsContext);
  if (!context) {
    throw new Error("usePromptActions must be used within PromptStateProvider");
  }
  return context;
}

export function usePromptNavigation(): PromptNavigationState {
  const context = useContext(PromptNavigationContext);
  if (!context) {
    throw new Error(
      "usePromptNavigation must be used within PromptStateProvider",
    );
  }
  return context;
}

/**
 * Prompt State Provider
 */
export function PromptStateProvider({
  children,
  user,
}: PromptStateProviderProps): React.ReactElement {
  const debug = useDebugLogger("PromptStateProvider", {
    user: user ? "authenticated" : "anonymous",
  });
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId?: string }>();

  // Mode configuration (video-only)
  const modes: Mode[] = useMemo(
    () => [
      {
        id: "video",
        name: "Video Prompt",
        icon: VideoCamera,
        description: "Generate AI video prompts",
      },
    ],
    [],
  );

  const {
    selectedMode,
    setSelectedMode,
    selectedModel,
    setSelectedModel,
    generationParams,
    setGenerationParams,
    videoTier,
    setVideoTier,
  } = usePromptConfigState();

  const {
    showHistory,
    setShowHistory,
    showResults,
    setShowResults,
    showSettings,
    setShowSettings,
    showShortcuts,
    setShowShortcuts,
    showImprover,
    setShowImprover,
    showBrainstorm,
    setShowBrainstorm,
    currentAIIndex,
    setCurrentAIIndex,
    outputSaveState,
    setOutputSaveState,
    outputLastSavedAt,
    setOutputLastSavedAt,
  } = usePromptUiState();

  const {
    suggestionsData,
    setSuggestionsData,
    conceptElements,
    setConceptElements,
    promptContext,
    setPromptContext,
    currentPromptUuid,
    setCurrentPromptUuid,
    currentPromptDocId,
    setCurrentPromptDocId,
    promptIdentityRef,
    activeVersionId,
    setActiveVersionId,
  } = usePromptSessionState();

  const {
    initialHighlights,
    setInitialHighlights,
    initialHighlightsVersion,
    setInitialHighlightsVersion,
    canUndo,
    setCanUndo,
    canRedo,
    setCanRedo,
    latestHighlightRef,
    persistedSignatureRef,
    undoStackRef,
    redoStackRef,
    applyInitialHighlightSnapshot,
    resetEditStacks,
  } = useHighlightState();

  const {
    versionEditCountRef,
    versionEditsRef,
    registerPromptEdit,
    resetVersionEdits,
  } = useVersionEditTracking();

  const { isApplyingHistoryRef, skipLoadFromUrlRef } = useHistoryActionRefs();

  // Custom hooks
  const promptOptimizer = usePromptOptimizer(selectedMode, selectedModel);
  const promptHistory = usePromptHistory(user);
  const { domain } = useGenerationControlsStoreState();
  const currentHistoryEntry = useMemo(
    () =>
      promptHistory.history.find((entry) => {
        if (currentPromptUuid && entry.uuid === currentPromptUuid) {
          return true;
        }
        return Boolean(currentPromptDocId && entry.id === currentPromptDocId);
      }) ?? null,
    [currentPromptDocId, currentPromptUuid, promptHistory.history],
  );

  const currentMode: Mode = useMemo(
    () => modes.find((m) => m.id === selectedMode) || modes[0]!,
    [modes, selectedMode],
  );

  const { setDisplayedPromptSilently, handleCreateNew, loadFromHistory } =
    usePromptHistoryActions({
      debug,
      navigate,
      promptOptimizer,
      promptHistory,
      selectedMode,
      selectedModel,
      generationParams,
      currentPromptUuid,
      currentPromptDocId,
      promptContext,
      currentKeyframes: domain.keyframes,
      currentHighlightSnapshot: latestHighlightRef.current ?? initialHighlights,
      currentVersions: Array.isArray(currentHistoryEntry?.versions)
        ? currentHistoryEntry.versions
        : [],
      isApplyingHistoryRef,
    });

  const configValue = useMemo<PromptConfigState>(
    () => ({
      modes,
      selectedMode,
      setSelectedMode,
      currentMode,
      selectedModel,
      setSelectedModel,
      generationParams,
      setGenerationParams,
      videoTier,
      setVideoTier,
    }),
    [
      modes,
      selectedMode,
      setSelectedMode,
      currentMode,
      selectedModel,
      setSelectedModel,
      generationParams,
      setGenerationParams,
      videoTier,
      setVideoTier,
    ],
  );

  const uiValue = useMemo<PromptUIState>(
    () => ({
      showHistory,
      setShowHistory,
      showResults,
      setShowResults,
      showSettings,
      setShowSettings,
      showShortcuts,
      setShowShortcuts,
      showImprover,
      setShowImprover,
      showBrainstorm,
      setShowBrainstorm,
      currentAIIndex,
      setCurrentAIIndex,
      outputSaveState,
      setOutputSaveState,
      outputLastSavedAt,
      setOutputLastSavedAt,
    }),
    [
      showHistory,
      setShowHistory,
      showResults,
      setShowResults,
      showSettings,
      setShowSettings,
      showShortcuts,
      setShowShortcuts,
      showImprover,
      setShowImprover,
      showBrainstorm,
      setShowBrainstorm,
      currentAIIndex,
      setCurrentAIIndex,
      outputSaveState,
      setOutputSaveState,
      outputLastSavedAt,
      setOutputLastSavedAt,
    ],
  );

  const sessionValue = useMemo<PromptSessionState>(
    () => ({
      suggestionsData,
      setSuggestionsData,
      conceptElements,
      setConceptElements,
      promptContext,
      setPromptContext,
      currentPromptUuid,
      setCurrentPromptUuid,
      currentPromptDocId,
      setCurrentPromptDocId,
      promptIdentityRef,
      activeVersionId,
      setActiveVersionId,
    }),
    [
      suggestionsData,
      setSuggestionsData,
      conceptElements,
      setConceptElements,
      promptContext,
      setPromptContext,
      currentPromptUuid,
      setCurrentPromptUuid,
      currentPromptDocId,
      setCurrentPromptDocId,
      promptIdentityRef,
      activeVersionId,
      setActiveVersionId,
    ],
  );

  const highlightValue = useMemo<PromptHighlightState>(
    () => ({
      initialHighlights,
      setInitialHighlights,
      initialHighlightsVersion,
      setInitialHighlightsVersion,
      canUndo,
      setCanUndo,
      canRedo,
      setCanRedo,
      latestHighlightRef,
      persistedSignatureRef,
      versionEditCountRef,
      versionEditsRef,
      undoStackRef,
      redoStackRef,
      isApplyingHistoryRef,
      skipLoadFromUrlRef,
    }),
    [
      initialHighlights,
      setInitialHighlights,
      initialHighlightsVersion,
      setInitialHighlightsVersion,
      canUndo,
      setCanUndo,
      canRedo,
      setCanRedo,
      latestHighlightRef,
      persistedSignatureRef,
      versionEditCountRef,
      versionEditsRef,
      undoStackRef,
      redoStackRef,
      isApplyingHistoryRef,
      skipLoadFromUrlRef,
    ],
  );

  const promptOptimizerService = promptOptimizer;
  const promptHistoryService = promptHistory;
  const servicesValue = useMemo<PromptServicesState>(
    () => ({
      promptOptimizer: promptOptimizerService,
      promptHistory: promptHistoryService,
    }),
    [promptHistoryService, promptOptimizerService],
  );

  const actionsValue = useMemo<PromptActionsState>(
    () => ({
      applyInitialHighlightSnapshot,
      resetEditStacks,
      registerPromptEdit,
      resetVersionEdits,
      setDisplayedPromptSilently,
      handleCreateNew,
      loadFromHistory,
    }),
    [
      applyInitialHighlightSnapshot,
      resetEditStacks,
      registerPromptEdit,
      resetVersionEdits,
      setDisplayedPromptSilently,
      handleCreateNew,
      loadFromHistory,
    ],
  );

  const navigationValue = useMemo<PromptNavigationState>(
    () => ({
      navigate,
      sessionId,
    }),
    [navigate, sessionId],
  );

  usePromptStatePersistence({ selectedMode });
  useDraftHistorySync({
    currentPromptUuid,
    currentPromptDocId,
    promptHistory,
    promptOptimizer,
    selectedModel,
    generationParams,
  });

  return (
    <PromptConfigContext.Provider value={configValue}>
      <PromptUIContext.Provider value={uiValue}>
        <PromptSessionContext.Provider value={sessionValue}>
          <PromptHighlightContext.Provider value={highlightValue}>
            <PromptServicesContext.Provider value={servicesValue}>
              <PromptActionsContext.Provider value={actionsValue}>
                <PromptNavigationContext.Provider value={navigationValue}>
                  {children}
                </PromptNavigationContext.Provider>
              </PromptActionsContext.Provider>
            </PromptServicesContext.Provider>
          </PromptHighlightContext.Provider>
        </PromptSessionContext.Provider>
      </PromptUIContext.Provider>
    </PromptConfigContext.Provider>
  );
}
