import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DraftModel,
  GenerationOverrides,
} from "@features/generation-controls";
import { getAuthRepository } from "@repositories/index";
import { useAuthUser } from "@hooks/useAuthUser";
import { useToast } from "@components/Toast";
import { logger } from "@/services/LoggingService";
import { resolveMediaUrl } from "@/services/media/MediaUrlResolver";
import {
  usePromptNavigation,
  usePromptSession,
  usePromptServices,
} from "@features/prompt-optimizer/context/PromptStateContext";
import { useGenerationControlsContext } from "@features/prompt-optimizer/context/GenerationControlsContext";
import {
  useGenerationControlsStoreActions,
  useGenerationControlsStoreState,
} from "@features/generation-controls";
import { resolvePrimaryVideoSource } from "../utils/videoSource";
import { selectHeroGeneration } from "../utils/selectHeroGeneration";
import { useGenerationsState } from "./useGenerationsState";
import { useGenerationActions } from "./useGenerationActions";
import { useServerGenerationHydration } from "./useServerGenerationHydration";
import { useGenerationMediaRefresh } from "./useGenerationMediaRefresh";
import { useKeyframeWorkflow } from "./useKeyframeWorkflow";
import { useGenerationsTimeline } from "./useGenerationsTimeline";
import { useCapabilities } from "@/features/prompt-optimizer/hooks/useCapabilities";
import type {
  Generation,
  GenerationsPanelProps,
  GenerationsPanelRuntime,
  GenerationsPanelStateSnapshot,
} from "../types";
import {
  consumePendingGenerationIntent,
  peekPendingGenerationIntent,
  setPendingGenerationIntent,
} from "../utils/pendingGenerationIntent";
import { isRemoteSessionId } from "@/repositories/sessionIdNamespace";
import { addWorkspaceResetListener } from "@features/prompt-optimizer/events";

const log = logger.child("useGenerationsRuntime");

interface UseGenerationsRuntimeOptions {
  prompt: string;
  promptVersionId: string;
  aspectRatio: string;
  duration?: number | undefined;
  fps?: number | undefined;
  generationParams?: Record<string, unknown> | undefined;
  initialGenerations?: Generation[] | undefined;
  onGenerationsChange?: ((generations: Generation[]) => void) | undefined;
  presentation?: "timeline" | "hero" | undefined;
  onStateSnapshot?:
    | ((snapshot: GenerationsPanelStateSnapshot) => void)
    | undefined;
  versions: GenerationsPanelProps["versions"];
  onCreateVersionIfNeeded: () => string;
  heroOverrideGenerationId?: string | null | undefined;
}

type PendingGenerationIntentInput =
  | {
      kind: "draft";
      model: DraftModel;
      prompt: string;
      overrides?: GenerationOverrides | undefined;
    }
  | {
      kind: "render";
      model: string;
      prompt: string;
      overrides?: GenerationOverrides | undefined;
    };

