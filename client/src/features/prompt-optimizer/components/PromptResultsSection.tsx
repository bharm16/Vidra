import React from "react";
import { PromptCanvas } from "../PromptCanvas";
import {
  usePromptActions,
  usePromptConfig,
  usePromptHighlights,
  usePromptServices,
  usePromptSession,
  usePromptUIStateContext,
} from "../context/PromptStateContext";
import { usePromptResultsActionsContext } from "../context/PromptResultsActionsContext";

/**
 * PromptResultsSection - Results/Canvas Section
 *
 * Handles the prompt canvas and results display
 * Extracted from PromptOptimizerContainer for better separation of concerns
 */
export const PromptResultsSection = (): React.ReactElement => {
  const { showResults, setShowResults } = usePromptUIStateContext();
  const { currentPromptUuid, suggestionsData } = usePromptSession();
  const { currentMode } = usePromptConfig();
  const { initialHighlights, initialHighlightsVersion, canUndo, canRedo } =
    usePromptHighlights();
  const { handleCreateNew, setDisplayedPromptSilently } = usePromptActions();
  const { promptOptimizer } = usePromptServices();
  const {
    user,
    onDisplayedPromptChange,
    onReoptimize,
    onFetchSuggestions,
    onSuggestionClick,
    onHighlightsPersist,
    onUndo,
    onRedo,
    stablePromptContext,
    i2vContext,
  } = usePromptResultsActionsContext();

  const handleResetResultsForEditing = React.useCallback((): void => {
    setDisplayedPromptSilently("");
    setShowResults(false);
  }, [setDisplayedPromptSilently, setShowResults]);

  return (
    <PromptCanvas
      showResults={showResults}
      user={user}
      inputPrompt={promptOptimizer.inputPrompt}
      onInputPromptChange={promptOptimizer.setInputPrompt}
      onResetResultsForEditing={handleResetResultsForEditing}
      onReoptimize={onReoptimize}
      displayedPrompt={promptOptimizer.displayedPrompt}
      optimizedPrompt={promptOptimizer.optimizedPrompt}
      previewPrompt={promptOptimizer.previewPrompt}
      previewAspectRatio={promptOptimizer.previewAspectRatio}
      qualityScore={promptOptimizer.qualityScore}
      selectedMode={currentMode.id}
      currentMode={currentMode}
      promptUuid={currentPromptUuid}
      promptContext={stablePromptContext}
      onDisplayedPromptChange={onDisplayedPromptChange}
      suggestionsData={suggestionsData}
      onFetchSuggestions={onFetchSuggestions}
      onSuggestionClick={onSuggestionClick}
      onCreateNew={handleCreateNew}
      initialHighlights={initialHighlights}
      initialHighlightsVersion={initialHighlightsVersion}
      onHighlightsPersist={onHighlightsPersist}
      onUndo={onUndo}
      onRedo={onRedo}
      canUndo={canUndo}
      canRedo={canRedo}
      isProcessing={promptOptimizer.isProcessing}
      optimizationResultVersion={promptOptimizer.optimizationResultVersion}
      i2vContext={i2vContext}
    />
  );
};
