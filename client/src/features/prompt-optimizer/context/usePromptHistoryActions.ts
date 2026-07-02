import { useCallback } from "react";
import type { NavigateFunction } from "react-router-dom";
import { PromptContext } from "@utils/PromptContext/PromptContext";
import type { CapabilityValues } from "@shared/capabilities";
import type { useDebugLogger } from "@hooks/useDebugLogger";
import { isRemoteSessionId } from "@/repositories/sessionIdNamespace";
import type { usePromptOptimizer } from "@hooks/usePromptOptimizer";
import type {
  HighlightSnapshot,
  PromptHistoryEntry,
  PromptKeyframe,
  PromptVersionEntry,
} from "./types";

type DebugLogger = ReturnType<typeof useDebugLogger>;
type PromptOptimizer = ReturnType<typeof usePromptOptimizer>;

interface PromptHistoryActionsOptions {
  debug: DebugLogger;
  navigate: NavigateFunction;
  promptOptimizer: PromptOptimizer;
  promptHistory: {
    createDraft: (params: {
      id?: string | null;
      mode: string;
      targetModel: string | null;
      generationParams: Record<string, unknown> | null;
      keyframes?: PromptHistoryEntry["keyframes"];
      uuid?: string;
      input?: string;
      output?: string;
      title?: string | null;
      brainstormContext?: Record<string, unknown> | null;
      highlightCache?: Record<string, unknown> | null;
      versions?: PromptVersionEntry[];
      persist?: boolean;
    }) => { uuid: string; id: string };
  };
  selectedMode: string;
  selectedModel: string;
  generationParams: CapabilityValues;
  currentPromptUuid: string | null;
  currentPromptDocId: string | null;
  promptContext: PromptContext | null;
  currentKeyframes: PromptKeyframe[] | null;
  currentHighlightSnapshot: HighlightSnapshot | null;
  currentVersions: PromptVersionEntry[];
  isApplyingHistoryRef: React.MutableRefObject<boolean>;
}

interface PromptHistoryActionsResult {
  setDisplayedPromptSilently: (text: string) => void;
  handleCreateNew: () => void;
  loadFromHistory: (entry: PromptHistoryEntry) => void;
}

const hasMeaningfulDraftState = (
  inputPrompt: string,
  displayedPrompt: string,
  optimizedPrompt: string,
  generationParams: CapabilityValues,
  keyframes: PromptKeyframe[] | null,
  versions: PromptVersionEntry[],
): boolean => {
  if (inputPrompt.trim().length > 0) return true;
  if (displayedPrompt.trim().length > 0) return true;
  if (optimizedPrompt.trim().length > 0) return true;
  if (Array.isArray(keyframes) && keyframes.length > 0) return true;
  if (Array.isArray(versions) && versions.length > 0) return true;
  return Object.keys(generationParams ?? {}).length > 0;
};

const serializePromptContext = (
  promptContext: PromptContext | null,
): Record<string, unknown> | null => {
  if (!promptContext) return null;
  if (typeof promptContext.toJSON === "function") {
    return promptContext.toJSON() as unknown as Record<string, unknown>;
  }
  return {
    elements: promptContext.elements,
    metadata: promptContext.metadata,
  };
};

