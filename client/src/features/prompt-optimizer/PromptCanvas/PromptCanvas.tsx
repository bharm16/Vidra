import React, {
  useRef,
  useMemo,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useDrawerState } from "@components/CollapsibleDrawer";
import { useToast } from "@components/Toast";
import { useDebugLogger } from "@hooks/useDebugLogger";
// Performance config consumed internally by useSpanLabelingPipeline
import { sanitizeText } from "@/features/span-highlighting";
import { useTriggerAutocomplete } from "@features/assets/hooks/useTriggerAutocomplete";
import { useOutlineOverlay } from "./hooks/useOutlineOverlay";
import { useEditorInput } from "./hooks/useEditorInput";

import type { PromptCanvasProps } from "./types";
import {
  SelectedSpanProvider,
  type SelectedSpanContextValue,
} from "../context/SelectedSpanContext";

import { useSpanLabelingPipeline } from "./hooks/useSpanLabelingPipeline";
import { useSuggestionDetection } from "./hooks/useSuggestionDetection";
// parseResult, highlight rendering consumed by useSpanLabelingPipeline
import { usePromptCanvasState } from "./hooks/usePromptCanvasState";
import { usePromptStatus } from "./hooks/usePromptStatus";
import { useSpanSelectionEffects } from "./hooks/useSpanSelectionEffects";
import { useCoherenceSpanMarkers } from "./hooks/useCoherenceSpanMarkers";
import { useSuggestionSelection } from "./hooks/useSuggestionSelection";
import { useTextSelection } from "./hooks/useTextSelection";
import { useEditorContent } from "./hooks/useEditorContent";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { usePromptExport } from "./hooks/usePromptExport";
import { useLockedSpanInteractions } from "./hooks/useLockedSpanInteractions";
import { useTriggerValidation } from "./hooks/useTriggerValidation";
import { useInlineSuggestionState } from "./hooks/useInlineSuggestionState";
import { useCanvasEditorState } from "./hooks/useCanvasEditorState";
import { useCanvasGenerations } from "./hooks/useCanvasGenerations";
import { useCanvasCoherence } from "./hooks/useCanvasCoherence";
import { scrollToSpan } from "../SpanCategoryAccordion/utils/spanFormatting";
import { PromptCanvasView } from "./components/PromptCanvasView";
import { postEnhancementSuggestions } from "@/api/enhancementSuggestionsApi";
import { buildSuggestionContext } from "@features/prompt-optimizer/utils/enhancementSuggestionContext";
import { prepareSpanContext } from "@features/span-highlighting/utils/spanProcessing";
import { useGenerationControlsStoreState } from "@features/generation-controls";
import { useWorkspaceSession } from "../context/WorkspaceSessionContext";
import { usePromptInsertionBus } from "../context/PromptInsertionBusContext";
import {
  usePromptActions,
  usePromptConfig,
  usePromptHighlights,
  usePromptServices,
  usePromptSession,
} from "../context/PromptStateContext";
import { serializeKeyframes } from "../utils/keyframeTransforms";

