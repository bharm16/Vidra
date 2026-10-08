import React, { useMemo, type ReactNode } from "react";
import type {
  DraftModel,
  GenerationOverrides,
} from "@features/generation-controls";
import { SidebarDataContextProvider } from "@/components/ToolSidebar/context";
import { useGenerationControlsContext } from "@/features/prompt-optimizer/context/GenerationControlsContext";
import { usePromptInsertionBus } from "@/features/prompt-optimizer/context/PromptInsertionBusContext";
import {
  usePromptActions,
  usePromptConfig,
  usePromptHighlights,
  usePromptServices,
  usePromptSession,
} from "@/features/prompt-optimizer/context/PromptStateContext";
import { usePromptHistoryActions } from "@/features/prompt-optimizer/PromptOptimizerContainer/hooks";
import {
  resolveActiveModelLabel,
  resolveActiveStatusLabel,
} from "@/features/prompt-optimizer/utils/activeStatusLabel";

interface SidebarDataProviderProps {
  children: ReactNode;
  onImageUpload?: (file: File) => void | Promise<void>;
  onStartFrameUpload?: (file: File) => void | Promise<void>;
  onUploadSidebarImage?: (file: File) => Promise<{
    url: string;
    storagePath?: string;
    viewUrlExpiresAt?: string;
  } | null>;
}

export function SidebarDataProvider({
  children,
  onImageUpload,
  onStartFrameUpload,
  onUploadSidebarImage,
}: SidebarDataProviderProps): React.ReactElement {
  const { promptHistory, promptOptimizer } = usePromptServices();
  const { selectedModel } = usePromptConfig();
  const { initialHighlights } = usePromptHighlights();
  const { currentPromptUuid, currentPromptDocId } = usePromptSession();
  const { handleCreateNew, loadFromHistory } = usePromptActions();
  const { controls } = useGenerationControlsContext();
  const { insertAtCaret } = usePromptInsertionBus();

  const {
    handleLoadFromHistory,
    handleCreateNewWithKeyframes,
    handleDuplicate,
    handleRename,
  } = usePromptHistoryActions({
    promptHistory,
    loadFromHistory,
    handleCreateNew,
  });

  const activeStatusLabel = resolveActiveStatusLabel({
    inputPrompt: promptOptimizer.inputPrompt,
    displayedPrompt: promptOptimizer.displayedPrompt,
    isProcessing: promptOptimizer.isProcessing,
    hasHighlights: Boolean(initialHighlights),
  });
  const activeModelLabel = resolveActiveModelLabel(selectedModel);
  const sessions = useMemo(
    () => ({
      history: promptHistory.history,
      filteredHistory: promptHistory.filteredHistory,
      isLoadingHistory: promptHistory.isLoadingHistory,
      searchQuery: promptHistory.searchQuery,
      onSearchChange: promptHistory.setSearchQuery,
      onLoadFromHistory: handleLoadFromHistory,
      onCreateNew: handleCreateNewWithKeyframes,
      onDelete: promptHistory.deleteFromHistory,
      onDuplicate: handleDuplicate,
      onRename: handleRename,
      currentPromptUuid,
      currentPromptDocId,
      activeStatusLabel,
      activeModelLabel,
    }),
    [
      activeModelLabel,
      activeStatusLabel,
      currentPromptDocId,
      currentPromptUuid,
      handleCreateNewWithKeyframes,
      handleDuplicate,
      handleLoadFromHistory,
      handleRename,
      promptHistory.deleteFromHistory,
      promptHistory.filteredHistory,
      promptHistory.history,
      promptHistory.isLoadingHistory,
      promptHistory.searchQuery,
      promptHistory.setSearchQuery,
    ],
  );

  const promptInteraction = useMemo(
    () => ({
      isProcessing: promptOptimizer.isProcessing,
      onInsertTrigger: insertAtCaret,
    }),
    [insertAtCaret, promptOptimizer.isProcessing],
  );

  const generation = useMemo(
    () => ({
      onDraft: (model: DraftModel, overrides?: GenerationOverrides): void => {
        controls?.onDraft?.(model, overrides);
      },
      onRender: (model: string, overrides?: GenerationOverrides): void => {
        controls?.onRender?.(model, overrides);
      },
      ...(onImageUpload ? { onImageUpload } : {}),
      ...(onStartFrameUpload ? { onStartFrameUpload } : {}),
      ...(onUploadSidebarImage ? { onUploadSidebarImage } : {}),
    }),
    [controls, onImageUpload, onStartFrameUpload, onUploadSidebarImage],
  );

  const value = useMemo(
    () => ({
      sessions,
      promptInteraction,
      generation,
      assets: null,
    }),
    [generation, promptInteraction, sessions],
  );

  return (
    <SidebarDataContextProvider value={value}>
      {children}
    </SidebarDataContextProvider>
  );
}