export const usePromptHistoryActions = ({
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
  currentKeyframes,
  currentHighlightSnapshot,
  currentVersions,
  isApplyingHistoryRef,
}: PromptHistoryActionsOptions): PromptHistoryActionsResult => {
  const {
    setDisplayedPrompt,
    setInputPrompt,
    setOptimizedPrompt,
    inputPrompt,
    optimizedPrompt,
    displayedPrompt,
  } = promptOptimizer;
  const { createDraft } = promptHistory;

  const setDisplayedPromptSilently = useCallback(
    (text: string): void => {
      isApplyingHistoryRef.current = true;
      setDisplayedPrompt(text);
      setTimeout(() => {
        isApplyingHistoryRef.current = false;
      }, 0);
    },
    [setDisplayedPrompt, isApplyingHistoryRef],
  );

  const persistCurrentWorkspaceLocallyIfNeeded = useCallback((): void => {
    const hasRemoteSession = isRemoteSessionId(currentPromptDocId);
    if (hasRemoteSession) {
      return;
    }

    if (
      !hasMeaningfulDraftState(
        inputPrompt,
        displayedPrompt,
        optimizedPrompt,
        generationParams,
        currentKeyframes,
        currentVersions,
      )
    ) {
      return;
    }

    createDraft({
      ...(currentPromptUuid ? { uuid: currentPromptUuid } : {}),
      ...(currentPromptDocId ? { id: currentPromptDocId } : {}),
      mode: selectedMode,
      targetModel: selectedModel?.trim() ? selectedModel.trim() : null,
      generationParams:
        (generationParams as unknown as Record<string, unknown>) ?? null,
      keyframes:
        Array.isArray(currentKeyframes) && currentKeyframes.length > 0
          ? currentKeyframes
          : null,
      input: inputPrompt,
      output: displayedPrompt || optimizedPrompt,
      brainstormContext: serializePromptContext(promptContext),
      highlightCache:
        currentHighlightSnapshot && typeof currentHighlightSnapshot === "object"
          ? (currentHighlightSnapshot as Record<string, unknown>)
          : null,
      versions: Array.isArray(currentVersions) ? currentVersions : [],
      persist: true,
    });
  }, [
    currentHighlightSnapshot,
    currentKeyframes,
    createDraft,
    currentPromptDocId,
    currentPromptUuid,
    currentVersions,
    displayedPrompt,
    generationParams,
    inputPrompt,
    optimizedPrompt,
    promptContext,
    selectedMode,
    selectedModel,
  ]);

  const handleCreateNew = useCallback((): void => {
    debug.logAction("createNew");
    persistCurrentWorkspaceLocallyIfNeeded();
    const draft = createDraft({
      mode: selectedMode,
      targetModel: selectedModel?.trim() ? selectedModel.trim() : null,
      generationParams:
        (generationParams as unknown as Record<string, unknown>) ?? null,
    });

    // Eagerly reset prompt state before navigation to prevent stale UI flash.
    // usePromptLoader will re-apply blank state from the draft entry, but by
    // then the old content would have been visible for one frame.
    isApplyingHistoryRef.current = true;
    setInputPrompt("");
    setOptimizedPrompt("");
    setDisplayedPrompt("");
    setTimeout(() => {
      isApplyingHistoryRef.current = false;
    }, 0);

    // Notify workspace to reset generation controls (start frame, keyframes,
    // camera motion, etc.) which live outside the prompt state context.
    // dispatchEvent is synchronous — listeners fire before navigate() below.
    window.dispatchEvent(new Event("po:workspace-reset"));

    navigate(`/session/${draft.id}`, { replace: true });
    window.setTimeout(() => {
      window.dispatchEvent(new Event("po:focus-editor"));
    }, 0);
    debug.logAction("createNewComplete");
  }, [
    createDraft,
    debug,
    generationParams,
    isApplyingHistoryRef,
    navigate,
    persistCurrentWorkspaceLocallyIfNeeded,
    selectedMode,
    selectedModel,
    setDisplayedPrompt,
    setInputPrompt,
    setOptimizedPrompt,
  ]);

  const loadFromHistory = useCallback(
    (entry: PromptHistoryEntry): void => {
      debug.logAction("loadFromHistory", {
        uuid: entry.uuid,
        mode: entry.mode,
        hasContext: !!entry.brainstormContext,
        hasHighlightCache: !!entry.highlightCache,
      });
      debug.startTimer("loadFromHistory");

      persistCurrentWorkspaceLocallyIfNeeded();

      if (typeof entry.id === "string" && entry.id.trim()) {
        navigate(`/session/${entry.id}`, { replace: true });
      } else {
        navigate("/", { replace: true });
      }

      debug.endTimer("loadFromHistory", "Session navigation triggered");
    },
    [debug, navigate, persistCurrentWorkspaceLocallyIfNeeded],
  );

  return {
    setDisplayedPromptSilently,
    handleCreateNew,
    loadFromHistory,
  };
};