export function useGenerationsRuntime({
  prompt,
  promptVersionId,
  aspectRatio,
  duration,
  fps,
  generationParams,
  initialGenerations,
  onGenerationsChange,
  presentation = "timeline",
  onStateSnapshot,
  versions,
  onCreateVersionIfNeeded,
  heroOverrideGenerationId,
}: UseGenerationsRuntimeOptions): GenerationsPanelRuntime {
  const toast = useToast();
  const authUser = useAuthUser();
  const { navigate, sessionId: currentSessionId } = usePromptNavigation();
  const {
    currentPromptDocId,
    currentPromptUuid,
    setCurrentPromptDocId,
    setCurrentPromptUuid,
  } = usePromptSession();
  const { promptHistory, promptOptimizer } = usePromptServices();
  const { saveToHistory } = promptHistory;
  const [isPreparingGeneration, setIsPreparingGeneration] = useState(false);
  const isPreparingGenerationRef = useRef(false);
  const setPreparingGenerationPending = useCallback((pending: boolean) => {
    isPreparingGenerationRef.current = pending;
    setIsPreparingGeneration(pending);
  }, []);
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

  const {
    generations,
    activeGenerationId,
    isGenerating,
    dispatch,
    getLatestByTier,
    removeGeneration,
    setActiveGeneration,
    clearGenerations,
  } = useGenerationsState({
    initialGenerations,
    onGenerationsChange,
    promptVersionId,
  });

  // Clear generation jobs/media when a new draft is created via + New.
  // Mirrors the pattern in PromptOptimizerWorkspace that clears generation controls.
  useEffect(() => {
    const handleWorkspaceReset = (): void => {
      clearGenerations();
    };
    return addWorkspaceResetListener(handleWorkspaceReset);
  }, [clearGenerations]);

  useGenerationMediaRefresh(generations, dispatch);

  const { setControls } = useGenerationControlsContext();
  const authUidRef = useRef(authUser?.uid);
  authUidRef.current = authUser?.uid;
  const { domain } = useGenerationControlsStoreState();
  const { setStartFrame, clearStartFrame, setExtendVideo, clearExtendVideo } =
    useGenerationControlsStoreActions();
  const selectedModelId =
    typeof domain.selectedModel === "string" ? domain.selectedModel.trim() : "";
  const keyframes = useMemo(() => domain.keyframes ?? [], [domain.keyframes]);
  const startFrame = domain.startFrame ?? null;
  const endFrame = domain.endFrame ?? null;
  const videoReferenceImages = useMemo(
    () => domain.videoReferenceImages ?? [],
    [domain.videoReferenceImages],
  );
  const extendVideo = domain.extendVideo ?? null;

  const { schema: selectedModelSchema } = useCapabilities(
    selectedModelId || undefined,
    { enabled: Boolean(selectedModelId) },
  );

  const selectedModelSupportsExtend =
    selectedModelSchema?.fields?.extend_video?.default === true;

  const mergedGenerationParams = useMemo(() => {
    const baseParams = { ...(generationParams ?? {}) } as Record<
      string,
      unknown
    >;

    if (keyframes.length > 0) {
      baseParams.keyframes = keyframes;
    }

    if (Object.keys(baseParams).length === 0) {
      return generationParams;
    }

    return baseParams;
  }, [generationParams, keyframes]);

  useEffect(() => {
    if (!extendVideo) return;
    if (!selectedModelId || !selectedModelSchema) return;
    if (selectedModelSupportsExtend) return;
    clearExtendVideo();
  }, [
    clearExtendVideo,
    extendVideo,
    selectedModelId,
    selectedModelSchema,
    selectedModelSupportsExtend,
  ]);

  const handleServerGenerationPersisted = useServerGenerationHydration({
    creatorId: authUser?.uid,
    sessionId: currentSessionId ?? null,
    history: promptHistory.history,
    updateEntryLocal: promptHistory.updateEntryLocal,
    onError: (error): void => {
      log.warn("Saved take could not be refreshed", {
        error: error instanceof Error ? error.message : "Unknown read failure",
      });
      toast.warning(
        "Saved, but could not refresh. Reopen this session to see it.",
      );
    },
  });

  const flushVersionWrites = promptHistory.flushVersionWrites;
  const ensureWordsVersionPersisted = useCallback(
    async (info: {
      sessionId: string;
      promptVersionId: string;
    }): Promise<void> => {
      const creatorId = authUser?.uid;
      if (
        !creatorId ||
        !currentPromptUuid ||
        !currentPromptDocId ||
        info.sessionId !== currentPromptDocId ||
        getAuthRepository().getCurrentUser()?.uid !== creatorId
      ) {
        throw new Error("Save the current words before making a clip.");
      }
      await flushVersionWrites(
        currentPromptUuid,
        info.sessionId,
        info.promptVersionId,
      );
    },
    [authUser?.uid, currentPromptDocId, currentPromptUuid, flushVersionWrites],
  );

  const generationActionsOptions = useMemo(
    () => ({
      aspectRatio,
      duration,
      fps,
      generationParams: mergedGenerationParams,
      promptVersionId,
      // ISSUE-12: thread current sessionId so preview POSTs can include it and
      // the server can persist the generation atomically to the session
      // version. Only remote (persisted) session ids are forwarded; draft-
      // prefixed ids are client-only and have no server-side record yet, so
      // the server would 404 on them. Null here → legacy client-authoritative
      // path in useGenerationActions.
      sessionId: isRemoteSessionId(currentSessionId) ? currentSessionId : null,
      generations,
      onServerGenerationPersisted: handleServerGenerationPersisted,
      ensureWordsVersionPersisted,
    }),
    [
      aspectRatio,
      currentSessionId,
      duration,
      fps,
      generations,
      handleServerGenerationPersisted,
      ensureWordsVersionPersisted,
      mergedGenerationParams,
      promptVersionId,
    ],
  );

  const {
    generateDraft,
    generateRender,
    isSubmitting,
    retryGeneration,
    cancelGeneration,
  } = useGenerationActions(dispatch, generationActionsOptions);

  const activeDraftModel = useMemo(
    () => getLatestByTier("draft")?.model ?? null,
    [getLatestByTier],
  );

  const storeDrivenOverrides = useMemo<GenerationOverrides | undefined>(() => {
    const overrides: GenerationOverrides = {};

    if (startFrame) {
      overrides.startImage = {
        url: startFrame.url,
        source: startFrame.source,
        ...(startFrame.assetId ? { assetId: startFrame.assetId } : {}),
        ...(startFrame.storagePath
          ? { storagePath: startFrame.storagePath }
          : {}),
        ...(startFrame.viewUrlExpiresAt
          ? { viewUrlExpiresAt: startFrame.viewUrlExpiresAt }
          : {}),
        // M5 2b: carry the source picture id so animating this frame links the
        // clip to its source picture (ancestorGenerationId) in the space.
        ...(startFrame.generationId
          ? { generationId: startFrame.generationId }
          : {}),
      };
    }

    if (endFrame?.url) {
      overrides.endImage = {
        url: endFrame.url,
        ...(endFrame.storagePath ? { storagePath: endFrame.storagePath } : {}),
        ...(endFrame.viewUrlExpiresAt
          ? { viewUrlExpiresAt: endFrame.viewUrlExpiresAt }
          : {}),
      };
    }

    if (videoReferenceImages.length > 0) {
      overrides.referenceImages = videoReferenceImages.map((reference) => ({
        url: reference.url,
        type: reference.referenceType,
        ...(reference.storagePath
          ? { storagePath: reference.storagePath }
          : {}),
        ...(reference.viewUrlExpiresAt
          ? { viewUrlExpiresAt: reference.viewUrlExpiresAt }
          : {}),
      }));
    }

    if (extendVideo?.url) {
      overrides.extendVideoUrl = extendVideo.url;
    }

    return Object.keys(overrides).length > 0 ? overrides : undefined;
  }, [endFrame, extendVideo, startFrame, videoReferenceImages]);

  const mergeRuntimeOverrides = useCallback(
    (overrides?: GenerationOverrides): GenerationOverrides | undefined => {
      const merged: GenerationOverrides = {
        ...(storeDrivenOverrides ?? {}),
        ...(overrides ?? {}),
      };

      return Object.keys(merged).length > 0 ? merged : undefined;
    },
    [storeDrivenOverrides],
  );

  const ensurePersistedSessionFromDraft = useCallback(
    async (intent: PendingGenerationIntentInput) => {
      if (!authUidRef.current) {
        return false;
      }

      const currentSessionKey = currentPromptDocId ?? currentSessionId ?? null;
      if (isRemoteSessionId(currentSessionKey)) {
        return false;
      }

      if (isPreparingGenerationRef.current) {
        return true;
      }

      setPreparingGenerationPending(true);

      const inputPrompt = promptOptimizer.inputPrompt.trim();
      const displayedPrompt = promptOptimizer.displayedPrompt.trim();
      const optimizedPrompt = promptOptimizer.optimizedPrompt.trim();
      const persistedInput = inputPrompt || intent.prompt.trim();
      const persistedOutput =
        displayedPrompt || optimizedPrompt || intent.prompt.trim();

      const saveResult = await saveToHistory(
        persistedInput,
        persistedOutput,
        promptOptimizer.qualityScore ?? null,
        "video",
        selectedModelId || null,
        mergedGenerationParams ?? null,
        currentHistoryEntry?.keyframes ?? null,
        currentHistoryEntry?.brainstormContext ?? null,
        currentHistoryEntry?.highlightCache ?? null,
        currentPromptUuid ?? currentHistoryEntry?.uuid ?? null,
        currentHistoryEntry?.title ?? null,
      );

      if (!saveResult?.id) {
        setPreparingGenerationPending(false);
        return true;
      }

      setCurrentPromptUuid(saveResult.uuid);
      setCurrentPromptDocId(saveResult.id);
      setPendingGenerationIntent({
        ...intent,
        sessionId: saveResult.id,
      });
      navigate(`/session/${encodeURIComponent(saveResult.id)}`, {
        replace: true,
      });
      return true;
    },
    [
      currentHistoryEntry?.brainstormContext,
      currentHistoryEntry?.highlightCache,
      currentHistoryEntry?.keyframes,
      currentHistoryEntry?.title,
      currentHistoryEntry?.uuid,
      currentPromptDocId,
      currentPromptUuid,
      currentSessionId,
      mergedGenerationParams,
      navigate,
      saveToHistory,
      promptOptimizer.displayedPrompt,
      promptOptimizer.inputPrompt,
      promptOptimizer.optimizedPrompt,
      promptOptimizer.qualityScore,
      selectedModelId,
      setCurrentPromptDocId,
      setCurrentPromptUuid,
      setPreparingGenerationPending,
    ],
  );

  const executeDraftAction = useCallback(
    (
      model: DraftModel,
      overrides?: GenerationOverrides,
      promptOverride?: string,
    ) => {
      // Prefer the live outer prompt when it's present (it may have been
      // rewritten by the optimizer during session load); fall back to the
      // intent's captured prompt when the editor is transiently empty
      // between navigate-to-session and loader-rehydration.
      const effectivePrompt =
        prompt.trim().length > 0 ? prompt : (promptOverride ?? prompt);
      if (!effectivePrompt.trim()) return;
      const resolvedOverrides = mergeRuntimeOverrides(overrides);
      const versionId = onCreateVersionIfNeeded();
      const resolvedStartImage = resolvedOverrides?.startImage ?? null;

      generateDraft(model, effectivePrompt, {
        promptVersionId: versionId,
        ...(resolvedStartImage ? { startImage: resolvedStartImage } : {}),
        ...(resolvedOverrides?.endImage
          ? { endImage: resolvedOverrides.endImage }
          : {}),
        ...(resolvedOverrides?.referenceImages?.length
          ? { referenceImages: resolvedOverrides.referenceImages }
          : {}),
        ...(resolvedOverrides?.extendVideoUrl
          ? { extendVideoUrl: resolvedOverrides.extendVideoUrl }
          : {}),
        ...(mergedGenerationParams
          ? { generationParams: mergedGenerationParams }
          : {}),
        ...(resolvedOverrides?.generationParams
          ? { generationParams: resolvedOverrides.generationParams }
          : {}),
      });
    },
    [
      generateDraft,
      mergeRuntimeOverrides,
      mergedGenerationParams,
      onCreateVersionIfNeeded,
      prompt,
    ],
  );

  const handleDraft = useCallback(
    (model: DraftModel, overrides?: GenerationOverrides) => {
      if (isPreparingGenerationRef.current || isSubmitting) {
        return;
      }
      if (!prompt.trim()) return;
      const currentSessionKey = currentPromptDocId ?? currentSessionId ?? null;
      if (!authUidRef.current || isRemoteSessionId(currentSessionKey)) {
        executeDraftAction(model, overrides);
        return;
      }
      void ensurePersistedSessionFromDraft({
        kind: "draft",
        model,
        prompt,
        ...(overrides ? { overrides } : {}),
      }).then((handled) => {
        if (!handled) {
          executeDraftAction(model, overrides);
        }
      });
    },
    [
      ensurePersistedSessionFromDraft,
      executeDraftAction,
      currentPromptDocId,
      currentSessionId,
      isSubmitting,
      prompt,
    ],
  );

  const {
    selectedFrameUrl,
    handleRender,
    handleSelectFrame: selectFrameInWorkflow,
    handleClearSelectedFrame: clearSelectedFrameInWorkflow,
  } = useKeyframeWorkflow({
    prompt,
    startFrame,
    setStartFrame,
    clearStartFrame,
    onCreateVersionIfNeeded,
    generateRender,
  });

  const handleSelectFrame = useCallback(
    (url: string, frameIndex: number, generationId: string) => {
      const generation = generations.find((item) => item.id === generationId);
      const storagePath = generation?.mediaAssetIds?.[frameIndex];
      selectFrameInWorkflow(
        url,
        frameIndex,
        generationId,
        storagePath,
        generation?.prompt ?? prompt,
      );
    },
    [generations, prompt, selectFrameInWorkflow],
  );

  const handleClearSelectedFrame = useCallback(() => {
    clearSelectedFrameInWorkflow();
  }, [clearSelectedFrameInWorkflow]);

  const executeRenderAction = useCallback(
    (
      model: string,
      overrides?: GenerationOverrides,
      promptOverride?: string,
    ) => {
      const resolvedOverrides = mergeRuntimeOverrides(overrides);
      handleRender(model, resolvedOverrides, promptOverride);
    },
    [handleRender, mergeRuntimeOverrides],
  );

  const handleRenderGeneration = useCallback(
    (model: string, overrides?: GenerationOverrides) => {
      if (isPreparingGenerationRef.current || isSubmitting) {
        return;
      }
      if (!prompt.trim()) return;
      const currentSessionKey = currentPromptDocId ?? currentSessionId ?? null;
      if (!authUidRef.current || isRemoteSessionId(currentSessionKey)) {
        executeRenderAction(model, overrides);
        return;
      }
      void ensurePersistedSessionFromDraft({
        kind: "render",
        model,
        prompt,
        ...(overrides ? { overrides } : {}),
      }).then((handled) => {
        if (!handled) {
          executeRenderAction(model, overrides);
        }
      });
    },
    [
      ensurePersistedSessionFromDraft,
      executeRenderAction,
      currentPromptDocId,
      currentSessionId,
      isSubmitting,
      prompt,
    ],
  );

  const executeDraftActionRef = useRef(executeDraftAction);
  executeDraftActionRef.current = executeDraftAction;
  const executeRenderActionRef = useRef(executeRenderAction);
  executeRenderActionRef.current = executeRenderAction;

  useEffect(() => {
    const pendingIntent = currentSessionId
      ? peekPendingGenerationIntent()
      : null;
    const hasPendingForRoute = Boolean(
      currentSessionId &&
        pendingIntent &&
        pendingIntent.sessionId === currentSessionId,
    );

    if (hasPendingForRoute) {
      setPreparingGenerationPending(true);
    } else if (!isSubmitting) {
      setPreparingGenerationPending(false);
    }

    if (!currentSessionId || !pendingIntent) {
      return;
    }
    if (pendingIntent.sessionId !== currentSessionId) {
      return;
    }
    // Gate on the INTENT's captured prompt, not the outer `prompt` prop. The
    // editor is transiently empty between navigate-to-session and loader
    // rehydration; reading the intent keeps the resume deterministic.
    if (pendingIntent.prompt.trim().length === 0) {
      return;
    }

    const nextIntent = consumePendingGenerationIntent(currentSessionId);
    if (!nextIntent) {
      return;
    }

    if (
      nextIntent.kind === "draft" &&
      typeof nextIntent.model === "string" &&
      nextIntent.prompt.trim()
    ) {
      executeDraftActionRef.current(
        nextIntent.model,
        nextIntent.overrides,
        nextIntent.prompt,
      );
      return;
    }

    if (
      nextIntent.kind === "render" &&
      typeof nextIntent.model === "string" &&
      nextIntent.prompt.trim()
    ) {
      executeRenderActionRef.current(
        nextIntent.model,
        nextIntent.overrides,
        nextIntent.prompt,
      );
      return;
    }
  }, [currentSessionId, isSubmitting, prompt, setPreparingGenerationPending]);

  const handleDraftForControls = useCallback(
    (model: DraftModel, overrides?: GenerationOverrides) => {
      handleDraft(model, overrides);
    },
    [handleDraft],
  );

  const handleRenderForControls = useCallback(
    (model: string, overrides?: GenerationOverrides) => {
      handleRenderGeneration(model, overrides);
    },
    [handleRenderGeneration],
  );

  const handleDelete = useCallback(
    (generation: Generation) => {
      removeGeneration(generation.id);
    },
    [removeGeneration],
  );

  const handleRetry = useCallback(
    (generation: Generation) => {
      retryGeneration(generation.id);
    },
    [retryGeneration],
  );

  const handleCancel = useCallback(
    (generation: Generation) => {
      cancelGeneration(generation.id);
    },
    [cancelGeneration],
  );

  const handleDownload = useCallback((generation: Generation) => {
    const url = generation.mediaUrls[0];
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, []);

  const handleExtendGeneration = useCallback(
    (generation: Generation) => {
      if (!selectedModelSupportsExtend) return;
      if (generation.status !== "completed" || generation.mediaType !== "video")
        return;
      const mediaUrl = generation.mediaUrls[0] ?? null;
      if (!mediaUrl) {
        toast.warning(
          "This generation is missing a video source for extension.",
        );
        return;
      }

      const { storagePath, assetId } = resolvePrimaryVideoSource(
        mediaUrl,
        generation.mediaAssetIds?.[0] ?? null,
      );

      void (async () => {
        const resolved = await resolveMediaUrl({
          kind: "video",
          url: mediaUrl,
          storagePath,
          assetId,
          preferFresh: true,
        });
        const resolvedStoragePath = resolved.storagePath ?? storagePath;
        const resolvedAssetId = resolved.assetId ?? assetId;

        setExtendVideo({
          url: resolved.url ?? mediaUrl,
          source: "generation",
          generationId: generation.id,
          ...(resolvedStoragePath ? { storagePath: resolvedStoragePath } : {}),
          ...(resolvedAssetId ? { assetId: resolvedAssetId } : {}),
        });
      })();
    },
    [selectedModelSupportsExtend, setExtendVideo, toast],
  );

  const versionsForTimeline = useMemo(() => {
    if (!versions.length || !promptVersionId) return versions;
    const index = versions.findIndex(
      (version) => version.versionId === promptVersionId,
    );
    if (index < 0) return versions;
    const target = versions[index];
    if (!target || target.generations === generations) return versions;
    const next = [...versions];
    next[index] = { ...target, generations };
    return next;
  }, [generations, promptVersionId, versions]);

  const timeline = useGenerationsTimeline({ versions: versionsForTimeline });
  const totalVisibleGenerations = useMemo(
    () => timeline.filter((item) => item.type === "generation").length,
    [timeline],
  );
  const canExtendGenerations = Boolean(selectedModelSupportsExtend);

  const isNonStoryboardGenerating = useMemo(
    () =>
      generations.some(
        (generation) =>
          generation.mediaType !== "image-sequence" &&
          (generation.status === "pending" ||
            generation.status === "generating"),
      ),
    [generations],
  );

  const controlsIsGenerating =
    presentation === "hero" ? isNonStoryboardGenerating : isGenerating;
  const controlsIsSubmitting = isSubmitting || isPreparingGeneration;

  const controlsPayload = useMemo(
    () => ({
      onDraft: handleDraftForControls,
      onRender: handleRenderForControls,
      isGenerating: controlsIsGenerating,
      isSubmitting: controlsIsSubmitting,
      activeDraftModel,
    }),
    [
      activeDraftModel,
      controlsIsGenerating,
      controlsIsSubmitting,
      handleDraftForControls,
      handleRenderForControls,
    ],
  );

  useEffect(() => {
    setControls(controlsPayload);
    return () => setControls(null);
  }, [controlsPayload, setControls]);

  const activeGeneration = useMemo(() => {
    if (generations.length === 0) return null;
    if (activeGenerationId) {
      const matched = generations.find(
        (generation) => generation.id === activeGenerationId,
      );
      if (matched) return matched;
    }
    return generations[generations.length - 1] ?? null;
  }, [activeGenerationId, generations]);

  const heroGeneration = useMemo(
    () =>
      selectHeroGeneration({
        generations,
        activeGenerationId: activeGeneration?.id ?? null,
        heroOverrideGenerationId: heroOverrideGenerationId ?? null,
      }),
    [activeGeneration, generations, heroOverrideGenerationId],
  );

  const onStateSnapshotRef = useRef(onStateSnapshot);
  onStateSnapshotRef.current = onStateSnapshot;

  useEffect(() => {
    const callback = onStateSnapshotRef.current;
    if (!callback) return;
    const snapshot: GenerationsPanelStateSnapshot = {
      generations,
      activeGenerationId,
      isGenerating,
      selectedFrameUrl: selectedFrameUrl ?? null,
    };
    callback(snapshot);
  }, [activeGenerationId, generations, isGenerating, selectedFrameUrl]);

  return {
    generations,
    activeGenerationId,
    isGenerating,
    selectedFrameUrl: selectedFrameUrl ?? null,
    timeline,
    totalVisibleGenerations,
    canExtendGenerations,
    heroGeneration,
    handleRetry,
    handleDelete,
    handleDownload,
    handleExtendGeneration,
    handleCancel,
    handleSelectFrame,
    handleClearSelectedFrame,
    setActiveGeneration,
  };
}
