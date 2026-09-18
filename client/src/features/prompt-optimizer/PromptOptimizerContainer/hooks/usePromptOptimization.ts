import { useCallback } from "react";
import { createHighlightSignature } from "@features/span-highlighting";
import type { NavigateFunction } from "react-router-dom";
import type { HighlightSnapshot } from "@features/prompt-optimizer/context/types";
import type {
  PromptHistoryEntry,
  PromptVersionEntry,
} from "@features/prompt-optimizer/types/domain/prompt-session";
import type { PromptContext } from "@utils/PromptContext/PromptContext";
import type { OptimizationOptions } from "../../types";
import type { CapabilityValues } from "@shared/capabilities";
import type { KeyframeTile } from "@features/generation-controls";
import { resolveMediaUrl } from "@/services/media/MediaUrlResolver";
import { applyOptimizationResult } from "../utils/persistOptimizationResult";
import { mintVersionId } from "@features/prompt-optimizer/PromptCanvas/utils/versioning";
import {
  extractStorageObjectPath,
  hasGcsSignedUrlParams,
  parseGcsSignedUrlExpiryMs,
} from "@/utils/storageUrl";

const OPTIMIZATION_REFRESH_BUFFER_MS = 2 * 60 * 1000;

const parseExpiresAtMs = (value?: string | null): number | null => {
  if (!value || typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const shouldRefreshStartImage = (
  url: string | null,
  expiresAtMs: number | null,
): boolean => {
  if (!url || typeof url !== "string") return true;
  if (expiresAtMs !== null) {
    return Date.now() >= expiresAtMs - OPTIMIZATION_REFRESH_BUFFER_MS;
  }
  return hasGcsSignedUrlParams(url);
};

const resolveOptimizationStartImageUrl = async (
  url: string | null | undefined,
  storagePath?: string | null,
  viewUrlExpiresAt?: string | null,
): Promise<string | null> => {
  if (!url || typeof url !== "string") return url ?? null;
  const resolvedStoragePath = storagePath || extractStorageObjectPath(url);
  if (!resolvedStoragePath) return url;
  const expiresAtMs =
    parseExpiresAtMs(viewUrlExpiresAt) ?? parseGcsSignedUrlExpiryMs(url);
  const needsRefresh = shouldRefreshStartImage(url, expiresAtMs);
  if (!needsRefresh) return url;
  const resolved = await resolveMediaUrl({
    kind: "image",
    url,
    storagePath: resolvedStoragePath,
    preferFresh: true,
  });
  return resolved.url ?? url;
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

interface PromptOptimizer {
  inputPrompt: string;
  genericOptimizedPrompt?: string | null;
  improvementContext: unknown | null;
  qualityScore: number | null;
  setInputPrompt?: (prompt: string) => void;
  optimize: (
    prompt: string,
    context: Record<string, unknown> | null,
    brainstormContext: Record<string, unknown> | null,
    targetModel?: string,
    options?: OptimizationOptions,
  ) => Promise<{ optimized: string; score: number | null } | null>;
  compile: (
    prompt: string,
    targetModel?: string,
    context?: Record<string, unknown> | null,
  ) => Promise<{ optimized: string; score: number | null } | null>;
}

interface PromptHistory {
  history: PromptHistoryEntry[];
  updateEntryVersions: (
    uuid: string,
    docId: string | null,
    versions: PromptVersionEntry[],
  ) => void;
  saveToHistory: (
    input: string,
    output: string,
    score: number | null,
    mode: string,
    targetModel?: string | null,
    generationParams?: Record<string, unknown> | null,
    keyframes?: PromptHistoryEntry["keyframes"],
    brainstormContext?: Record<string, unknown> | null,
    highlightCache?: Record<string, unknown> | null,
    existingUuid?: string | null,
    title?: string | null,
  ) => Promise<{ uuid: string; id?: string } | null>;
}

export interface UsePromptOptimizationParams {
  promptOptimizer: PromptOptimizer;
  promptHistory: PromptHistory;
  promptContext: PromptContext | null;
  selectedMode: string;
  selectedModel?: string; // New: optional selected model
  generationParams: CapabilityValues;
  keyframes?: PromptHistoryEntry["keyframes"];
  startFrame?: KeyframeTile | null;
  startImageUrl?: string | null;
  sourcePrompt?: string | null;
  currentPromptUuid: string | null;
  setCurrentPromptUuid: (uuid: string) => void;
  setCurrentPromptDocId: (id: string | null) => void;
  setDisplayedPromptSilently: (prompt: string) => void;
  setShowResults: (show: boolean) => void;
  applyInitialHighlightSnapshot: (
    highlight: HighlightSnapshot | null,
    options: { bumpVersion: boolean; markPersisted: boolean },
  ) => void;
  resetEditStacks: () => void;
  persistedSignatureRef: React.MutableRefObject<string | null>;
  skipLoadFromUrlRef: React.MutableRefObject<boolean>;
  navigate: NavigateFunction;
  onOptimizationApplied?: (optimizedPrompt: string) => Promise<void> | void;
  /** The expansion produced no result — surfaced as a "writing" failure (M4). */
  onOptimizationFailed?: () => void;
}

export interface UsePromptOptimizationReturn {
  /**
   * Optimize the current (or given) prompt. The improvement flow passes its
   * enhancement context here; direct callers (Idea Box, keyboard) pass nothing
   * and fall back to the stored improvement context.
   */
  handleOptimize: (
    promptToOptimize?: string,
    context?: Record<string, unknown> | null,
    options?: OptimizationOptions,
  ) => Promise<void>;
  /**
   * Reoptimize entry point (model-format switch, force-generic compile). It
   * carries only OptimizationOptions and never an improvement context, so it is
   * typed separately instead of overloading handleOptimize's second parameter.
   */
  handleReoptimize: (
    promptToOptimize?: string,
    options?: OptimizationOptions,
  ) => Promise<void>;
}

/**
 * Custom hook for prompt optimization orchestration
 * Handles the optimization flow including saving to history and navigation
 */
export function usePromptOptimization({
  promptOptimizer,
  promptHistory,
  promptContext,
  selectedMode,
  selectedModel, // Extract new param
  generationParams,
  keyframes = null,
  startFrame,
  startImageUrl,
  sourcePrompt,
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
  onOptimizationApplied,
  onOptimizationFailed,
}: UsePromptOptimizationParams): UsePromptOptimizationReturn {
  const {
    inputPrompt,
    genericOptimizedPrompt,
    improvementContext,
    qualityScore,
    setInputPrompt,
    optimize,
    compile,
  } = promptOptimizer;
  const { history, saveToHistory, updateEntryVersions } = promptHistory;
  /**
   * Handle prompt optimization
   */
  const handleOptimize = useCallback(
    async (
      promptToOptimize?: string,
      context?: Record<string, unknown> | null,
      options?: OptimizationOptions,
    ): Promise<void> => {
      // I2V mode: there is no text-rewrite step. Image anchors visuals; user's prompt
      // goes to the model verbatim. Bypass the optimize call entirely.
      if (typeof startImageUrl === "string" && startImageUrl.length > 0) {
        const directPrompt = (promptToOptimize ?? inputPrompt ?? "").trim();
        setDisplayedPromptSilently(directPrompt);
        setShowResults(true);
        return;
      }

      const prompt = promptToOptimize || inputPrompt;
      const optimizationContext: Record<string, unknown> | null =
        context ??
        (isPlainRecord(improvementContext) ? improvementContext : null);

      // Serialize prompt context
      const serializedContext = promptContext
        ? typeof promptContext.toJSON === "function"
          ? promptContext.toJSON()
          : {
              elements: promptContext.elements,
              metadata: promptContext.metadata,
            }
        : null;

      const brainstormContextData = serializedContext
        ? {
            elements: serializedContext.elements,
            metadata: serializedContext.metadata,
          }
        : null;

      const isCompileOnly = options?.compileOnly === true;
      const compilePrompt =
        options?.compilePrompt ||
        (typeof genericOptimizedPrompt === "string"
          ? genericOptimizedPrompt
          : null);
      const overrideTargetModel =
        typeof options?.targetModel === "string" && options.targetModel.trim()
          ? options.targetModel.trim()
          : undefined;
      const forceGenericTarget = options?.forceGenericTarget === true;
      const effectiveTargetModel =
        selectedMode === "video"
          ? isCompileOnly
            ? overrideTargetModel
            : forceGenericTarget
              ? undefined
              : (overrideTargetModel ?? selectedModel)
          : undefined;
      const resolvedCompilePrompt = (compilePrompt || prompt).trim();

      const resolvedStartImageUrl = options?.startImage
        ? options.startImage
        : await resolveOptimizationStartImageUrl(
            startImageUrl ?? null,
            startFrame?.storagePath ?? null,
            startFrame?.viewUrlExpiresAt ?? null,
          );

      const effectiveOptions: OptimizationOptions = {
        ...(options ?? {}),
        ...(options?.startImage
          ? {}
          : resolvedStartImageUrl
            ? { startImage: resolvedStartImageUrl }
            : {}),
        ...(options?.sourcePrompt ? {} : sourcePrompt ? { sourcePrompt } : {}),
      };

      const result = isCompileOnly
        ? effectiveTargetModel
          ? await compile(
              resolvedCompilePrompt,
              effectiveTargetModel,
              optimizationContext,
            )
          : resolvedCompilePrompt
            ? { optimized: resolvedCompilePrompt, score: qualityScore }
            : null
        : await optimize(
            prompt,
            optimizationContext,
            brainstormContextData,
            effectiveTargetModel,
            {
              ...effectiveOptions,
              ...(generationParams ? { generationParams } : {}),
            },
          );

      if (result) {
        const preserveSessionView = options?.preserveSessionView === true;
        if (preserveSessionView) {
          if (typeof setInputPrompt === "function") {
            setInputPrompt(result.optimized);
            setDisplayedPromptSilently("");
            setShowResults(false);
          } else {
            setDisplayedPromptSilently(result.optimized);
            setShowResults(true);
          }
          await onOptimizationApplied?.(result.optimized);
          return;
        }

        if (isCompileOnly && !effectiveTargetModel) {
          setShowResults(true);
          setDisplayedPromptSilently(result.optimized);
        }

        // Save to history
        const saveResult = await saveToHistory(
          prompt,
          result.optimized,
          result.score,
          selectedMode,
          selectedMode === "video" ? (effectiveTargetModel ?? null) : null,
          generationParams ?? null,
          keyframes ?? null,
          serializedContext as unknown as Record<string, unknown> | null,
          null,
          currentPromptUuid,
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
        }

        if (saveResult?.uuid && options?.createVersion) {
          const promptText = result.optimized.trim();
          if (promptText) {
            const uuidForVersions = saveResult.uuid;
            const promptEntries = Array.isArray(history) ? history : [];
            const existingEntry =
              promptEntries.find((entry) => entry.uuid === uuidForVersions) ??
              null;
            const currentVersions = Array.isArray(existingEntry?.versions)
              ? existingEntry.versions
              : [];

            const signature = createHighlightSignature(promptText);
            const last = currentVersions[currentVersions.length - 1] ?? null;

            if (!last || last.signature !== signature) {
              const nextVersion: PromptVersionEntry = {
                versionId: mintVersionId(),
                label: `v${currentVersions.length + 1}`,
                signature,
                prompt: promptText,
                timestamp: new Date().toISOString(),
              };

              updateEntryVersions(uuidForVersions, saveResult.id ?? null, [
                ...currentVersions,
                nextVersion,
              ]);
            }
          }
        }

        await onOptimizationApplied?.(result.optimized);
      } else {
        // The expansion produced no result — surface a "writing" failure (M4)
        // instead of silently returning to a dead composer.
        onOptimizationFailed?.();
      }
    },
    [
      inputPrompt,
      genericOptimizedPrompt,
      improvementContext,
      qualityScore,
      setInputPrompt,
      optimize,
      compile,
      history,
      saveToHistory,
      updateEntryVersions,
      promptContext,
      selectedMode,
      selectedModel,
      generationParams,
      keyframes,
      startFrame?.storagePath,
      startFrame?.viewUrlExpiresAt,
      startImageUrl,
      sourcePrompt,
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
      onOptimizationApplied,
      onOptimizationFailed,
    ],
  );

  const handleReoptimize = useCallback(
    (promptToOptimize?: string, options?: OptimizationOptions): Promise<void> =>
      handleOptimize(promptToOptimize, null, options),
    [handleOptimize],
  );

  return { handleOptimize, handleReoptimize };
}
