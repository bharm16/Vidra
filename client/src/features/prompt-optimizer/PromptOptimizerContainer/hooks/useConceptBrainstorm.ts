import { useCallback, useEffect, useRef } from "react";
import { PromptContext } from "@utils/PromptContext";
import { PERFORMANCE_CONFIG } from "@config/performance.config";
import type { PromptHistoryEntry } from "@features/prompt-optimizer/types/domain/prompt-session";
import type { Toast } from "@hooks/types";
import type { HighlightSnapshot } from "@features/prompt-optimizer/context/types";
import type { CapabilityValues } from "@shared/capabilities";
import { logger } from "@/services/LoggingService";
import { sanitizeError } from "@/utils/logging";
import { applyOptimizationResult } from "../utils/persistOptimizationResult";

const log = logger.child("useConceptBrainstorm");

interface PromptOptimizer {
  setInputPrompt: (prompt: string) => void;
  optimize: (
    prompt: string,
    context: Record<string, unknown> | null,
    brainstormContext: Record<string, unknown>,
    targetModel?: string,
    options?: { generationParams?: CapabilityValues },
  ) => Promise<{ optimized: string; score: number | null } | null>;
}

interface PromptHistory {
  saveToHistory: (
    input: string,
    output: string,
    score: number | null,
    mode: string,
    targetModel?: string | null,
    generationParams?: Record<string, unknown> | null,
    keyframes?: PromptHistoryEntry["keyframes"],
    context?: Record<string, unknown>,
    highlightCache?: Record<string, unknown>,
    existingUuid?: string | null,
    title?: string | null,
  ) => Promise<{ uuid: string; id?: string | null } | null>;
}

interface UseConceptBrainstormParams {
  promptOptimizer: PromptOptimizer;
  promptHistory: PromptHistory;
  selectedMode: string;
  selectedModel?: string;
  generationParams: CapabilityValues;
  keyframes?: PromptHistoryEntry["keyframes"];
  setConceptElements: (elements: Record<string, unknown>) => void;
  setPromptContext: (context: PromptContext | null) => void;
  setShowBrainstorm: (show: boolean) => void;
  setCurrentPromptUuid: (uuid: string) => void;
  setCurrentPromptDocId: (id: string | null) => void;
  setDisplayedPromptSilently: (prompt: string) => void;
  setShowResults: (show: boolean) => void;
  applyInitialHighlightSnapshot: (
    snapshot: HighlightSnapshot | null,
    options: { bumpVersion: boolean; markPersisted: boolean },
  ) => void;
  resetEditStacks: () => void;
  persistedSignatureRef: React.MutableRefObject<string | null>;
  skipLoadFromUrlRef: React.MutableRefObject<boolean>;
  navigate: (path: string, options?: { replace?: boolean }) => void;
  toast: Toast;
}

/**
 * Custom hook for video concept brainstorm flow
 * Handles concept generation, context management, and automatic optimization
 */
export function useConceptBrainstorm({
  promptOptimizer,
  promptHistory,
  selectedMode,
  selectedModel,
  generationParams,
  keyframes = null,
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
}: UseConceptBrainstormParams): {
  handleConceptComplete: (
    finalConcept: string,
    elements: Record<string, unknown>,
    metadata: Record<string, unknown>,
  ) => Promise<void>;
  handleSkipBrainstorm: () => void;
} {
  const { setInputPrompt, optimize } = promptOptimizer;
  const { saveToHistory } = promptHistory;
  const conceptOptimizeTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (conceptOptimizeTimeoutRef.current) {
        clearTimeout(conceptOptimizeTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Handle concept completion from brainstorm modal
   */
  const handleConceptComplete = useCallback(
    async (
      finalConcept: string,
      elements: Record<string, unknown>,
      metadata: Record<string, unknown>,
    ): Promise<void> => {
      setConceptElements(elements);

      // Create and store prompt context
      const context = new PromptContext(elements, metadata);
      setPromptContext(context);

      const serializedContext = context.toJSON();
      const brainstormContextData = {
        elements,
        metadata,
      };

      setInputPrompt(finalConcept);
      setShowBrainstorm(false);

      // Clear any existing timeout and set new one for optimization
      if (conceptOptimizeTimeoutRef.current) {
        clearTimeout(conceptOptimizeTimeoutRef.current);
      }

      conceptOptimizeTimeoutRef.current = setTimeout(async () => {
        try {
          const result = await optimize(
            finalConcept,
            null,
            brainstormContextData,
            selectedMode === "video" ? selectedModel : undefined,
            generationParams ? { generationParams } : undefined,
          );

          if (result) {
            const saveResult = await saveToHistory(
              finalConcept,
              result.optimized,
              result.score,
              selectedMode,
              selectedMode === "video" ? (selectedModel ?? null) : null,
              generationParams ?? null,
              keyframes ?? null,
              serializedContext as unknown as Record<string, unknown>,
            );

            if (saveResult?.uuid) {
              applyOptimizationResult({
                optimizedPrompt: result.optimized,
                saveResult,
                setCurrentPromptUuid,
                setCurrentPromptDocId,
                setDisplayedPromptSilently,
                setShowResults,
                applyInitialHighlightSnapshot,
                resetEditStacks,
                persistedSignatureRef,
                skipLoadFromUrlRef,
                navigate,
              });
              toast.success("Video prompt generated successfully!");
            }
          }
        } catch (error) {
          const errObj =
            error instanceof Error
              ? error
              : new Error(sanitizeError(error).message);
          log.error("Error generating video prompt from brainstorm", errObj, {
            operation: "handleConceptComplete",
            selectedMode,
            selectedModel,
          });
          toast.error("Failed to generate video prompt. Please try again.");
        } finally {
          conceptOptimizeTimeoutRef.current = null;
        }
      }, PERFORMANCE_CONFIG.ASYNC_OPERATION_DELAY_MS);
    },
    [
      optimize,
      saveToHistory,
      setInputPrompt,
      selectedMode,
      selectedModel,
      generationParams,
      keyframes,
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
    ],
  );

  /**
   * Handle skipping brainstorm modal
   */
  const handleSkipBrainstorm = useCallback(() => {
    setShowBrainstorm(false);
    setConceptElements({ skipped: true });
  }, [setShowBrainstorm, setConceptElements]);

  return {
    handleConceptComplete,
    handleSkipBrainstorm,
  };
}
