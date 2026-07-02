import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DraftModel,
  GenerationOverrides,
} from "@features/generation-controls";
import { useCreditBalance } from "@/contexts/CreditBalanceContext";
import { useAuthUser } from "@hooks/useAuthUser";
import { useToast } from "@components/Toast";
import { logger } from "@/services/LoggingService";
import { resolveMediaUrl } from "@/services/media/MediaUrlResolver";
import {
  usePromptNavigation,
  usePromptSession,
  usePromptServices,
} from "@features/prompt-optimizer/context/PromptStateContext";
import { useWorkspaceSession } from "@features/prompt-optimizer/context/WorkspaceSessionContext";
import { useGenerationControlsContext } from "@features/prompt-optimizer/context/GenerationControlsContext";
import {
  useGenerationControlsStoreActions,
  useGenerationControlsStoreState,
} from "@features/generation-controls";
import { resolvePrimaryVideoSource } from "../utils/videoSource";
import { selectHeroGeneration } from "../utils/selectHeroGeneration";
import { getModelConfig, getModelCreditCost } from "../config/generationConfig";
import { useGenerationsState } from "./useGenerationsState";
import { useGenerationActions } from "./useGenerationActions";
import { useAssetReferenceImages } from "./useAssetReferenceImages";
import { useGenerationMediaRefresh } from "./useGenerationMediaRefresh";
import { useKeyframeWorkflow } from "./useKeyframeWorkflow";
import { useGenerationsTimeline } from "./useGenerationsTimeline";
import { VIDEO_DRAFT_MODEL } from "@/components/ToolSidebar/config/modelConfig";
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
    }
  | {
      kind: "storyboard";
      prompt: string;
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
  const { balance, isLoading: isLoadingBalance } = useCreditBalance();
  const { navigate, sessionId: currentSessionId } = usePromptNavigation();
  const {
    currentPromptDocId,
    currentPromptUuid,
    setCurrentPromptDocId,
    setCurrentPromptUuid,
  } = usePromptSession();
  const { promptHistory, promptOptimizer } = usePromptServices();
  const { saveToHistory } = promptHistory;
  const {
    session: workspaceSession,
    isSequenceMode,
    hasActiveContinuityShot,
    isStartingSequence,
    startSequence,
    currentShot,
    generateShot,
    updateShot,
  } = useWorkspaceSession();
  const currentRouteSessionIdRef = useRef<string | null>(
    currentSessionId ?? null,
  );
  useEffect(() => {
    currentRouteSessionIdRef.current = currentSessionId ?? null;
  }, [currentSessionId]);
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
    window.addEventListener("po:workspace-reset", handleWorkspaceReset);
    return () =>
      window.removeEventListener("po:workspace-reset", handleWorkspaceReset);
  }, [clearGenerations]);

  useGenerationMediaRefresh(generations, dispatch);

  const { setControls, faceSwapPreview, onInsufficientCredits } =
    useGenerationControlsContext();
  const onInsufficientCreditsRef = useRef(onInsufficientCredits);
  onInsufficientCreditsRef.current = onInsufficientCredits;
  const balanceRef = useRef(balance);
  balanceRef.current = balance;
  const isLoadingBalanceRef = useRef(isLoadingBalance);
  isLoadingBalanceRef.current = isLoadingBalance;
  const notifyInsufficientCredits = useCallback(
    (required: number, operation: string) => {
      if (onInsufficientCreditsRef.current) {
        onInsufficientCreditsRef.current(required, operation);
        return;
      }

      // Fallback: use error toast (more prominent than warning) when modal bridge is unavailable
      if (typeof balanceRef.current === "number") {
        toast.error(
          `${operation} needs ${required} credits. You currently have ${balanceRef.current}.`,
        );
        return;
      }

      if (isLoadingBalanceRef.current) {
        toast.error(
          `Credit balance is still loading for ${operation}. Try again in a moment.`,
        );
        return;
      }

      toast.error(`${operation} needs ${required} credits.`);
    },
    [toast],
  );
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
  const cameraMotion = domain.cameraMotion ?? null;
  const subjectMotion =
    typeof domain.subjectMotion === "string" ? domain.subjectMotion : "";

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

    if (cameraMotion?.id) {
      baseParams.camera_motion_id = cameraMotion.id;
    }

    const subjectMotionValue = subjectMotion.trim();
    if (subjectMotionValue) {
      baseParams.subject_motion = subjectMotionValue;
    }

    if (Object.keys(baseParams).length === 0) {
      return generationParams;
    }

    return baseParams;
  }, [cameraMotion?.id, generationParams, keyframes, subjectMotion]);

  const motionMergeMeta = useMemo(() => {
    const mergedKeys =
      mergedGenerationParams && typeof mergedGenerationParams === "object"
        ? Object.keys(mergedGenerationParams as Record<string, unknown>)
        : [];
    const cameraMotionId =
      mergedGenerationParams &&
      typeof mergedGenerationParams === "object" &&
      typeof (mergedGenerationParams as Record<string, unknown>)
        .camera_motion_id === "string"
        ? String(
            (mergedGenerationParams as Record<string, unknown>)
              .camera_motion_id,
          )
        : null;
    const subjectMotionLength = subjectMotion.trim().length;

    return {
      keyframesCount: keyframes.length,
      hasCameraMotion: Boolean(cameraMotionId),
      cameraMotionId,
      hasSubjectMotion: subjectMotionLength > 0,
      subjectMotionLength,
      mergedKeysCount: mergedKeys.length,
      mergedKeys,
    } as const;
  }, [keyframes.length, mergedGenerationParams, subjectMotion]);

  useEffect(() => {
    if (
      !motionMergeMeta.keyframesCount &&
      !motionMergeMeta.hasCameraMotion &&
      !motionMergeMeta.hasSubjectMotion
    ) {
      return;
    }

    log.info("Merged generation params include motion/keyframe context", {
      ...motionMergeMeta,
      hasCameraMotionFieldInMergedParams:
        motionMergeMeta.mergedKeys.includes("camera_motion_id"),
      hasSubjectMotionFieldInMergedParams:
        motionMergeMeta.mergedKeys.includes("subject_motion"),
      hasKeyframesFieldInMergedParams:
        motionMergeMeta.mergedKeys.includes("keyframes"),
    });
  }, [motionMergeMeta]);

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

  const loadHistoryFromFirestore = promptHistory.loadHistoryFromFirestore;
  const refreshHistoryFromServer = useCallback((): void => {
    const uid = authUser?.uid;
    if (!uid) return;
    // Fire-and-forget — the gallery re-renders on its own when history state
    // hydrates. Any error is logged by useHistoryPersistence internally.
    void loadHistoryFromFirestore(uid);
  }, [authUser?.uid, loadHistoryFromFirestore]);

  const handleServerGenerationPersisted = useCallback((): void => {
    // ISSUE-12 UX polish: after the server confirms attachment, refresh
    // history so the session's version.generations flows into
    // initialGenerations → useGenerationsState → GalleryPanel without the
    // user needing to reload.
    refreshHistoryFromServer();
  }, [refreshHistoryFromServer]);

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
      onInsufficientCredits: notifyInsufficientCredits,
      onServerGenerationPersisted: handleServerGenerationPersisted,
    }),
    [
      aspectRatio,
      currentSessionId,
      duration,
      fps,
      generations,
      handleServerGenerationPersisted,
      mergedGenerationParams,
      notifyInsufficientCredits,
      promptVersionId,
    ],
  );

  const {
    generateDraft,
    generateRender,
    generateStoryboard,
    isSubmitting,
    retryGeneration,
    cancelGeneration,
  } = useGenerationActions(dispatch, generationActionsOptions);

  const { resolvedPrompt } = useAssetReferenceImages(prompt);
  const detectedCharacter = useMemo(
    () => resolvedPrompt?.characters?.[0] ?? null,
    [resolvedPrompt],
  );

  const activeDraftModel = useMemo(
    () => getLatestByTier("draft")?.model ?? null,
    [getLatestByTier],
  );

  const faceSwapOverride = useMemo<GenerationOverrides | null>(() => {
    if (!faceSwapPreview?.url) return null;
    return {
      startImage: {
        url: faceSwapPreview.url,
        source: "face-swap",
      },
      characterAssetId: faceSwapPreview.characterAssetId,
      faceSwapAlreadyApplied: true,
      faceSwapUrl: faceSwapPreview.url,
    };
  }, [faceSwapPreview?.characterAssetId, faceSwapPreview?.url]);

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

  const hasCreditsFor = useCallback(
    (required: number, operation: string): boolean => {
      if (!authUidRef.current) return true;
      if (balanceRef.current === null || balanceRef.current === undefined)
        return true;
      if (balanceRef.current >= required) return true;
      notifyInsufficientCredits(required, operation);
      return false;
    },
    [notifyInsufficientCredits],
  );

  const generateSequenceShot = useCallback(
    async (modelId?: string) => {
      if (!currentShot) {
        toast.warning("No active continuity shot available.");
        return;
      }
      if (
        currentShot.status === "generating-keyframe" ||
        currentShot.status === "generating-video"
      ) {
        toast.warning("A shot is already generating.");
        return;
      }
      if (modelId && currentShot.modelId !== modelId) {
        await updateShot(currentShot.id, { modelId });
      }
      await generateShot(currentShot.id);
    },
    [currentShot, generateShot, toast, updateShot],
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
      if (hasActiveContinuityShot) {
        onCreateVersionIfNeeded();
        void generateSequenceShot(model);
        return;
      }
      const modelConfig = getModelConfig(model);
      const requiredCredits = getModelCreditCost(model, duration);
      const operationLabel = `${modelConfig?.label ?? "Video"} preview`;
      if (!hasCreditsFor(requiredCredits, operationLabel)) {
        return;
      }
      const resolvedOverrides = mergeRuntimeOverrides(
        overrides ?? faceSwapOverride ?? undefined,
      );
      const versionId = onCreateVersionIfNeeded();
      const resolvedStartImage = resolvedOverrides?.startImage ?? null;
      const autoCharacterAssetId =
        resolvedOverrides?.characterAssetId ??
        (!resolvedStartImage ? detectedCharacter?.id : undefined);

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
        ...(autoCharacterAssetId
          ? { characterAssetId: autoCharacterAssetId }
          : {}),
        ...(resolvedOverrides?.faceSwapAlreadyApplied
          ? { faceSwapAlreadyApplied: true }
          : {}),
        ...(resolvedOverrides?.faceSwapUrl
          ? { faceSwapUrl: resolvedOverrides.faceSwapUrl }
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
      detectedCharacter?.id,
      duration,
      faceSwapOverride,
      generateDraft,
      generateSequenceShot,
      hasActiveContinuityShot,
      hasCreditsFor,
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
      if (hasActiveContinuityShot) {
        executeDraftAction(model, overrides);
        return;
      }
      if (!hasActiveContinuityShot) {
        const modelConfig = getModelConfig(model);
        const requiredCredits = getModelCreditCost(model, duration);
        const operationLabel = `${modelConfig?.label ?? "Video"} preview`;
        if (!hasCreditsFor(requiredCredits, operationLabel)) {
          return;
        }
      }
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
      duration,
      ensurePersistedSessionFromDraft,
      executeDraftAction,
      currentPromptDocId,
      currentSessionId,
      hasActiveContinuityShot,
      hasCreditsFor,
      isSubmitting,
      prompt,
    ],
  );

  const {
    keyframeStep,
    selectedFrameUrl,
    handleRender,
    handleApproveKeyframe: approveKeyframeFromWorkflow,
    handleSkipKeyframe,
    handleSelectFrame: selectFrameInWorkflow,
    handleClearSelectedFrame: clearSelectedFrameInWorkflow,
  } = useKeyframeWorkflow({
    prompt,
    startFrame,
    setStartFrame,
    clearStartFrame,
    detectedCharacter,
    onCreateVersionIfNeeded,
    generateRender,
  });

  const handleApproveKeyframe = useCallback(
    (keyframeUrl: string) => {
      setStartFrame({
        id: `keyframe-step-${Date.now()}`,
        url: keyframeUrl,
        source: "generation",
        ...(prompt.trim() ? { sourcePrompt: prompt.trim() } : {}),
      });
      approveKeyframeFromWorkflow(keyframeUrl);
    },
    [approveKeyframeFromWorkflow, prompt, setStartFrame],
  );

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
      _promptOverride?: string,
    ) => {
      if (hasActiveContinuityShot) {
        onCreateVersionIfNeeded();
        void generateSequenceShot(model);
        return;
      }
      const modelConfig = getModelConfig(model);
      const requiredCredits = getModelCreditCost(model, duration);
      const operationLabel = `${modelConfig?.label ?? "Video"} render`;
      if (!hasCreditsFor(requiredCredits, operationLabel)) {
        return;
      }
      const resolvedOverrides = mergeRuntimeOverrides(
        overrides ?? faceSwapOverride ?? undefined,
      );
      handleRender(model, resolvedOverrides);
    },
    [
      duration,
      faceSwapOverride,
      generateSequenceShot,
      handleRender,
      hasActiveContinuityShot,
      hasCreditsFor,
      mergeRuntimeOverrides,
      onCreateVersionIfNeeded,
    ],
  );

  const handleRenderWithFaceSwap = useCallback(
    (model: string, overrides?: GenerationOverrides) => {
      if (isPreparingGenerationRef.current || isSubmitting) {
        return;
      }
      if (!prompt.trim()) return;
      if (hasActiveContinuityShot) {
        executeRenderAction(model, overrides);
        return;
      }
      const modelConfig = getModelConfig(model);
      const requiredCredits = getModelCreditCost(model, duration);
      const operationLabel = `${modelConfig?.label ?? "Video"} render`;
      if (!hasCreditsFor(requiredCredits, operationLabel)) {
        return;
      }
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
      duration,
      ensurePersistedSessionFromDraft,
      executeRenderAction,
      currentPromptDocId,
      currentSessionId,
      hasActiveContinuityShot,
      hasCreditsFor,
      isSubmitting,
      prompt,
    ],
  );

  const executeStoryboardAction = useCallback(
    (promptOverride?: string) => {
      if (hasActiveContinuityShot) {
        onCreateVersionIfNeeded();
        void generateSequenceShot(VIDEO_DRAFT_MODEL.id);
        return;
      }
      const storyboardConfig = getModelConfig("flux-kontext");
      const requiredCredits = storyboardConfig?.credits ?? 4;
      if (!hasCreditsFor(requiredCredits, "Storyboard")) {
        return;
      }
      // Prefer the live outer prompt when present (optimizer may have
      // rewritten it during session load). Fall back to the intent's
      // captured prompt when the editor is transiently empty during
      // draft→persisted navigation.
      const resolvedPrompt =
        prompt.trim() ||
        promptOverride?.trim() ||
        "Generate a storyboard based on the reference image.";
      const versionId = onCreateVersionIfNeeded();
      const seedImageUrl = startFrame?.url ?? null;
      generateStoryboard(resolvedPrompt, {
        promptVersionId: versionId,
        seedImageUrl,
      });
    },
    [
      generateStoryboard,
      generateSequenceShot,
      hasActiveContinuityShot,
      hasCreditsFor,
      onCreateVersionIfNeeded,
      prompt,
      startFrame?.url,
    ],
  );

  const handleStoryboard = useCallback(() => {
    if (isPreparingGenerationRef.current || isSubmitting) {
      return;
    }
    if (hasActiveContinuityShot) {
      executeStoryboardAction();
      return;
    }
    const currentSessionKey = currentPromptDocId ?? currentSessionId ?? null;
    if (!authUidRef.current || isRemoteSessionId(currentSessionKey)) {
      executeStoryboardAction();
      return;
    }
    void ensurePersistedSessionFromDraft({
      kind: "storyboard",
      prompt,
    }).then((handled) => {
      if (!handled) {
        executeStoryboardAction();
      }
    });
  }, [
    ensurePersistedSessionFromDraft,
    executeStoryboardAction,
    currentPromptDocId,
    currentSessionId,
    hasActiveContinuityShot,
    isSubmitting,
    prompt,
  ]);

  const executeDraftActionRef = useRef(executeDraftAction);
  executeDraftActionRef.current = executeDraftAction;
  const executeRenderActionRef = useRef(executeRenderAction);
  executeRenderActionRef.current = executeRenderAction;
  const executeStoryboardActionRef = useRef(executeStoryboardAction);
  executeStoryboardActionRef.current = executeStoryboardAction;

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

    executeStoryboardActionRef.current(nextIntent.prompt);
  }, [currentSessionId, isSubmitting, prompt, setPreparingGenerationPending]);

  const handleDraftForControls = useCallback(
    (model: DraftModel, overrides?: GenerationOverrides) => {
      handleDraft(model, overrides);
    },
    [handleDraft],
  );

  const handleRenderForControls = useCallback(
    (model: string, overrides?: GenerationOverrides) => {
      handleRenderWithFaceSwap(model, overrides);
    },
    [handleRenderWithFaceSwap],
  );

  const handleStoryboardForControls = useCallback(() => {
    handleStoryboard();
  }, [handleStoryboard]);

  const handleDelete = useCallback(
    (generation: Generation) => {
      if (hasActiveContinuityShot) return;
      removeGeneration(generation.id);
    },
    [hasActiveContinuityShot, removeGeneration],
  );

  const handleRetry = useCallback(
    (generation: Generation) => {
      if (hasActiveContinuityShot) {
        onCreateVersionIfNeeded();
        void generateSequenceShot(generation.model);
        return;
      }
      retryGeneration(generation.id);
    },
    [
      generateSequenceShot,
      hasActiveContinuityShot,
      onCreateVersionIfNeeded,
      retryGeneration,
    ],
  );

  const handleCancel = useCallback(
    (generation: Generation) => {
      if (hasActiveContinuityShot) return;
      cancelGeneration(generation.id);
    },
    [cancelGeneration, hasActiveContinuityShot],
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

  const handleContinueSequence = useCallback(
    async (generation: Generation) => {
      if (hasActiveContinuityShot || isStartingSequence) return;
      const mediaUrl = generation.mediaUrls[0] ?? null;
      const { assetId, storagePath } = resolvePrimaryVideoSource(
        mediaUrl,
        generation.mediaAssetIds?.[0] ?? null,
      );
      const sourceVideoId = assetId ?? storagePath;
      const sourceImageUrl =
        typeof generation.thumbnailUrl === "string" &&
        generation.thumbnailUrl.trim()
          ? generation.thumbnailUrl.trim()
          : null;

      if (!sourceVideoId) {
        log.warn("Cannot start sequence: missing source video ref", {
          generationId: generation.id,
          mediaUrl,
          mediaAssetId: generation.mediaAssetIds?.[0] ?? null,
          routeSessionId: currentSessionId ?? null,
          currentPromptDocId,
        });
        toast.warning("Unable to start a sequence from this generation.");
        return;
      }

      const routeSessionIdAtStart = currentSessionId ?? null;
      const originSessionId =
        routeSessionIdAtStart ??
        currentPromptDocId ??
        workspaceSession?.id ??
        null;
      log.info("Starting sequence", {
        generationId: generation.id,
        sourceVideoId,
        routeSessionId: routeSessionIdAtStart,
        currentPromptDocId,
        originSessionId,
      });

      try {
        const { sessionId: sequenceSessionId } = await startSequence({
          sourceVideoId,
          ...(sourceImageUrl ? { sourceImageUrl } : {}),
          prompt: generation.prompt,
          ...(originSessionId ? { originSessionId } : {}),
        });

        if (currentRouteSessionIdRef.current !== routeSessionIdAtStart) {
          log.info(
            "Skipping sequence navigation after route changed during startup",
            {
              generationId: generation.id,
              routeSessionIdAtStart,
              routeSessionIdCurrent: currentRouteSessionIdRef.current ?? null,
              sequenceSessionId,
            },
          );
          return;
        }

        if (sequenceSessionId && sequenceSessionId !== originSessionId) {
          const originParam = originSessionId
            ? `?originSessionId=${encodeURIComponent(originSessionId)}`
            : "";
          navigate(
            `/session/${encodeURIComponent(sequenceSessionId)}${originParam}`,
          );
        }

        log.info("Sequence started from generation", {
          generationId: generation.id,
          sequenceSessionId,
          originSessionId,
        });
        toast.success("Sequence mode enabled.");
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        log.error("Failed to start sequence from generation", err, {
          generationId: generation.id,
          sourceVideoId,
          routeSessionId: currentSessionId ?? null,
          currentPromptDocId,
          originSessionId,
        });
        toast.error(
          error instanceof Error ? error.message : "Failed to start sequence",
        );
      }
    },
    [
      currentPromptDocId,
      currentSessionId,
      hasActiveContinuityShot,
      isStartingSequence,
      navigate,
      startSequence,
      toast,
      workspaceSession?.id,
    ],
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
      onStoryboard: handleStoryboardForControls,
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
      handleStoryboardForControls,
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
    keyframeStep,
    timeline,
    totalVisibleGenerations,
    canExtendGenerations,
    isSequenceMode,
    hasActiveContinuityShot,
    isStartingSequence,
    heroGeneration,
    activeDraftModel,
    handleDraft,
    handleRenderWithFaceSwap,
    handleStoryboard,
    handleApproveKeyframe,
    handleSkipKeyframe,
    handleRetry,
    handleDelete,
    handleDownload,
    handleExtendGeneration,
    handleCancel,
    handleContinueSequence,
    handleSelectFrame,
    handleClearSelectedFrame,
    setActiveGeneration,
  };
}
