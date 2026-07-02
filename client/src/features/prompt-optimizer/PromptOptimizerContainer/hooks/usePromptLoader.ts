import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getPromptRepositoryForUser } from "@repositories/index";
import { createHighlightSignature } from "@features/span-highlighting";
import { PromptContext } from "@utils/PromptContext";
import type { CapabilityValues } from "@shared/capabilities";
import type {
  PromptHistoryEntry,
  PromptKeyframe,
  PromptVersionEntry,
} from "@features/prompt-optimizer/types/domain/prompt-session";
import type { Toast } from "@hooks/types";
import type { HighlightSnapshot } from "@features/prompt-optimizer/context/types";
import { logger } from "@/services/LoggingService";
import { sanitizeError } from "@/utils/logging";
import { isRemoteSessionId } from "@/repositories/sessionIdNamespace";

const log = logger.child("usePromptLoader");

interface PromptData {
  id?: string;
  uuid?: string;
  title?: string | null;
  input?: string;
  output?: string;
  score?: number | null;
  mode?: string;
  targetModel?: string | null;
  generationParams?: Record<string, unknown> | string | null;
  keyframes?: PromptKeyframe[] | null;
  highlightCache?: {
    signature?: string;
    updatedAt?: string;
  } | null;
  brainstormContext?: string | Record<string, unknown> | null;
  timestamp?: string;
  versions?: PromptVersionEntry[];
}

interface PromptOptimizer {
  setInputPrompt: (prompt: string) => void;
  setOptimizedPrompt: (prompt: string) => void;
  setDisplayedPrompt: (prompt: string) => void;
  setGenericOptimizedPrompt?: (prompt: string | null) => void;
  displayedPrompt: string;
  setPreviewPrompt?: (prompt: string | null) => void;
  setPreviewAspectRatio?: (ratio: string | null) => void;
}

interface UsePromptLoaderParams {
  sessionId: string | null | undefined;
  isAuthResolved?: boolean;
  historyEntries?: PromptHistoryEntry[];
  createDraftEntry?: (params: {
    id?: string | null;
    mode: string;
    targetModel: string | null;
    generationParams: Record<string, unknown> | null;
    keyframes?: PromptKeyframe[] | null;
    uuid?: string;
    persist?: boolean;
  }) => { uuid: string; id: string };
  selectedMode?: string;
  selectedModelValue?: string;
  generationParamsValue?: CapabilityValues;
  navigate: ReturnType<typeof useNavigate>;
  toast: Toast;
  user: { uid: string } | null;
  promptOptimizer: PromptOptimizer;
  setDisplayedPromptSilently: (prompt: string) => void;
  applyInitialHighlightSnapshot: (
    highlight: HighlightSnapshot | null,
    options: { bumpVersion: boolean; markPersisted: boolean },
  ) => void;
  resetEditStacks: () => void;
  resetVersionEdits: () => void;
  setCurrentPromptDocId: (id: string | null) => void;
  setCurrentPromptUuid: (uuid: string | null) => void;
  setShowResults: (show: boolean) => void;
  setSelectedMode?: (mode: string) => void;
  setSelectedModel: (model: string) => void;
  setGenerationParams?: (params: CapabilityValues) => void;
  upsertHistoryEntry?: (entry: PromptData, sessionId: string) => void;
  setSuggestionsData?: (value: null) => void;
  setConceptElements?: (value: null) => void;
  setPromptContext: (context: PromptContext | null) => void;
  onLoadKeyframes?: (keyframes: PromptKeyframe[] | null | undefined) => void;
  skipLoadFromUrlRef: React.MutableRefObject<boolean>;
}

const parseCapabilityValues = (
  value: PromptData["generationParams"],
): CapabilityValues => {
  if (value && typeof value === "object") {
    return value as CapabilityValues;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as CapabilityValues;
      }
    } catch {
      // Keep fallback for malformed payloads; session hydration should remain usable.
    }
  }

  return {} as CapabilityValues;
};

/**
 * Custom hook for loading prompts from session route parameters
 */