// Main PromptCanvas Component
export function PromptCanvas({
  user = null,
  showResults = false,
  inputPrompt,
  onInputPromptChange,
  onReoptimize,
  onResetResultsForEditing,
  displayedPrompt,
  previewAspectRatio = null,
  qualityScore,
  selectedMode,
  promptUuid,
  promptContext,
  onDisplayedPromptChange: _onDisplayedPromptChange,
  suggestionsData,
  onFetchSuggestions,
  onSuggestionClick,
  initialHighlights = null,
  initialHighlightsVersion = 0,
  onHighlightsPersist,
  onUndo = () => {},
  onRedo = () => {},
  canUndo = false,
  canRedo = false,
  isProcessing = false,
  optimizationResultVersion = 0,
  coherenceAffectedSpanIds,
  coherenceSpanIssueMap,
  coherenceIssues,
  isCoherenceChecking,
  isCoherencePanelExpanded,
  onToggleCoherencePanelExpanded,
  onDismissCoherenceIssue,
  onDismissAllCoherenceIssues,
  onApplyCoherenceFix,
  onScrollToCoherenceSpan,
  i2vContext,
}: PromptCanvasProps): React.ReactElement {
  const [isBulkCopyLoading, setIsCopyAllDebugLoading] = useState(false);

  // Debug logging
  const debug = useDebugLogger("PromptCanvas", {
    mode: selectedMode,
    hasPrompt: !!displayedPrompt,
    hasHighlights: !!initialHighlights,
  });

  // Refs
  const outlineOverlayRef = useRef<HTMLDivElement>(null!);
  const { registerInsertHandler } = usePromptInsertionBus();
  const toast = useToast();
  const versionsDrawer = useDrawerState({
    defaultOpen: true,
    storageKey: "prompt-optimizer:versions-drawer",
    position: "bottom",
    desktopMode: "push",
  });

  // Get model + layout state from context
  const {
    selectedModel,
    generationParams,
    setSelectedModel,
    setGenerationParams,
    setVideoTier,
  } = usePromptConfig();
  const { promptOptimizer, promptHistory } = usePromptServices();
  const { domain } = useGenerationControlsStoreState();
  const keyframes = domain.keyframes;
  const { hasActiveContinuityShot, currentShot, updateShot } =
    useWorkspaceSession();
  const hasShotContext = Boolean(hasActiveContinuityShot && currentShot);
  const {
    currentPromptUuid,
    currentPromptDocId,
    setCurrentPromptUuid,
    setCurrentPromptDocId,
    activeVersionId,
    setActiveVersionId,
  } = usePromptSession();
  const {
    applyInitialHighlightSnapshot,
    resetEditStacks,
    setDisplayedPromptSilently,
    resetVersionEdits,
  } = usePromptActions();
  const { latestHighlightRef, versionEditCountRef, versionEditsRef } =
    usePromptHighlights();
  const { lockedSpans, addLockedSpan, removeLockedSpan } = promptOptimizer;
  const serializedKeyframes = useMemo(
    () => serializeKeyframes(keyframes),
    [keyframes],
  );

  const effectiveAspectRatio = useMemo(() => {
    const fromParams = generationParams?.aspect_ratio;
    if (typeof fromParams === "string" && fromParams.trim()) {
      return fromParams.trim();
    }
    return previewAspectRatio;
  }, [generationParams, previewAspectRatio]);

  const durationSeconds = useMemo(() => {
    const durationValue = generationParams?.duration_s;
    if (typeof durationValue === "number") {
      return Number.isFinite(durationValue) ? durationValue : null;
    }
    if (typeof durationValue === "string") {
      const parsed = Number.parseFloat(durationValue);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }, [generationParams?.duration_s]);

  const fpsNumber = useMemo(() => {
    const fpsValue = generationParams?.fps;
    return typeof fpsValue === "number" && Number.isFinite(fpsValue)
      ? fpsValue
      : null;
  }, [generationParams?.fps]);

  const enableMLHighlighting = selectedMode === "video" && showResults;

  const { state, setState } = usePromptCanvasState();
  const {
    showLegend,
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
  const isOptimizing = Boolean(isProcessing);

  const {
    editorRef,
    editorWrapperRef,
    editorColumnRef,
    outputLocklineRef,
    lockButtonRef,
    exportMenuRef,
    generationsSheetOpen,
    setGenerationsSheetOpen,
    showDiff,
    setShowDiff,
    copied,
    handleCopy,
    handleCopyEvent,
    handleShare,
    showExportMenu,
    setShowExportMenu,
    modelFormatOptions,
    modelFormatValue,
    modelFormatLabel,
    handleModelFormatChange,
  } = useCanvasEditorState({
    showResults,
    displayedPrompt: editorDisplayText,
    inputPrompt,
    promptUuid,
    isOptimizing,
    genericOptimizedPrompt: promptOptimizer.genericOptimizedPrompt,
    onReoptimize,
    logAction: debug.logAction,
  });
  const {
    isOpen: autocompleteOpen,
    suggestions: autocompleteSuggestions,
    selectedIndex: autocompleteSelectedIndex,
    position: autocompletePosition,
    isLoading: autocompleteLoading,
    handleInputChange: handleAutocomplete,
    handleKeyDown: handleAutocompleteKeyDown,
    setSelectedIndex: setAutocompleteSelectedIndex,
    close: closeAutocomplete,
  } = useTriggerAutocomplete();

  const validateTriggers = useTriggerValidation(500);
  const hasCanvasContent = true;

  useEffect(() => {
    if (!hasCanvasContent) {
      setGenerationsSheetOpen(false);
      setShowDiff(false);
    }
  }, [hasCanvasContent, setGenerationsSheetOpen, setShowDiff]);

  // Extract suggestions visibility state for contextual UI
  const isSuggestionsOpen = Boolean(
    selectedSpanId || (suggestionsData && suggestionsData.show !== false),
  );
  const {
    currentVersions,
    orderedVersions,
    selectedVersionId,
    promptVersionId,
    handleSelectVersion,
    handleCreateVersion,
    createVersionIfNeeded,
    handleGenerationsChange,
    syncVersionHighlights,
    versioningPromptUuid,
    versionsPanelProps,
    generationsPanelProps,
    handleReuseGeneration,
    handleToggleGenerationFavorite,
  } = useCanvasGenerations({
    hasShotContext,
    currentShot,
    updateShot,
    promptHistory,
    currentPromptUuid,
    currentPromptDocId,
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
    promptOptimizer,
    applyInitialHighlightSnapshot,
    resetEditStacks,
    setDisplayedPromptSilently,
    latestHighlightRef,
    versionEditCountRef,
    versionEditsRef,
    resetVersionEdits,
    effectiveAspectRatio,
    showResults,
    normalizedInputPrompt,
    durationSeconds,
    fpsNumber,
    onInputPromptChange,
    onResetResultsForEditing,
    setSelectedModel,
    setVideoTier,
    setGenerationParams,
  });

  const setShowLegend = useCallback(
    (value: boolean) => setState({ showLegend: value }),
    [setState],
  );
  const setRightPaneMode = useCallback(
    (value: "refine" | "preview") => setState({ rightPaneMode: value }),
    [setState],
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

  // Span outline overlay (state machine, dismissal, hover brightness)
  const { outlineOverlayState, outlineOverlayActive, openOutlineOverlay } =
    useOutlineOverlay({
      outlineOverlayRef,
      editorRef: editorRef as React.RefObject<HTMLElement>,
      enableMLHighlighting,
      showHighlights,
      hoveredSpanId,
      setHoveredSpanId,
    });

  // --- Span Labeling Pipeline ---
  // Composes: data conversion → labeling → signature gate → parse → highlight rendering
  const { parseResult, categorySpans, highlightFingerprint, formattedHTML } =
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

  const hasVisibleOutput =
    typeof normalizedDisplayedPrompt === "string" &&
    normalizedDisplayedPrompt.length > 0;
  const isOutputLoading = Boolean(isProcessing && !hasVisibleOutput);

  // Ambient motion: every ~6s, momentarily fade a random token
  useEffect(() => {
    if (!showHighlights) return;
    const root = editorRef.current;
    if (!root) return;
    const interval = window.setInterval(() => {
      const nodes = root.querySelectorAll("span.value-word[data-span-id]");
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
    onIntentRefine: () => setRightPaneMode("refine"),
    isI2VMode: Boolean(i2vContext?.isI2VMode),
  });

  const {
    lockButtonPosition,
    isHoveredLocked,
    handleHighlightMouseEnter,
    handleHighlightMouseLeave,
    handleLockButtonMouseLeave,
    handleToggleLock,
    cancelHideLockButton,
  } = useLockedSpanInteractions({
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

  useCoherenceSpanMarkers({
    editorRef: editorRef as React.RefObject<HTMLElement>,
    enableMLHighlighting,
    showHighlights,
    affectedSpanIds: coherenceAffectedSpanIds ?? null,
    spanIssueMap: coherenceSpanIssueMap ?? null,
    highlightFingerprint,
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const isEditable =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (isEditable) return;

      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const isMod = isMac ? event.metaKey : event.ctrlKey;

      if (!isMod || !["1", "2", "3"].includes(event.key)) return;

      const index = Number.parseInt(event.key, 10) - 1;
      const version = orderedVersions[index];
      if (version?.versionId) {
        event.preventDefault();
        handleSelectVersion(version.versionId);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSelectVersion, orderedVersions]);

  const handleExport = usePromptExport({
    inputPrompt,
    displayedPrompt: normalizedDisplayedPrompt,
    qualityScore,
    selectedMode,
    setShowExportMenu,
    toast,
    debug,
  });

  const { handleInput, handleEditorKeyDown, insertTrigger } = useEditorInput({
    editorRef: editorRef as React.RefObject<HTMLElement>,
    editorDisplayText,
    showResults,
    onInputPromptChange,
    onResetResultsForEditing,
    handleAutocomplete,
    handleAutocompleteKeyDown,
    closeAutocomplete,
    validateTriggers,
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
    ...(onSuggestionClick ? { onSuggestionClick } : {}),
    setState,
  });

  const coherence = useCanvasCoherence({
    coherenceIssues,
    isCoherenceChecking,
    isCoherencePanelExpanded,
    onToggleCoherencePanelExpanded,
    onDismissCoherenceIssue,
    onDismissAllCoherenceIssues,
    onApplyCoherenceFix,
    onScrollToCoherenceSpan,
  });

  const focusSpan = useCallback(
    (spanId: string | null): void => {
      if (!spanId) return;

      setSelectedSpanId(spanId);

      const span = Array.isArray(parseResult?.spans)
        ? parseResult.spans.find((candidate) => {
            const candidateId =
              typeof candidate?.id === "string" && candidate.id.length > 0
                ? candidate.id
                : `span_${candidate.start}_${candidate.end}`;
            return candidateId === spanId;
          })
        : null;

      if (span) {
        scrollToSpan(editorRef as React.RefObject<HTMLElement>, { id: spanId });
      }

      if (!span || !onFetchSuggestions) {
        return;
      }

      const quote =
        typeof span.quote === "string" && span.quote.trim().length > 0
          ? span.quote
          : typeof span.text === "string"
            ? span.text
            : "";

      onFetchSuggestions({
        highlightedText: quote,
        originalText: quote,
        displayedPrompt: normalizedDisplayedPrompt ?? "",
        range: null,
        offsets: { start: span.start, end: span.end },
        metadata: {
          category: span.category,
          source: span.source,
          spanId,
          start: span.start,
          end: span.end,
          startGrapheme: span.startGrapheme,
          endGrapheme: span.endGrapheme,
          validatorPass: span.validatorPass,
          confidence: span.confidence,
          quote,
          leftCtx: span.leftCtx,
          rightCtx: span.rightCtx,
          idempotencyKey: span.idempotencyKey,
          span: span,
        },
        trigger: "category-accordion",
        allLabeledSpans: parseResult.spans,
      });
    },
    [
      onFetchSuggestions,
      normalizedDisplayedPrompt,
      parseResult.spans,
      editorRef,
      setSelectedSpanId,
    ],
  );

  const handleEnhance = useCallback((): void => {
    if (isOptimizing) {
      return;
    }

    const promptToEnhance = editorDisplayText.trim();
    if (!promptToEnhance) {
      return;
    }

    void onReoptimize(promptToEnhance);
  }, [editorDisplayText, isOptimizing, onReoptimize]);

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

    const spans = Array.isArray(parseResult.spans) ? parseResult.spans : [];
    const spanTargets = spans
      .map((span) => {
        const spanText =
          typeof span.displayQuote === "string" &&
          span.displayQuote.trim().length > 0
            ? span.displayQuote.trim()
            : typeof span.quote === "string" && span.quote.trim().length > 0
              ? span.quote.trim()
              : typeof span.text === "string" && span.text.trim().length > 0
                ? span.text.trim()
                : "";
        if (!spanText) {
          return null;
        }
        return {
          span,
          spanText,
          spanId:
            typeof span.id === "string" && span.id.length > 0
              ? span.id
              : `span_${span.start}_${span.end}`,
        };
      })
      .filter(
        (
          item,
        ): item is {
          span: (typeof spans)[number];
          spanText: string;
          spanId: string;
        } => item !== null,
      );

    if (spanTargets.length === 0) {
      toast.error("No labeled spans available for bulk debug export.");
      return;
    }

    const serializedContext =
      promptContext &&
      typeof promptContext === "object" &&
      "toJSON" in promptContext &&
      typeof (promptContext as { toJSON?: () => unknown }).toJSON === "function"
        ? (promptContext as { toJSON: () => unknown }).toJSON()
        : promptContext;

    const normalizedPrompt = promptText.normalize("NFC");

    setIsCopyAllDebugLoading(true);
    try {
      const settled = await Promise.allSettled(
        spanTargets.map(async ({ span, spanText, spanId }) => {
          const preferIndex =
            typeof span.start === "number" && Number.isFinite(span.start)
              ? span.start
              : null;
          const context = buildSuggestionContext(
            normalizedPrompt,
            spanText.normalize("NFC"),
            preferIndex,
            1000,
          );
          const metadata = {
            start: span.start,
            end: span.end,
            category: span.category,
            confidence: span.confidence,
            span,
          };
          const spanContext = prepareSpanContext(metadata, spans);

          const response = await postEnhancementSuggestions({
            highlightedText: spanText.normalize("NFC"),
            contextBefore: context.contextBefore,
            contextAfter: context.contextAfter,
            fullPrompt: normalizedPrompt,
            originalUserPrompt: inputPrompt,
            brainstormContext: serializedContext ?? null,
            highlightedCategory: span.category ?? null,
            highlightedCategoryConfidence:
              typeof span.confidence === "number" ? span.confidence : null,
            highlightedPhrase: spanText,
            allLabeledSpans: spanContext.simplifiedSpans,
            nearbySpans: spanContext.nearbySpans,
            editHistory: [],
          });

          return {
            spanId,
            text: spanText,
            category: span.category ?? null,
            confidence:
              typeof span.confidence === "number" ? span.confidence : null,
            start: span.start,
            end: span.end,
            suggestionCount: Array.isArray(response.suggestions)
              ? response.suggestions.length
              : 0,
            debug: response._debug ?? null,
          };
        }),
      );

      const entries = settled.map((result, index) => {
        const target = spanTargets[index];
        if (!target) {
          return {
            spanId: `unknown_${index}`,
            status: "error",
            error: "Unknown span target",
          };
        }

        if (result.status === "fulfilled") {
          return {
            status: "ok",
            ...result.value,
          };
        }

        return {
          spanId: target.spanId,
          text: target.spanText,
          category: target.span.category ?? null,
          confidence:
            typeof target.span.confidence === "number"
              ? target.span.confidence
              : null,
          start: target.span.start,
          end: target.span.end,
          status: "error",
          error:
            result.reason instanceof Error
              ? result.reason.message
              : "Failed to fetch debug data for span",
        };
      });

      const successCount = entries.filter((entry) => {
        return (
          entry.status === "ok" && "debug" in entry && entry.debug !== null
        );
      }).length;
      const payload = {
        generatedAt: new Date().toISOString(),
        totalSpans: entries.length,
        successfulSpans: successCount,
        failedSpans: entries.length - successCount,
        entries,
      };

      if (typeof navigator === "undefined" || !navigator.clipboard) {
        toast.error("Clipboard is not available in this browser.");
        return;
      }

      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      toast.success(
        `Copied debug for ${successCount}/${entries.length} spans.`,
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

  return (
    <SelectedSpanProvider value={selectedSpanValue}>
      <PromptCanvasView
        selectedMode={selectedMode}
        outlineOverlayActive={outlineOverlayActive}
        outlineOverlayState={outlineOverlayState}
        outlineOverlayRef={outlineOverlayRef}
        categorySpans={categorySpans}
        editorRef={editorRef}
        onCategorySpanHoverChange={setHoveredSpanId}
        showLegend={showLegend}
        onCloseLegend={() => setShowLegend(false)}
        promptContext={promptContext}
        isSuggestionsOpen={isSuggestionsOpen}
        hasCanvasContent={hasCanvasContent}
        editorColumnRef={editorColumnRef}
        editorWrapperRef={editorWrapperRef}
        outputLocklineRef={outputLocklineRef}
        lockButtonRef={lockButtonRef}
        onTextSelection={handleTextSelection}
        onHighlightClick={handleHighlightClick}
        onHighlightMouseDown={handleHighlightMouseDown}
        onHighlightMouseEnter={handleHighlightMouseEnter}
        onHighlightMouseLeave={handleHighlightMouseLeave}
        onCopyEvent={handleCopyEvent}
        onInput={handleInput}
        onEditorKeyDown={handleEditorKeyDown}
        onEditorBlur={closeAutocomplete}
        autocompleteOpen={autocompleteOpen}
        autocompleteSuggestions={autocompleteSuggestions}
        autocompleteSelectedIndex={autocompleteSelectedIndex}
        autocompletePosition={autocompletePosition}
        autocompleteLoading={autocompleteLoading}
        onAutocompleteSelect={insertTrigger}
        onAutocompleteClose={closeAutocomplete}
        onAutocompleteIndexChange={setAutocompleteSelectedIndex}
        enableMLHighlighting={enableMLHighlighting}
        hoveredSpanId={hoveredSpanId}
        lockButtonPosition={lockButtonPosition}
        isHoveredLocked={isHoveredLocked}
        onToggleLock={handleToggleLock}
        onCancelHideLockButton={cancelHideLockButton}
        onLockButtonMouseLeave={handleLockButtonMouseLeave}
        isOutputLoading={isOutputLoading}
        coherenceIssues={coherence.coherenceIssues}
        isCoherenceChecking={coherence.isCoherenceChecking}
        isCoherencePanelExpanded={coherence.isCoherencePanelExpanded}
        onToggleCoherencePanelExpanded={
          coherence.onToggleCoherencePanelExpanded
        }
        onDismissCoherenceIssue={coherence.onDismissCoherenceIssue}
        onDismissAllCoherenceIssues={coherence.onDismissAllCoherenceIssues}
        onApplyCoherenceFix={coherence.onApplyCoherenceFix}
        onScrollToCoherenceSpan={coherence.onScrollToCoherenceSpan}
        versionsDrawer={versionsDrawer}
        versionsPanelProps={versionsPanelProps}
        generationsPanelProps={generationsPanelProps}
        onReuseGeneration={handleReuseGeneration}
        onToggleGenerationFavorite={handleToggleGenerationFavorite}
        generationsSheetOpen={generationsSheetOpen}
        onGenerationsSheetOpenChange={setGenerationsSheetOpen}
        showDiff={showDiff}
        onShowDiffChange={setShowDiff}
        inputPrompt={inputPrompt}
        normalizedDisplayedPrompt={normalizedDisplayedPrompt}
        openOutlineOverlay={openOutlineOverlay}
        copied={copied}
        onCopy={handleCopy}
        modelFormatValue={modelFormatValue}
        modelFormatLabel={modelFormatLabel}
        modelFormatOptions={modelFormatOptions}
        modelFormatDisabled={isOptimizing || modelFormatOptions.length === 0}
        onModelFormatChange={handleModelFormatChange}
        onUndo={onUndo}
        onRedo={onRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        exportMenuRef={exportMenuRef}
        showExportMenu={showExportMenu}
        onToggleExportMenu={setShowExportMenu}
        onExport={handleExport}
        onShare={handleShare}
        onEnhance={handleEnhance}
        isEnhancing={isOptimizing}
      />
    </SelectedSpanProvider>
  );
}
