import React, {
  useRef,
  useMemo,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useToast } from "@components/Toast";
import { useDebugLogger } from "@hooks/useDebugLogger";
// Performance config consumed internally by useSpanLabelingPipeline
import {
  sanitizeText,
  LABELLED_HIGHLIGHT_SELECTOR,
} from "@features/span-highlighting";
import { useEditorInput } from "./useEditorInput";

import type { SelectedSpanContextValue } from "@features/prompt-optimizer/context/SelectedSpanContext";

import { useSpanLabelingPipeline } from "./useSpanLabelingPipeline";
import { useSuggestionDetection } from "./useSuggestionDetection";
// parseResult, highlight rendering consumed by useSpanLabelingPipeline
import { usePromptCanvasState } from "./usePromptCanvasState";
import { useResolvedGenerationParams } from "./useResolvedGenerationParams";
import { usePromptStatus } from "./usePromptStatus";
import { useSpanSelectionEffects } from "./useSpanSelectionEffects";
import { useSuggestionSelection } from "./useSuggestionSelection";
import { useTextSelection } from "./useTextSelection";
import { useEditorContent } from "./useEditorContent";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { useLockedSpanInteractions } from "./useLockedSpanInteractions";
import { useInlineSuggestionState } from "./useInlineSuggestionState";
import { useVersionManagement } from "./useVersionManagement";
import { applyGenerationReuse } from "../utils/reuseGeneration";
import { resolveInitialGenerations } from "../utils/resolveInitialGenerations";
import type {
  Generation,
  GenerationsPanelProps,
} from "@features/generations/types";
import { DEFAULT_ASPECT_RATIO } from "@features/generation-controls/resolveGenerationParams";
import { buildBulkDebugPayload } from "../utils/bulkDebugPayload";
import { useGenerationControlsStoreState } from "@features/generation-controls";
import { usePromptInsertionBus } from "@features/prompt-optimizer/context/PromptInsertionBusContext";
import {
  usePromptActions,
  usePromptConfig,
  usePromptHighlights,
  usePromptServices,
  usePromptSession,
  usePromptUIStateContext,
} from "@features/prompt-optimizer/context/PromptStateContext";
import {
  usePromptResultsActions,
  usePromptResultsData,
} from "@features/prompt-optimizer/context/PromptResultsActionsContext";
import { serializeKeyframes } from "@features/prompt-optimizer/utils/keyframeTransforms";

import type { PromptCanvasViewProps } from "../components/PromptCanvasView.types";

/**
 * PromptCanvas orchestration: composes the canvas's hooks, effects, and
 * handlers behind one interface. Returns the selected-span session for the
 * provider and a fully-formed set of view props — the component renders, this
 * hook decides.
 *
 * Reads the workspace contexts directly. It used to receive 26 props from
 * PromptResultsSection, which read six contexts to build them — five of which
 * this hook then read again for other fields, so the same `currentPromptUuid`
 * arrived twice by two routes. Four of those props (`optimizedPrompt`,
 * `previewPrompt`, `currentMode`, `onCreateNew`) were never read at all.
 */