export function usePromptLoader({
  sessionId,
  isAuthResolved = true,
  navigate,
  toast,
  user,
  historyEntries = [],
  createDraftEntry,
  selectedMode,
  selectedModelValue,
  generationParamsValue,
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
  upsertHistoryEntry,
  setSuggestionsData,
  setConceptElements,
  setPromptContext,
  onLoadKeyframes,
  skipLoadFromUrlRef,
}: UsePromptLoaderParams): { isLoading: boolean } {
  const isAuthenticated = Boolean(user?.uid);
  const {
    setInputPrompt,
    setOptimizedPrompt,
    setGenericOptimizedPrompt,
    setPreviewPrompt,
    setPreviewAspectRatio,
  } = promptOptimizer;

  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (!sessionId) return false;
    return true;
  });
  const lastLoadedSessionKeyRef = useRef<string | null>(null);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  // Stabilize values that should be read-on-demand inside the effect without
  // triggering re-runs.  Only sessionId / auth changes should re-trigger the
  // loader — setter callbacks, history entries, and generation config are read
  // via stable refs to prevent the effect from re-running when parent re-renders
  // recreate callback identities (which would wipe the prompt mid-editing).
  const historyEntriesRef = useRef(historyEntries);
  historyEntriesRef.current = historyEntries;
  const createDraftEntryRef = useRef(createDraftEntry);
  createDraftEntryRef.current = createDraftEntry;
  const selectedModeRef = useRef(selectedMode);
  selectedModeRef.current = selectedMode;
  const selectedModelValueRef = useRef(selectedModelValue);
  selectedModelValueRef.current = selectedModelValue;
  const generationParamsValueRef = useRef(generationParamsValue);
  generationParamsValueRef.current = generationParamsValue;

  // Stabilize ALL setter/callback dependencies via refs.  These functions are
  // often useCallback wrappers whose identity changes when their own deps
  // change.  Including them directly in the effect dep array caused the effect
  // to re-run, hit the "no sessionId → clear everything" branch, and wipe the
  // user's prompt — producing both the "Maximum update depth exceeded" error
  // and the prompt-disappears-on-Preview bug.
  const setDisplayedPromptSilentlyRef = useRef(setDisplayedPromptSilently);
  setDisplayedPromptSilentlyRef.current = setDisplayedPromptSilently;
  const applyInitialHighlightSnapshotRef = useRef(
    applyInitialHighlightSnapshot,
  );
  applyInitialHighlightSnapshotRef.current = applyInitialHighlightSnapshot;
  const resetEditStacksRef = useRef(resetEditStacks);
  resetEditStacksRef.current = resetEditStacks;
  const resetVersionEditsRef = useRef(resetVersionEdits);
  resetVersionEditsRef.current = resetVersionEdits;
  const setCurrentPromptDocIdRef = useRef(setCurrentPromptDocId);
  setCurrentPromptDocIdRef.current = setCurrentPromptDocId;
  const setCurrentPromptUuidRef = useRef(setCurrentPromptUuid);
  setCurrentPromptUuidRef.current = setCurrentPromptUuid;
  const setShowResultsRef = useRef(setShowResults);
  setShowResultsRef.current = setShowResults;
  const setSelectedModeRef = useRef(setSelectedMode);
  setSelectedModeRef.current = setSelectedMode;
  const setSelectedModelRef = useRef(setSelectedModel);
  setSelectedModelRef.current = setSelectedModel;
  const setGenerationParamsRef = useRef(setGenerationParams);
  setGenerationParamsRef.current = setGenerationParams;
  const upsertHistoryEntryRef = useRef(upsertHistoryEntry);
  upsertHistoryEntryRef.current = upsertHistoryEntry;
  const setSuggestionsDataRef = useRef(setSuggestionsData);
  setSuggestionsDataRef.current = setSuggestionsData;
  const setConceptElementsRef = useRef(setConceptElements);
  setConceptElementsRef.current = setConceptElements;
  const setPromptContextRef = useRef(setPromptContext);
  setPromptContextRef.current = setPromptContext;
  const onLoadKeyframesRef = useRef(onLoadKeyframes);
  onLoadKeyframesRef.current = onLoadKeyframes;
  const setInputPromptRef = useRef(setInputPrompt);
  setInputPromptRef.current = setInputPrompt;
  const setOptimizedPromptRef = useRef(setOptimizedPrompt);
  setOptimizedPromptRef.current = setOptimizedPrompt;
  const setGenericOptimizedPromptRef = useRef(setGenericOptimizedPrompt);
  setGenericOptimizedPromptRef.current = setGenericOptimizedPrompt;
  const setPreviewPromptRef = useRef(setPreviewPrompt);
  setPreviewPromptRef.current = setPreviewPrompt;
  const setPreviewAspectRatioRef = useRef(setPreviewAspectRatio);
  setPreviewAspectRatioRef.current = setPreviewAspectRatio;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    let cancelled = false;
    // Track whether a fetch completed (success or handled failure) so the
    // cleanup function can distinguish a dependency-change re-run (fetch
    // still in-flight) from a normal unmount/re-render after completion.
    let loadCompleted = false;

    const loadPromptFromSession = async (): Promise<void> => {
      // Skip ALL loading/clearing when an optimization result or brainstorm
      // just navigated to a new session — the state was already set.
      if (skipLoadFromUrlRef.current) {
        skipLoadFromUrlRef.current = false;
        setIsLoading(false);
        return;
      }

      const normalizedSessionId = sessionId?.trim() ?? "";
      if (!normalizedSessionId) {
        // Clear stale state when entering `/` without a session ID.
        // Without this, the workspace preserves the last-loaded session's
        // prompt, suggestions, and generation state from in-memory history.
        setSuggestionsDataRef.current?.(null);
        setConceptElementsRef.current?.(null);
        setInputPromptRef.current("");
        setOptimizedPromptRef.current("");
        setDisplayedPromptSilentlyRef.current("");
        setGenericOptimizedPromptRef.current?.(null);
        setPreviewPromptRef.current?.(null);
        setShowResultsRef.current(false);
        window.dispatchEvent(new Event("po:workspace-reset"));
        setIsLoading(false);
        return;
      }

      if (isRemoteSessionId(normalizedSessionId) && !isAuthResolved) {
        setIsLoading(true);
        return;
      }

      // Auth has resolved and there is no user: a server session can never
      // load for them. Send them to sign in instead of spinning forever.
      if (isRemoteSessionId(normalizedSessionId) && !user?.uid) {
        setIsLoading(false);
        toastRef.current.error("Sign in to open this session");
        navigateRef.current(
          `/signin?redirect=${encodeURIComponent(`/session/${normalizedSessionId}`)}`,
          { replace: true },
        );
        return;
      }

      const sessionKey = `${normalizedSessionId}::${user?.uid ?? "anonymous"}`;

      if (lastLoadedSessionKeyRef.current === sessionKey) {
        setIsLoading(false);
        return;
      }

      // Dedupe repeated effect reruns while a load is in-flight or after a failure.
      lastLoadedSessionKeyRef.current = sessionKey;
      setIsLoading(true);

      const applyHydratedPrompt = (
        promptData: PromptData,
        resolvedSessionId: string,
        options?: { markPersisted?: boolean },
      ): void => {
        const parsedGenerationParams = parseCapabilityValues(
          promptData.generationParams,
        );
        setSuggestionsDataRef.current?.(null);
        setConceptElementsRef.current?.(null);
        setInputPromptRef.current(promptData.input || "");
        setOptimizedPromptRef.current(promptData.output || "");
        setDisplayedPromptSilentlyRef.current(promptData.output || "");
        setGenericOptimizedPromptRef.current?.(null);
        setPreviewPromptRef.current?.(null);
        setPreviewAspectRatioRef.current?.(null);
        setCurrentPromptUuidRef.current(promptData.uuid ?? null);
        setCurrentPromptDocIdRef.current(promptData.id || resolvedSessionId);
        setShowResultsRef.current(
          Boolean(promptData.output && promptData.output.trim()),
        );
        if (typeof promptData.mode === "string" && promptData.mode.trim()) {
          setSelectedModeRef.current?.(promptData.mode.trim());
        }
        setSelectedModelRef.current(
          typeof promptData.targetModel === "string"
            ? promptData.targetModel
            : "",
        );
        setGenerationParamsRef.current?.(parsedGenerationParams);
        upsertHistoryEntryRef.current?.(
          {
            ...promptData,
            generationParams:
              Object.keys(parsedGenerationParams).length > 0
                ? (parsedGenerationParams as Record<string, unknown>)
                : null,
          },
          resolvedSessionId,
        );
        onLoadKeyframesRef.current?.(promptData.keyframes);

        const preloadHighlight: HighlightSnapshot | null =
          promptData.highlightCache
            ? ({
                ...promptData.highlightCache,
                signature:
                  promptData.highlightCache.signature ??
                  createHighlightSignature(promptData.output ?? ""),
              } as HighlightSnapshot)
            : null;
        applyInitialHighlightSnapshotRef.current(preloadHighlight, {
          bumpVersion: true,
          markPersisted: options?.markPersisted !== false,
        });
        resetVersionEditsRef.current();
        resetEditStacksRef.current();

        if (promptData.brainstormContext) {
          try {
            const contextData =
              typeof promptData.brainstormContext === "string"
                ? (JSON.parse(promptData.brainstormContext) as Record<
                    string,
                    unknown
                  >)
                : promptData.brainstormContext;
            const restoredContext = PromptContext.fromJSON(contextData);
            setPromptContextRef.current(restoredContext);
          } catch (contextError) {
            const info = sanitizeError(contextError);
            log.warn("Failed to restore prompt context from session", {
              operation: "restorePromptContext",
              sessionId: normalizedSessionId,
              error: info.message,
              errorName: info.name,
            });
            toastRef.current.warning(
              "Could not restore video context. The prompt will still load.",
            );
            setPromptContextRef.current(null);
          }
        } else {
          setPromptContextRef.current(null);
        }
      };

      const bootstrapBlankDraft = (): void => {
        setSuggestionsDataRef.current?.(null);
        setConceptElementsRef.current?.(null);
        setInputPromptRef.current("");
        setOptimizedPromptRef.current("");
        setDisplayedPromptSilentlyRef.current("");
        setGenericOptimizedPromptRef.current?.(null);
        setPreviewPromptRef.current?.(null);
        setPreviewAspectRatioRef.current?.(null);
        setShowResultsRef.current(false);
        applyInitialHighlightSnapshotRef.current(null, {
          bumpVersion: true,
          markPersisted: false,
        });
        resetVersionEditsRef.current();
        resetEditStacksRef.current();
        setPromptContextRef.current(null);
        onLoadKeyframesRef.current?.(null);
        setSelectedModeRef.current?.(selectedModeRef.current ?? "video");
        setSelectedModelRef.current(selectedModelValueRef.current ?? "");
        setGenerationParamsRef.current?.(
          generationParamsValueRef.current ?? {},
        );

        if (createDraftEntryRef.current) {
          const draft = createDraftEntryRef.current({
            id: normalizedSessionId,
            mode: selectedModeRef.current ?? "video",
            targetModel:
              typeof selectedModelValueRef.current === "string" &&
              selectedModelValueRef.current.trim()
                ? selectedModelValueRef.current.trim()
                : null,
            generationParams:
              (generationParamsValueRef.current as
                | Record<string, unknown>
                | null
                | undefined) ?? null,
            persist: false,
          });
          setCurrentPromptUuidRef.current(draft.uuid);
          setCurrentPromptDocIdRef.current(draft.id);
          return;
        }

        setCurrentPromptUuidRef.current(null);
        setCurrentPromptDocIdRef.current(normalizedSessionId);
      };

      try {
        if (!isRemoteSessionId(normalizedSessionId)) {
          const inMemoryDraft =
            historyEntriesRef.current.find(
              (entry) => entry.id === normalizedSessionId,
            ) ?? null;
          if (inMemoryDraft) {
            applyHydratedPrompt(inMemoryDraft, normalizedSessionId);
            return;
          }

          const localPromptRepository = getPromptRepositoryForUser(false);
          const localDraft = (await localPromptRepository.getById(
            normalizedSessionId,
          )) as PromptData | null;

          if (cancelled) return;

          if (localDraft) {
            applyHydratedPrompt(localDraft, normalizedSessionId);
          } else {
            bootstrapBlankDraft();
          }
          return;
        }

        const promptRepository = getPromptRepositoryForUser(isAuthenticated);
        const promptData = (await promptRepository.getById(
          normalizedSessionId,
        )) as PromptData | null;

        if (cancelled) return;

        if (promptData) {
          applyHydratedPrompt(promptData, normalizedSessionId);
        } else {
          log.warn("Prompt not found for session", {
            operation: "loadPromptFromSession",
            sessionId: normalizedSessionId,
          });
          navigateRef.current("/", { replace: true });
        }
      } catch (error) {
        if (cancelled) return;
        const err =
          error instanceof Error
            ? error
            : new Error(sanitizeError(error).message);
        log.error("Error loading prompt from session", err, {
          operation: "loadPromptFromSession",
          sessionId: normalizedSessionId,
        });
        toastRef.current.error("Failed to load prompt");
        navigateRef.current("/", { replace: true });
      } finally {
        loadCompleted = true;
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadPromptFromSession();

    return () => {
      cancelled = true;
      // If the effect is being re-run (dependency change) while a fetch was
      // still in-flight, clear the dedup guard so the next run retries the load
      // instead of incorrectly treating it as already completed.
      if (!loadCompleted) {
        lastLoadedSessionKeyRef.current = null;
      }
    };
  }, [
    sessionId,
    isAuthResolved,
    user?.uid,
    isAuthenticated,
    skipLoadFromUrlRef,
  ]);

  return { isLoading };
}
