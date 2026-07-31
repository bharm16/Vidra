import { useCallback } from "react";
import type { Generation } from "@features/generations/types";
import { applyGenerationReuse } from "@features/prompt-optimizer/PromptCanvas/utils/reuseGeneration";
import { usePromptCanvasPanelProps } from "@features/prompt-optimizer/PromptCanvas/hooks/usePromptCanvasPanelProps";
import { useShotGenerations } from "@features/prompt-optimizer/PromptCanvas/hooks/useShotGenerations";
import { useVersionManagement } from "@features/prompt-optimizer/PromptCanvas/hooks/useVersionManagement";

type ShotGenerationsOptions = Parameters<typeof useShotGenerations>[0];
type VersionManagementOptions = Parameters<typeof useVersionManagement>[0];
type PromptCanvasPanelPropsOptions = Parameters<
  typeof usePromptCanvasPanelProps
>[0];
type GenerationReuseOptions = Parameters<typeof applyGenerationReuse>[1];

interface CanvasGenerationsParams
  extends Pick<ShotGenerationsOptions, "currentShot" | "updateShot">,
    Pick<
      VersionManagementOptions,
      | "hasShotContext"
      | "promptHistory"
      | "currentPromptUuid"
      | "currentPromptDocId"
      | "promptIdentityRef"
      | "setCurrentPromptUuid"
      | "setCurrentPromptDocId"
      | "activeVersionId"
      | "setActiveVersionId"
      | "inputPrompt"
      | "normalizedDisplayedPrompt"
      | "selectedMode"
      | "selectedModel"
      | "generationParams"
      | "serializedKeyframes"
      | "promptOptimizer"
      | "applyInitialHighlightSnapshot"
      | "resetEditStacks"
      | "setDisplayedPromptSilently"
      | "latestHighlightRef"
      | "versionEditCountRef"
      | "versionEditsRef"
      | "resetVersionEdits"
      | "effectiveAspectRatio"
    >,
    Pick<
      PromptCanvasPanelPropsOptions,
      "showResults" | "normalizedInputPrompt" | "durationSeconds" | "fpsNumber"
    >,
    Pick<
      GenerationReuseOptions,
      | "onInputPromptChange"
      | "onResetResultsForEditing"
      | "setSelectedModel"
      | "setVideoTier"
      | "setGenerationParams"
    > {}

export function useCanvasGenerations(params: CanvasGenerationsParams) {
  const {
    onInputPromptChange,
    onResetResultsForEditing,
    setSelectedModel,
    setVideoTier,
    setGenerationParams,
    showResults,
    normalizedDisplayedPrompt,
    normalizedInputPrompt,
    effectiveAspectRatio,
    durationSeconds,
    fpsNumber,
    generationParams,
  } = params;

  const { shotId, shotPromptEntry, updateShotVersions } = useShotGenerations({
    currentShot: params.currentShot,
    updateShot: params.updateShot,
  });

  const versioning = useVersionManagement({
    hasShotContext: params.hasShotContext,
    shotId,
    shotPromptEntry,
    updateShotVersions,
    promptHistory: params.promptHistory,
    currentPromptUuid: params.currentPromptUuid,
    currentPromptDocId: params.currentPromptDocId,
    promptIdentityRef: params.promptIdentityRef,
    setCurrentPromptUuid: params.setCurrentPromptUuid,
    setCurrentPromptDocId: params.setCurrentPromptDocId,
    activeVersionId: params.activeVersionId,
    setActiveVersionId: params.setActiveVersionId,
    inputPrompt: params.inputPrompt,
    normalizedDisplayedPrompt: params.normalizedDisplayedPrompt,
    selectedMode: params.selectedMode,
    selectedModel: params.selectedModel,
    generationParams: params.generationParams,
    serializedKeyframes: params.serializedKeyframes,
    promptOptimizer: params.promptOptimizer,
    applyInitialHighlightSnapshot: params.applyInitialHighlightSnapshot,
    resetEditStacks: params.resetEditStacks,
    setDisplayedPromptSilently: params.setDisplayedPromptSilently,
    latestHighlightRef: params.latestHighlightRef,
    versionEditCountRef: params.versionEditCountRef,
    versionEditsRef: params.versionEditsRef,
    resetVersionEdits: params.resetVersionEdits,
    effectiveAspectRatio: params.effectiveAspectRatio,
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

  const setGenerationFavorite = versioning.setGenerationFavorite;
  const handleToggleGenerationFavorite = useCallback(
    (generationId: string, isFavorite: boolean): void => {
      setGenerationFavorite(generationId, isFavorite);
    },
    [setGenerationFavorite],
  );

  const { versionsPanelProps, generationsPanelProps } =
    usePromptCanvasPanelProps({
      versionsForPanel: versioning.versionsForPanel,
      selectedVersionId: versioning.selectedVersionId,
      onSelectVersion: versioning.handleSelectVersion,
      onCreateVersion: versioning.handleCreateVersion,
      showResults,
      normalizedDisplayedPrompt,
      normalizedInputPrompt,
      promptVersionId: versioning.promptVersionId,
      effectiveAspectRatio,
      durationSeconds,
      fpsNumber,
      generationParams,
      initialGenerations: versioning.activeVersion?.generations ?? undefined,
      onGenerationsChange: versioning.handleGenerationsChange,
      currentVersions: versioning.currentVersions,
      onRestoreVersion: versioning.handleSelectVersion,
      onCreateVersionIfNeeded: versioning.createVersionIfNeeded,
    });

  return {
    ...versioning,
    versionsPanelProps,
    generationsPanelProps,
    handleReuseGeneration,
    handleToggleGenerationFavorite,
  };
}