export function usePromptCanvasOrchestration(): {
  selectedSpanValue: SelectedSpanContextValue;
  viewProps: PromptCanvasViewProps;
} {
  // Get model + layout state from context
  const {
    currentMode,
    selectedModel,
    generationParams,
    setSelectedModel,
    setGenerationParams,
    setVideoTier,
  } = usePromptConfig();
  const { promptOptimizer, promptHistory } = usePromptServices();
  const { domain } = useGenerationControlsStoreState();
  const keyframes = domain.keyframes;
  const {
    currentPromptUuid,
    currentPromptDocId,
    promptIdentityRef,
    setCurrentPromptUuid,
    setCurrentPromptDocId,
    activeVersionId,
    setActiveVersionId,
    suggestionsData,
  } = usePromptSession();
  const { showResults, setShowResults } = usePromptUIStateContext();
  const {
    user,
    onDisplayedPromptChange,
    onReoptimize,
    onFetchSuggestions,
    onSuggestionClick,
    onHighlightsPersist,
    onUndo,
    onRedo,
    stablePromptContext: promptContext,
  } = usePromptResultsActions();
  const { i2vContext } = usePromptResultsData();

  const {
    inputPrompt,
    setInputPrompt: onInputPromptChange,
    displayedPrompt,
    previewAspectRatio,
    isProcessing,
    optimizationResultVersion,
  } = promptOptimizer;
  const selectedMode = currentMode.id;
  const promptUuid = currentPromptUuid;

  const [isBulkCopyLoading, setIsCopyAllDebugLoading] = useState(false);

  // Refs
  const { registerInsertHandler } = usePromptInsertionBus();
  const toast = useToast();
  const {
    applyInitialHighlightSnapshot,
    resetEditStacks,
    setDisplayedPromptSilently,
    resetVersionEdits,
  } = usePromptActions();
  const {
    initialHighlights,
    initialHighlightsVersion,
    canUndo,
    canRedo,
    latestHighlightRef,
    versionEditCountRef,
    versionEditsRef,
  } = usePromptHighlights();

  // Debug logging
  const debug = useDebugLogger("PromptCanvas", {
    mode: selectedMode,
    hasPrompt: !!displayedPrompt,
    hasHighlights: !!initialHighlights,
  });

  // Leaving the results view for editing: clear the displayed prompt and drop
  // back to the input. Was passed down as a prop built from the same two
  // setters this hook already holds.
  const onResetResultsForEditing = useCallback((): void => {
    setDisplayedPromptSilently("");
    setShowResults(false);
  }, [setDisplayedPromptSilently, setShowResults]);
  const { lockedSpans, addLockedSpan, removeLockedSpan } = promptOptimizer;
  const serializedKeyframes = useMemo(
    () => serializeKeyframes(keyframes),
    [keyframes],
  );

  const { effectiveAspectRatio, durationSeconds, fpsNumber } =
    useResolvedGenerationParams({ generationParams, previewAspectRatio });

  const enableMLHighlighting = selectedMode === "video" && showResults;

  const { state, setState } = usePromptCanvasState();
  const {
    selectedSpanId,
    lastAppliedSpanId,
    hasInteracted,
    hoveredSpanId,
    showHighlights,
    generatedTimestamp,
  } = state;

  // Normalize to NFC so span offsets and rendered text stay aligned.
  const normalizedDisplayedPrompt = useMemo(
    () => (displayedPrompt == null ? null : sanitizeText(displayedPrompt)),
    [displayedPrompt],
  );
  const normalizedInputPrompt = useMemo(
    () => sanitizeText(inputPrompt ?? ""),
    [inputPrompt],
  );

  const editorDisplayText = showResults
    ? (normalizedDisplayedPrompt ?? "")
    : normalizedInputPrompt;
  const editorRef = useRef<HTMLDivElement>(null!);
  const editorWrapperRef = useRef<HTMLDivElement>(null!);
  const lockButtonRef = useRef<HTMLButtonElement>(null!);
  const handleCopyEvent = useCallback(
    (event: React.ClipboardEvent): void => {
      if (window.getSelection()?.toString().trim()) return;
      event.clipboardData.setData("text/plain", editorDisplayText);
      event.preventDefault();
    },
    [editorDisplayText],
  );
  // Extract suggestions visibility state for contextual UI
  const isSuggestionsOpen = Boolean(
    selectedSpanId || (suggestionsData && suggestionsData.show !== false),
  );
  const {
    currentVersions,
    activeVersion,
    promptVersionId,
    createVersionIfNeeded,
    handleGenerationsChange,
    setGenerationFavorite,
    syncVersionHighlights,
    versioningPromptUuid,
  } = useVersionManagement({
    promptHistory,
    currentPromptUuid,
    currentPromptDocId,
    promptIdentityRef,
    setCurrentPromptUuid,
    setCurrentPromptDocId,
    activeVersionId,
    setActiveVersionId,
    inputPrompt,
    normalizedDisplayedPrompt,
    selectedMode,
    selectedModel,
    generationParams,
    serializedKeyframes,
    latestHighlightRef,
    versionEditCountRef,
    versionEditsRef,
    resetVersionEdits,
  });

  const handleReuseGeneration = useCallback(
    (generation: Generation): void => {
      applyGenerationReuse(generation, {
        onInputPromptChange,
        onResetResultsForEditing,
        setSelectedModel,
        setVideoTier,
        setGenerationParams,
      });
    },
    [
      onInputPromptChange,
      onResetResultsForEditing,
      setGenerationParams,
      setSelectedModel,
      setVideoTier,
    ],
  );

  const generationsPanelProps = useMemo<GenerationsPanelProps>(
    () => ({
      prompt: showResults
        ? (normalizedDisplayedPrompt ?? "")
        : normalizedInputPrompt,
      promptVersionId,
      aspectRatio: effectiveAspectRatio ?? DEFAULT_ASPECT_RATIO,
      duration: durationSeconds ?? undefined,
      fps: fpsNumber ?? undefined,
      generationParams: generationParams ?? undefined,
      initialGenerations: resolveInitialGenerations(
        activeVersion?.generations ?? undefined,
        promptVersionId,
      ),
      onGenerationsChange: handleGenerationsChange,
      versions: currentVersions,
      onCreateVersionIfNeeded: createVersionIfNeeded,
    }),
    [
      showResults,
      normalizedDisplayedPrompt,
      normalizedInputPrompt,
      promptVersionId,
      effectiveAspectRatio,
      durationSeconds,
      fpsNumber,
      generationParams,
      activeVersion,
      handleGenerationsChange,
      currentVersions,
      createVersionIfNeeded,
    ],
  );

  const setSelectedSpanId = useCallback(
    (value: string | null) => setState({ selectedSpanId: value }),
    [setState],
  );
  const handleSpanSelect = useCallback(
    (spanId: string | null): void => {
      if (!spanId) {
        setSelectedSpanId(null);
        return;
      }
      if (selectedSpanId && spanId === selectedSpanId) {
        setSelectedSpanId(null);
        return;
      }
      setSelectedSpanId(spanId);
    },
    [selectedSpanId, setSelectedSpanId],
  );
  const setHoveredSpanId = useCallback(
    (value: string | null) => setState({ hoveredSpanId: value }),
    [setState],
  );

  // --- Span Labeling Pipeline ---
  // Composes: data conversion → labeling → signature gate → parse → highlight rendering
  const { parseResult, highlightFingerprint, formattedHTML } =
    useSpanLabelingPipeline({
      displayedPrompt,
      promptUuid,
      selectedMode,
      showResults,
      initialHighlights: initialHighlights ?? null,
      initialHighlightsVersion,
      optimizationResultVersion,
      editorRef: editorRef as React.RefObject<HTMLElement>,
      showHighlights,
      i2vContext,
      onHighlightsPersist,
      syncVersionHighlights,
      versioningPromptUuid,
    });

  // Suggestion detection hook
  useSuggestionDetection({
    displayedPrompt: normalizedDisplayedPrompt,
    isSuggestionsOpen,
  });

  // Performance timer: Track when prompt appears on screen
  useEffect(() => {
    if (
      normalizedDisplayedPrompt &&
      normalizedDisplayedPrompt.trim() &&
      enableMLHighlighting
    ) {
      performance.mark("prompt-displayed-on-screen");
      debug.logEffect("Prompt displayed on screen", {
        promptLength: normalizedDisplayedPrompt.length,
        mlHighlighting: enableMLHighlighting,
      });
    }
  }, [normalizedDisplayedPrompt, enableMLHighlighting, debug]);

  // Ambient motion: every ~6s, momentarily fade a random token
  useEffect(() => {
    if (!showHighlights) return;
    const root = editorRef.current;
    if (!root) return;
    const interval = window.setInterval(() => {
      const nodes = root.querySelectorAll(LABELLED_HIGHLIGHT_SELECTOR);
      if (!nodes.length) return;
      const node = nodes[
        Math.floor(Math.random() * nodes.length)
      ] as HTMLElement;
      node.classList.add("opacity-80");
      window.setTimeout(() => node.classList.remove("opacity-80"), 200);
    }, 6000);
    return () => window.clearInterval(interval);
  }, [editorRef, showHighlights, normalizedDisplayedPrompt]);

  // Text selection hook
  const {
    handleTextSelection,
    handleHighlightClick,
    handleHighlightMouseDown,
  } = useTextSelection({
    selectedMode,
    editorRef: editorRef as React.RefObject<HTMLElement>,
    displayedPrompt: normalizedDisplayedPrompt,
    parseResult,
    selectedSpanId,
    onFetchSuggestions,
    onSpanSelect: handleSpanSelect,
  });

  const { handleHighlightMouseEnter, handleHighlightMouseLeave } =
    useLockedSpanInteractions({
      editorRef: editorRef as React.RefObject<HTMLElement>,
      editorWrapperRef,
      lockButtonRef,
      enableMLHighlighting,
      showHighlights,
      hoveredSpanId,
      setHoveredSpanId,
      parseResultSpans: parseResult.spans,
      lockedSpans,
      addLockedSpan,
      removeLockedSpan,
      highlightFingerprint,
      displayedPrompt: normalizedDisplayedPrompt,
    });

  usePromptStatus({
    displayedPrompt: normalizedDisplayedPrompt,
    inputPrompt,
    isProcessing,
    generatedTimestamp,
    setState,
  });

  // Editor content hook
  useEditorContent({
    editorRef: editorRef as React.RefObject<HTMLElement>,
    editorText: editorDisplayText,
    formattedHTML,
    renderHtml: showResults,
  });

  useSpanSelectionEffects({
    editorRef: editorRef as React.RefObject<HTMLElement>,
    enableMLHighlighting,
    selectedSpanId,
    displayedPrompt: normalizedDisplayedPrompt,
    setState,
  });

  useSuggestionSelection({
    selectedSpanId,
    hasInteracted,
    setState,
  });

  // Keyboard shortcuts hook
  useKeyboardShortcuts({
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    toast,
  });

  const { handleInput } = useEditorInput({
    editorRef: editorRef as React.RefObject<HTMLElement>,
    editorDisplayText,
    showResults,
    onInputPromptChange,
    onDisplayedPromptChange,
    onResetResultsForEditing,
    registerInsertHandler,
    logAction: debug.logAction,
  });

  const {
    suggestionCount,
    inlineSuggestions,
    activeSuggestionIndex,
    setActiveSuggestionIndex,
    suggestionsListRef,
    interactionSourceRef,
    handleSuggestionClickWithFeedback,
    closeInlinePopover,
    selectionLabel,
    isMotionSelection,
    customRequest,
    setCustomRequest,
    customRequestError,
    setCustomRequestError,
    handleCustomRequestSubmit,
    isCustomRequestDisabled,
    isCustomLoading,
    isInlineLoading,
    isInlineError,
    inlineErrorMessage,
    isInlineEmpty,
    handleApplyActiveSuggestion,
  } = useInlineSuggestionState({
    suggestionsData,
    selectedSpanId,
    setSelectedSpanId,
    parseResultSpans: parseResult.spans,
    normalizedDisplayedPrompt,
    onSuggestionClick,
    setState,
  });

  const handleCopyAllDebug = useCallback(async (): Promise<void> => {
    if (!import.meta.env.DEV) {
      return;
    }

    if (isBulkCopyLoading) {
      return;
    }

    const promptText = (normalizedDisplayedPrompt ?? "").trim();
    if (!promptText) {
      toast.error("No prompt available to export debug context.");
      return;
    }

    setIsCopyAllDebugLoading(true);
    try {
      const payload = await buildBulkDebugPayload({
        promptText,
        spans: Array.isArray(parseResult.spans) ? parseResult.spans : [],
        inputPrompt,
        promptContext,
      });

      if (!payload) {
        toast.error("No labeled spans available for bulk debug export.");
        return;
      }

      if (typeof navigator === "undefined" || !navigator.clipboard) {
        toast.error("Clipboard is not available in this browser.");
        return;
      }

      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      toast.success(
        `Copied debug for ${payload.successfulSpans}/${payload.totalSpans} spans.`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to copy all debug context";
      toast.error(message);
    } finally {
      setIsCopyAllDebugLoading(false);
    }
  }, [
    inputPrompt,
    isBulkCopyLoading,
    normalizedDisplayedPrompt,
    parseResult.spans,
    promptContext,
    toast,
  ]);

  // Render the component

  const selectedSpanValue: SelectedSpanContextValue = {
    selectedSpanId,
    selectionLabel,
    isMotionSelection,
    suggestionCount,
    suggestionsListRef,
    inlineSuggestions,
    activeSuggestionIndex,
    onActiveSuggestionChange: setActiveSuggestionIndex,
    interactionSourceRef,
    onSuggestionClick: handleSuggestionClickWithFeedback,
    onCloseInlinePopover: closeInlinePopover,
    onApplyActiveSuggestion: handleApplyActiveSuggestion,
    customRequest,
    onCustomRequestChange: setCustomRequest,
    customRequestError,
    onCustomRequestErrorChange: setCustomRequestError,
    onCustomRequestSubmit: handleCustomRequestSubmit,
    isCustomRequestDisabled,
    isCustomLoading,
    responseMetadata: suggestionsData?.responseMetadata ?? null,
    onCopyAllDebug: handleCopyAllDebug,
    isBulkCopyLoading,
    isInlineLoading,
    isInlineError,
    inlineErrorMessage,
    isInlineEmpty,
  };

  const viewProps: PromptCanvasViewProps = {
    editing: {
      editorRef,
      isEmpty: !editorDisplayText.trim(),
      onTextSelection: handleTextSelection,
      onHighlightClick: handleHighlightClick,
      onHighlightMouseDown: handleHighlightMouseDown,
      onHighlightMouseEnter: handleHighlightMouseEnter,
      onHighlightMouseLeave: handleHighlightMouseLeave,
      onCopyEvent: handleCopyEvent,
      onInput: handleInput,
    },
    generationsPanelProps,
    onReuseGeneration: handleReuseGeneration,
    onToggleGenerationFavorite: setGenerationFavorite,
  };

  return { selectedSpanValue, viewProps };
}
