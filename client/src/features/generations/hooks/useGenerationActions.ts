import { useCallback, useEffect, useRef, useState } from "react";

import type { Generation, GenerationParams } from "../types";
import type { DraftModel } from "@features/generation-controls";
import type { GenerationsAction } from "./useGenerationsState";
import {
  compileWanPrompt,
  generateStoryboardPreview,
  generateVideoPreview,
  waitForVideoJob,
} from "../api";
import {
  buildGeneration,
  resolveGenerationOptions,
} from "../utils/generationUtils";
import { logger } from "@/services/LoggingService";
import { sanitizeError } from "@/utils/logging";
import { extractMotionMeta } from "@/utils/motion";
import { resolveMediaUrl } from "@/services/media/MediaUrlResolver";
import { assetApi } from "@/features/assets/api/assetApi";
import { safeUrlHost } from "@/utils/url";
import { ApiError } from "@/services/http/ApiError";
import {
  extractStorageObjectPath,
  hasGcsSignedUrlParams,
  parseGcsSignedUrlExpiryMs,
} from "@/utils/storageUrl";
import {
  publishCreditBalanceSync,
  requestCreditBalanceRefresh,
} from "@/hooks/useUserCreditBalance";
import { getModelConfig, getModelCreditCost } from "../config/generationConfig";
import { getVideoInputSupport } from "../utils/videoInputSupport";

/** Extract the asset ID (last path segment) from a storage path or return the value as-is. */
const extractAssetId = (pathOrId: string): string => {
  const segments = pathOrId.split("/").filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1]! : pathOrId;
};

const toAssetIds = (paths: string[]): string[] => paths.map(extractAssetId);

interface UseGenerationActionsOptions {
  aspectRatio?: string | undefined;
  duration?: number | undefined;
  fps?: number | undefined;
  generationParams?: Record<string, unknown> | undefined;
  promptVersionId?: string | null | undefined;
  // ISSUE-12: when present, preview POSTs include sessionId so the server can
  // atomically append the generation to the named session version. Absence
  // falls through to the legacy client-authoritative dispatch path.
  sessionId?: string | null | undefined;
  generations?: Generation[] | undefined;
  onInsufficientCredits?:
    | ((required: number, operation: string) => void)
    | undefined;
  /**
   * Invoked when a preview POST returns a server-persisted generationId.
   * Callers use this signal to re-fetch the session so the gallery can
   * hydrate from authoritative server state instead of waiting for a
   * page reload.
   */
  onServerGenerationPersisted?:
    | ((info: { sessionId: string; generationId: string }) => void)
    | undefined;
}

interface StoryboardParams extends GenerationParams {
  seedImageUrl?: string | null | undefined;
}

const log = logger.child("useGenerationActions");
const TRIGGER_REGEX = /@([a-zA-Z][a-zA-Z0-9_-]*)/g;

/**
 * Normalize the session-persistence context from hook options. Returns
 * `undefined` for either field when absent/blank so the spread at the call
 * site omits the key entirely and the server takes its legacy path.
 */
const readSessionParams = (
  options: UseGenerationActionsOptions,
): { sessionId?: string; promptVersionId?: string } => {
  const sessionId = options.sessionId?.trim();
  const promptVersionId = options.promptVersionId?.trim();
  return {
    ...(sessionId ? { sessionId } : {}),
    ...(promptVersionId ? { promptVersionId } : {}),
  };
};

const extractFaceSwapMeta = (params?: GenerationParams) => {
  const resolvedFaceSwapUrl =
    params?.faceSwapUrl ??
    (params?.faceSwapAlreadyApplied ? (params.startImage?.url ?? null) : null);
  return {
    faceSwapUrl: resolvedFaceSwapUrl,
    faceSwapApplied: Boolean(resolvedFaceSwapUrl),
    characterAssetId: params?.characterAssetId ?? null,
  } as const;
};

const hasPromptTriggers = (prompt: string): boolean =>
  Array.from(prompt.matchAll(TRIGGER_REGEX)).length > 0;

const START_IMAGE_REFRESH_BUFFER_MS = 2 * 60 * 1000;

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
    return Date.now() >= expiresAtMs - START_IMAGE_REFRESH_BUFFER_MS;
  }
  return hasGcsSignedUrlParams(url);
};

const isInsufficientCreditsError = (error: unknown): error is ApiError => {
  if (!(error instanceof ApiError) || error.status !== 402) {
    return false;
  }
  if (!error.response || typeof error.response !== "object") {
    return false;
  }
  if (!("code" in error.response)) {
    return false;
  }
  return (error.response as { code?: unknown }).code === "INSUFFICIENT_CREDITS";
};

type RefreshableImageInput = {
  url: string;
  storagePath?: string | undefined;
  viewUrlExpiresAt?: string | undefined;
};

const resolveRefreshableImageUrl = async <
  T extends RefreshableImageInput | null | undefined,
>(
  input: T,
): Promise<T> => {
  if (!input || typeof input.url !== "string") {
    return input;
  }

  const storagePath = input.storagePath || extractStorageObjectPath(input.url);
  if (!storagePath) {
    return input;
  }

  const expiresAtMs =
    parseExpiresAtMs(input.viewUrlExpiresAt) ??
    parseGcsSignedUrlExpiryMs(input.url);
  const needsRefresh = shouldRefreshStartImage(input.url, expiresAtMs);
  if (!needsRefresh) {
    return {
      ...input,
      storagePath,
    };
  }

  const resolved = await resolveMediaUrl({
    kind: "image",
    url: input.url,
    storagePath,
    preferFresh: true,
  });
  if (!resolved.url) {
    return {
      ...input,
      storagePath,
    };
  }

  return {
    ...input,
    url: resolved.url,
    storagePath,
    ...(resolved.expiresAt ? { viewUrlExpiresAt: resolved.expiresAt } : {}),
  };
};

const resolveStartImageUrl = async (
  startImage: GenerationParams["startImage"],
): Promise<GenerationParams["startImage"]> => {
  return await resolveRefreshableImageUrl(startImage);
};

const resolveEndImageUrl = async (
  endImage: GenerationParams["endImage"],
): Promise<GenerationParams["endImage"]> => {
  return await resolveRefreshableImageUrl(endImage);
};

const resolveReferenceImageUrl = async (
  referenceImage: NonNullable<GenerationParams["referenceImages"]>[number],
): Promise<NonNullable<GenerationParams["referenceImages"]>[number]> => {
  return await resolveRefreshableImageUrl(referenceImage);
};

const resolveSeedImageUrl = async (
  seedImageUrl: string | null | undefined,
): Promise<string | null> => {
  if (!seedImageUrl || typeof seedImageUrl !== "string")
    return seedImageUrl ?? null;
  const storagePath = extractStorageObjectPath(seedImageUrl);
  if (!storagePath) return seedImageUrl;
  const expiresAtMs = parseGcsSignedUrlExpiryMs(seedImageUrl);
  const needsRefresh = shouldRefreshStartImage(seedImageUrl, expiresAtMs);
  if (!needsRefresh) return seedImageUrl;
  const resolved = await resolveMediaUrl({
    kind: "image",
    url: seedImageUrl,
    storagePath,
    preferFresh: true,
  });
  return resolved.url ?? seedImageUrl;
};

const resolveExtendVideoUrl = async (
  extendVideoUrl: string | null | undefined,
): Promise<string | null> => {
  if (!extendVideoUrl || typeof extendVideoUrl !== "string") {
    return extendVideoUrl ?? null;
  }

  const resolved = await resolveMediaUrl({
    kind: "video",
    url: extendVideoUrl,
    preferFresh: true,
  });

  return resolved.url ?? extendVideoUrl;
};

const syncCreditBalanceFromResponse = (
  remainingCredits?: number | null,
): void => {
  if (
    typeof remainingCredits !== "number" ||
    !Number.isFinite(remainingCredits)
  ) {
    requestCreditBalanceRefresh();
    return;
  }

  publishCreditBalanceSync(remainingCredits);
};

const resolveAcceptedGenerationStatus = (
  status?: string | null,
): Generation["status"] => (status === "processing" ? "generating" : "pending");

/**
 * Build the faceSwap fields for a generation update from a preview/job
 * response. Single source of truth for the draft and render success paths,
 * which previously hand-mirrored this merge.
 */
const buildFaceSwapUpdate = (
  response: {
    faceSwapApplied?: boolean | null | undefined;
    faceSwapUrl?: string | null | undefined;
  },
  generation: Generation,
): Partial<Generation> =>
  response.faceSwapApplied || response.faceSwapUrl
    ? {
        faceSwapApplied: response.faceSwapApplied ?? true,
        faceSwapUrl: response.faceSwapUrl ?? generation.faceSwapUrl ?? null,
      }
    : {};

/**
 * Build the mediaAssetIds field, preferring an explicit asset id over a
 * storage path. Shared by the draft/render accept and finalize paths.
 */
const buildMediaAssetIdsUpdate = (
  videoAssetId: string | null,
  videoStoragePath: string | null,
): Partial<Generation> =>
  videoAssetId
    ? { mediaAssetIds: [extractAssetId(videoAssetId)] }
    : videoStoragePath
      ? { mediaAssetIds: [extractAssetId(videoStoragePath)] }
      : {};

export function useGenerationActions(
  dispatch: React.Dispatch<GenerationsAction>,
  options: UseGenerationActionsOptions = {},
) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inFlightRef = useRef<Map<string, AbortController>>(new Map());
  const isSubmittingRef = useRef(false);
  const generationsRef = useRef<Generation[]>(options.generations ?? []);
  const promptVersionRef = useRef<string | null>(
    options.promptVersionId ?? null,
  );
  // Bug 9 fix: ref for options to avoid callback churn
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const setSubmissionPending = useCallback((pending: boolean) => {
    isSubmittingRef.current = pending;
    setIsSubmitting(pending);
  }, []);

  const clearSubmissionPendingIfNeeded = useCallback(
    (generationAccepted: boolean): void => {
      if (!generationAccepted) {
        setSubmissionPending(false);
      }
    },
    [setSubmissionPending],
  );

  useEffect(() => {
    generationsRef.current = options.generations ?? [];
  }, [options.generations]);

  const markGenerationCancelled = useCallback(
    (id: string, reason: string) => {
      log.info("Generation marked as cancelled", {
        generationId: id,
        reason,
        inFlightCount: inFlightRef.current.size,
      });
      dispatch({
        type: "UPDATE_GENERATION",
        payload: {
          id,
          updates: {
            status: "failed",
            error: reason,
            completedAt: Date.now(),
            jobId: null,
            serverJobStatus: "failed",
          },
        },
      });
      inFlightRef.current.delete(id);
    },
    [dispatch],
  );

  const abortAll = useCallback(() => {
    inFlightRef.current.forEach((controller) => controller.abort());
    inFlightRef.current.clear();
  }, []);

  const abortMismatched = useCallback(
    (nextPromptVersionId: string | null) => {
      const entries = Array.from(inFlightRef.current.entries());
      for (const [id, controller] of entries) {
        const generation = generationsRef.current.find(
          (item) => item.id === id,
        );
        const generationVersionId = generation?.promptVersionId ?? null;
        if (!generation || generationVersionId !== nextPromptVersionId) {
          controller.abort();
          if (
            generation &&
            (generation.status === "generating" ||
              generation.status === "pending")
          ) {
            markGenerationCancelled(id, "Prompt version changed");
          } else {
            inFlightRef.current.delete(id);
          }
        }
      }
    },
    [markGenerationCancelled],
  );

  useEffect(() => {
    const nextPromptVersionId = options.promptVersionId ?? null;
    if (promptVersionRef.current === nextPromptVersionId) return;
    abortMismatched(nextPromptVersionId);
    promptVersionRef.current = nextPromptVersionId;
  }, [abortMismatched, options.promptVersionId]);

  useEffect(() => () => abortAll(), [abortAll]);

  const finalizeGeneration = useCallback(
    (id: string, updates: Partial<Generation>) => {
      dispatch({ type: "UPDATE_GENERATION", payload: { id, updates } });
      inFlightRef.current.delete(id);
    },
    [dispatch],
  );

  // ISSUE-12 follow-up: ADD_GENERATION was retired in favour of
  // SET_GENERATIONS over a known-good set. The helper keeps its name
  // because every call site already reads as "accept this generation into
  // the state" — the underlying dispatch is now a state-replace that
  // appends to the current set, which forces the caller's mental model
  // to stay consistent with the server-authoritative view.
  const acceptGeneration = useCallback(
    (generation: Generation, updates: Partial<Generation> = {}) => {
      const merged: Generation = { ...generation, ...updates };
      const current = optionsRef.current.generations ?? [];
      dispatch({
        type: "SET_GENERATIONS",
        payload: [...current, merged],
      });
    },
    [dispatch],
  );

  const updateGenerationProgress = useCallback(
    (id: string, status: string, progress: number | null) => {
      dispatch({
        type: "UPDATE_GENERATION",
        payload: {
          id,
          updates: {
            status: resolveAcceptedGenerationStatus(status),
            serverProgress: progress,
            serverJobStatus: status as Generation["serverJobStatus"],
          },
        },
      });
    },
    [dispatch],
  );

  const resumeGenerationJob = useCallback(
    (generation: Generation) => {
      const jobId = generation.jobId?.trim();
      if (!jobId) return;
      if (
        generation.status !== "pending" &&
        generation.status !== "generating"
      ) {
        return;
      }
      if (inFlightRef.current.has(generation.id)) {
        return;
      }

      const controller = new AbortController();
      inFlightRef.current.set(generation.id, controller);

      log.info("Resuming persisted video generation job", {
        generationId: generation.id,
        jobId,
        status: generation.status,
        serverJobStatus: generation.serverJobStatus ?? null,
      });

      void waitForVideoJob(jobId, controller.signal, (update) => {
        updateGenerationProgress(generation.id, update.status, update.progress);
      })
        .then((jobResult) => {
          if (controller.signal.aborted || !jobResult?.videoUrl) {
            return;
          }

          finalizeGeneration(generation.id, {
            status: "completed",
            completedAt: Date.now(),
            mediaUrls: [jobResult.videoUrl],
            ...(jobResult.assetId
              ? { mediaAssetIds: [extractAssetId(jobResult.assetId)] }
              : jobResult.storagePath
                ? { mediaAssetIds: [extractAssetId(jobResult.storagePath)] }
                : {}),
            jobId: null,
            serverProgress: 100,
            serverJobStatus: "completed",
            error: null,
          });
        })
        .catch((error) => {
          if (controller.signal.aborted) {
            return;
          }

          const info = sanitizeError(error);
          const errObj =
            error instanceof Error ? error : new Error(info.message);

          log.warn("Persisted video generation job failed after resume", {
            generationId: generation.id,
            jobId,
            error: errObj.message,
            errorName: info.name,
          });

          finalizeGeneration(generation.id, {
            status: "failed",
            completedAt: Date.now(),
            error: errObj.message,
            jobId: null,
            serverJobStatus: "failed",
          });
        });
    },
    [finalizeGeneration, updateGenerationProgress],
  );

  useEffect(() => {
    for (const generation of options.generations ?? []) {
      resumeGenerationJob(generation);
    }
  }, [options.generations, resumeGenerationJob]);

  // Bug 9 fix: read options from ref to avoid callback recreation on every options change
  const generateDraft = useCallback(
    async (model: DraftModel, prompt: string, params: GenerationParams) => {
      if (isSubmittingRef.current) return;
      setSubmissionPending(true);
      const resolved = resolveGenerationOptions(optionsRef.current, params);
      const generation = buildGeneration("draft", model, prompt, resolved);
      const modelConfig = getModelConfig(model);
      const requiredCredits = getModelCreditCost(model, resolved.duration);
      const operationLabel = `${modelConfig?.label ?? "Video"} preview`;
      let generationAccepted = false;
      const startedAt = Date.now();
      const motionMeta = extractMotionMeta(resolved.generationParams);
      const faceSwapMeta = extractFaceSwapMeta(resolved);
      const startImageUrlHost = resolved.startImage?.url
        ? safeUrlHost(resolved.startImage.url)
        : null;
      const requestedEndImage = Boolean(resolved.endImage?.url);
      const requestedReferenceImageCount =
        resolved.referenceImages?.length ?? 0;
      const requestedExtendMode = Boolean(resolved.extendVideoUrl);

      log.info("Draft generation started", {
        generationId: generation.id,
        tier: "draft",
        model,
        promptLength: prompt.trim().length,
        aspectRatio: resolved.aspectRatio ?? null,
        hasStartImage: Boolean(resolved.startImage),
        startImageUrlHost,
        faceSwapApplied: faceSwapMeta.faceSwapApplied,
        faceSwapUrlHost: faceSwapMeta.faceSwapUrl
          ? safeUrlHost(faceSwapMeta.faceSwapUrl)
          : null,
        characterAssetId: faceSwapMeta.characterAssetId,
        requestedEndImage,
        requestedReferenceImageCount,
        requestedExtendMode,
        ...motionMeta,
      });

      const controller = new AbortController();
      inFlightRef.current.set(generation.id, controller);

      try {
        if (model === "flux-kontext") {
          const response = await generateStoryboardPreview(prompt, {
            ...(resolved.aspectRatio
              ? { aspectRatio: resolved.aspectRatio }
              : {}),
            ...readSessionParams(optionsRef.current),
          });
          if (controller.signal.aborted) {
            clearSubmissionPendingIfNeeded(generationAccepted);
            return;
          }
          if (!response.success) {
            const reason =
              response.message || response.error || "Failed to generate frames";
            log.warn("Storyboard draft response invalid", {
              generationId: generation.id,
              success: false,
              hasImageUrls: false,
              error: reason,
              ...motionMeta,
            });
            throw new Error(reason);
          }
          if (!response.data.imageUrls?.length) {
            log.warn("Storyboard draft response invalid", {
              generationId: generation.id,
              success: true,
              hasImageUrls: false,
              error: "Failed to generate frames",
              ...motionMeta,
            });
            throw new Error("Failed to generate frames");
          }
          const urls = response.data.imageUrls;
          const storagePaths = response.data.storagePaths;
          const serverGenerationId = response.data.generationId;
          const durationMs = Date.now() - startedAt;

          log.info("Storyboard draft generation succeeded", {
            generationId: generation.id,
            durationMs,
            framesCount: urls.length,
            serverPersisted: Boolean(serverGenerationId),
            ...motionMeta,
          });
          generationAccepted = true;
          // When the server persisted, adopt the server-assigned id so a
          // subsequent session refetch is an id-matched no-op rather than
          // a clobbering duplicate.
          acceptGeneration(
            serverGenerationId
              ? { ...generation, id: serverGenerationId }
              : generation,
            {
              status: "completed",
              completedAt: Date.now(),
              mediaUrls: urls,
              ...(storagePaths?.length
                ? { mediaAssetIds: toAssetIds(storagePaths) }
                : {}),
              thumbnailUrl: response.data.baseImageUrl || urls[0] || null,
            },
          );
          // C7 fix: storyboard previews charge credits server-side, so the
          // client must refresh the balance badge or it stays stale until
          // the next bigger transaction. Mirrors the same call on the
          // draft-render and full-render success paths.
          syncCreditBalanceFromResponse(response.remainingCredits);
          inFlightRef.current.delete(generation.id);
          setSubmissionPending(false);
          return;
        }

        let promptForCompilation = prompt.trim();
        let resolvedCharacterAssetId =
          resolved.characterAssetId?.trim() || null;

        if (hasPromptTriggers(promptForCompilation)) {
          try {
            const resolvedPrompt = await assetApi.resolve(promptForCompilation);
            const expandedPrompt = resolvedPrompt.expandedText.trim();
            if (expandedPrompt.length > 0) {
              promptForCompilation = expandedPrompt;
            }
            if (!resolvedCharacterAssetId) {
              resolvedCharacterAssetId =
                resolvedPrompt.characters[0]?.id ?? null;
            }
          } catch (error) {
            const info = sanitizeError(error);
            log.warn(
              "Prompt trigger resolution failed; falling back to raw prompt",
              {
                generationId: generation.id,
                error: info.message,
                errorName: info.name,
              },
            );
          }
        }
        if (controller.signal.aborted) {
          clearSubmissionPendingIfNeeded(generationAccepted);
          return;
        }

        let wanPrompt = promptForCompilation;
        try {
          wanPrompt = await compileWanPrompt(
            promptForCompilation,
            controller.signal,
          );
        } catch (error) {
          const info = sanitizeError(error);
          log.warn("WAN prompt compilation failed; using raw prompt", {
            generationId: generation.id,
            error: info.message,
            errorName: info.name,
          });
          wanPrompt = promptForCompilation;
        }
        if (controller.signal.aborted) {
          clearSubmissionPendingIfNeeded(generationAccepted);
          return;
        }
        const motionPromptInjected = false;

        const videoInputSupport = await getVideoInputSupport(model);
        if (controller.signal.aborted) {
          clearSubmissionPendingIfNeeded(generationAccepted);
          return;
        }

        const requestedEndImageInput = resolved.endImage ?? null;
        const requestedReferenceInputs = resolved.referenceImages ?? [];
        const requestedExtendVideoUrl = resolved.extendVideoUrl ?? null;

        const allowedEndImageInput = videoInputSupport.supportsEndFrame
          ? requestedEndImageInput
          : null;
        const allowedReferenceInputs = videoInputSupport.supportsReferenceImages
          ? requestedReferenceInputs
          : [];
        const allowedExtendVideoUrl = videoInputSupport.supportsExtendVideo
          ? requestedExtendVideoUrl
          : null;

        const resolvedStartImage = resolved.startImage
          ? await resolveStartImageUrl(resolved.startImage)
          : null;
        const resolvedEndImage = allowedEndImageInput
          ? await resolveEndImageUrl(allowedEndImageInput)
          : null;
        const resolvedReferenceImages = allowedReferenceInputs.length
          ? await Promise.all(
              allowedReferenceInputs.map((referenceImage) =>
                resolveReferenceImageUrl(referenceImage),
              ),
            )
          : [];
        const resolvedExtendVideoUrl = allowedExtendVideoUrl
          ? await resolveExtendVideoUrl(allowedExtendVideoUrl)
          : null;
        if (controller.signal.aborted) {
          clearSubmissionPendingIfNeeded(generationAccepted);
          return;
        }
        const requestStartImageUrlHost = resolvedStartImage?.url
          ? safeUrlHost(resolvedStartImage.url)
          : startImageUrlHost;
        const requestEndImageUrlHost = resolvedEndImage?.url
          ? safeUrlHost(resolvedEndImage.url)
          : null;
        const requestExtendVideoUrlHost = resolvedExtendVideoUrl
          ? safeUrlHost(resolvedExtendVideoUrl)
          : null;

        log.info("Video draft request dispatched", {
          generationId: generation.id,
          model,
          promptLength: wanPrompt.length,
          aspectRatio: resolved.aspectRatio ?? null,
          hasStartImage: Boolean(resolvedStartImage?.url),
          startImageUrlHost: requestStartImageUrlHost,
          motionPromptInjected,
          faceSwapApplied: faceSwapMeta.faceSwapApplied,
          faceSwapUrlHost: faceSwapMeta.faceSwapUrl
            ? safeUrlHost(faceSwapMeta.faceSwapUrl)
            : null,
          characterAssetId: resolvedCharacterAssetId,
          requestedEndImage,
          requestedReferenceImageCount,
          requestedExtendMode,
          dispatchedEndImage: Boolean(resolvedEndImage?.url),
          dispatchedReferenceImageCount: resolvedReferenceImages.length,
          dispatchedExtendMode: Boolean(resolvedExtendVideoUrl),
          endImageUrlHost: requestEndImageUrlHost,
          extendVideoUrlHost: requestExtendVideoUrlHost,
          ...motionMeta,
        });
        const response = await generateVideoPreview(
          wanPrompt,
          resolved.aspectRatio ?? undefined,
          model,
          {
            ...(resolvedStartImage?.url
              ? { startImage: resolvedStartImage.url }
              : {}),
            ...(resolvedStartImage?.generationId
              ? { sourceGenerationId: resolvedStartImage.generationId }
              : {}),
            ...(resolvedEndImage?.url
              ? { endImage: resolvedEndImage.url }
              : {}),
            ...(resolvedReferenceImages.length
              ? {
                  referenceImages: resolvedReferenceImages.map(
                    (referenceImage) => ({
                      url: referenceImage.url,
                      type: referenceImage.type,
                    }),
                  ),
                }
              : {}),
            ...(resolvedExtendVideoUrl
              ? { extendVideoUrl: resolvedExtendVideoUrl }
              : {}),
            ...(resolved.generationParams
              ? { generationParams: resolved.generationParams }
              : {}),
            ...(resolvedCharacterAssetId
              ? { characterAssetId: resolvedCharacterAssetId }
              : {}),
            ...(resolved.faceSwapAlreadyApplied
              ? { faceSwapAlreadyApplied: true }
              : {}),
            ...readSessionParams(optionsRef.current),
          },
        );
        if (controller.signal.aborted) {
          clearSubmissionPendingIfNeeded(generationAccepted);
          return;
        }

        log.info("Video draft response received", {
          generationId: generation.id,
          success: response.success,
          hasVideoUrl: Boolean(response.videoUrl),
          hasJobId: Boolean(response.jobId),
          jobId: response.jobId ?? null,
          faceSwapApplied: response.faceSwapApplied ?? false,
          faceSwapUrlHost: response.faceSwapUrl
            ? safeUrlHost(response.faceSwapUrl)
            : null,
          ...motionMeta,
        });
        syncCreditBalanceFromResponse(response.remainingCredits);
        let videoUrl: string | null = null;
        let videoStoragePath: string | null = response.storagePath ?? null;
        let videoAssetId: string | null = response.assetId ?? null;
        if (response.success && response.videoUrl) {
          generationAccepted = true;
          acceptGeneration(generation, {
            status: "completed",
            completedAt: Date.now(),
            mediaUrls: [response.videoUrl],
            ...buildFaceSwapUpdate(response, generation),
            ...buildMediaAssetIdsUpdate(videoAssetId, videoStoragePath),
          });
          inFlightRef.current.delete(generation.id);
          setSubmissionPending(false);
          videoUrl = response.videoUrl;
        } else if (response.success && response.jobId) {
          generationAccepted = true;
          acceptGeneration(generation, {
            status: resolveAcceptedGenerationStatus(response.status),
            jobId: response.jobId,
            ...(response.status ? { serverJobStatus: response.status } : {}),
            ...buildFaceSwapUpdate(response, generation),
          });
          setSubmissionPending(false);
          log.debug("Waiting for video draft job to complete", {
            generationId: generation.id,
            jobId: response.jobId,
          });
          const jobResult = await waitForVideoJob(
            response.jobId,
            controller.signal,
            (update) => {
              dispatch({
                type: "UPDATE_GENERATION",
                payload: {
                  id: generation.id,
                  updates: {
                    status: resolveAcceptedGenerationStatus(update.status),
                    jobId: response.jobId,
                    serverProgress: update.progress,
                    serverJobStatus: update.status,
                  },
                },
              });
            },
          );
          videoUrl = jobResult?.videoUrl ?? null;
          videoStoragePath = jobResult?.storagePath ?? videoStoragePath;
          videoAssetId = jobResult?.assetId ?? videoAssetId;
          log.debug("Video draft job completed", {
            generationId: generation.id,
            jobId: response.jobId,
            hasVideoUrl: Boolean(videoUrl),
          });
        }

        if (controller.signal.aborted) {
          clearSubmissionPendingIfNeeded(generationAccepted);
          return;
        }
        if (!generationAccepted) {
          setSubmissionPending(false);
        }
        if (!videoUrl) {
          log.warn("Video draft completed without a video URL", {
            generationId: generation.id,
            jobId: response.jobId ?? null,
            error:
              response.error || response.message || "Failed to generate video",
            ...motionMeta,
          });
          throw new Error(
            response.error || response.message || "Failed to generate video",
          );
        }
        const durationMs = Date.now() - startedAt;
        log.info("Video draft generation succeeded", {
          generationId: generation.id,
          durationMs,
          faceSwapApplied:
            response?.faceSwapApplied ?? faceSwapMeta.faceSwapApplied,
          ...motionMeta,
        });
        if (response.jobId) {
          finalizeGeneration(generation.id, {
            status: "completed",
            completedAt: Date.now(),
            mediaUrls: [videoUrl],
            jobId: null,
            serverProgress: 100,
            serverJobStatus: "completed",
            ...buildMediaAssetIdsUpdate(videoAssetId, videoStoragePath),
          });
        }
      } catch (error) {
        if (controller.signal.aborted) {
          clearSubmissionPendingIfNeeded(generationAccepted);
          return;
        }
        if (isInsufficientCreditsError(error)) {
          inFlightRef.current.delete(generation.id);
          if (generationAccepted) {
            finalizeGeneration(generation.id, {
              status: "failed",
              completedAt: Date.now(),
              error: `Insufficient credits — ${operationLabel} requires ${requiredCredits} credits`,
            });
          } else {
            setSubmissionPending(false);
          }
          optionsRef.current.onInsufficientCredits?.(
            requiredCredits,
            operationLabel,
          );
          return;
        }
        const durationMs = Date.now() - startedAt;
        const info = sanitizeError(error);
        const errObj = error instanceof Error ? error : new Error(info.message);

        log.error("Draft generation failed", errObj, {
          generationId: generation.id,
          model,
          durationMs,
          errorName: info.name,
          ...motionMeta,
        });
        if (generationAccepted) {
          finalizeGeneration(generation.id, {
            status: "failed",
            completedAt: Date.now(),
            error: errObj.message,
            jobId: null,
            serverJobStatus: "failed",
          });
        } else {
          acceptGeneration(generation, {
            status: "failed",
            completedAt: Date.now(),
            error: errObj.message,
          });
          inFlightRef.current.delete(generation.id);
          setSubmissionPending(false);
        }
      }
    },
    [
      acceptGeneration,
      clearSubmissionPendingIfNeeded,
      dispatch,
      finalizeGeneration,
      setSubmissionPending,
    ],
  );

  const generateStoryboard = useCallback(
    async (prompt: string, params: StoryboardParams) => {
      if (isSubmittingRef.current) return;
      setSubmissionPending(true);
      const { seedImageUrl, ...baseParams } = params;
      const resolved = resolveGenerationOptions(optionsRef.current, baseParams);
      const generation = buildGeneration(
        "draft",
        "flux-kontext",
        prompt,
        resolved,
      );
      const modelConfig = getModelConfig("flux-kontext");
      const requiredCredits = modelConfig?.credits ?? 4;
      const operationLabel = "Storyboard";
      let generationAccepted = false;
      const startedAt = Date.now();
      const motionMeta = extractMotionMeta(resolved.generationParams);

      log.info("Storyboard generation started", {
        generationId: generation.id,
        tier: "draft",
        model: "flux-kontext",
        promptLength: prompt.trim().length,
        aspectRatio: resolved.aspectRatio ?? null,
        hasSeedImageUrl: Boolean(seedImageUrl),
        ...motionMeta,
      });

      const controller = new AbortController();
      inFlightRef.current.set(generation.id, controller);

      try {
        const resolvedSeedImageUrl = await resolveSeedImageUrl(
          seedImageUrl ?? null,
        );
        // Prefer the freshly-created promptVersionId passed in params over
        // the stale options snapshot. `onCreateVersionIfNeeded()` in
        // executeStoryboardAction builds a new version ID and sets React
        // state, but optionsRef.current still holds the previous render's
        // value until the next React commit — so without this override the
        // server sees an empty promptVersionId and skips attaching the
        // generation to the session.
        const sessionParams = readSessionParams(optionsRef.current);
        const response = await generateStoryboardPreview(prompt, {
          ...(resolved.aspectRatio
            ? { aspectRatio: resolved.aspectRatio }
            : {}),
          ...(resolvedSeedImageUrl
            ? { seedImageUrl: resolvedSeedImageUrl }
            : {}),
          ...sessionParams,
          ...(params.promptVersionId
            ? { promptVersionId: params.promptVersionId }
            : {}),
        });
        if (controller.signal.aborted) {
          clearSubmissionPendingIfNeeded(generationAccepted);
          return;
        }
        if (!response.success) {
          const reason =
            response.message ||
            response.error ||
            "Failed to generate storyboard";
          log.warn("Storyboard generation response invalid", {
            generationId: generation.id,
            success: false,
            hasImageUrls: false,
            error: reason,
            ...motionMeta,
          });
          throw new Error(reason);
        }
        if (!response.data.imageUrls?.length) {
          log.warn("Storyboard generation response invalid", {
            generationId: generation.id,
            success: true,
            hasImageUrls: false,
            error: "Failed to generate storyboard",
            ...motionMeta,
          });
          throw new Error("Failed to generate storyboard");
        }
        const urls = response.data.imageUrls;
        const storagePaths = response.data.storagePaths;
        const serverGenerationId = response.data.generationId;
        const durationMs = Date.now() - startedAt;
        log.info("Storyboard generation succeeded", {
          generationId: generation.id,
          durationMs,
          framesCount: urls.length,
          serverPersisted: Boolean(serverGenerationId),
          ...motionMeta,
        });

        generationAccepted = true;
        // When the server persisted, adopt the server-assigned id so a
        // subsequent session refetch is an id-matched no-op rather than a
        // clobbering duplicate. When the server didn't persist (legacy or
        // soft-fail path), keep the client-minted id; syncVersionGenerations
        // mirrors it upward eventually.
        acceptGeneration(
          serverGenerationId
            ? { ...generation, id: serverGenerationId }
            : generation,
          {
            status: "completed",
            completedAt: Date.now(),
            mediaUrls: urls,
            ...(storagePaths?.length
              ? { mediaAssetIds: toAssetIds(storagePaths) }
              : {}),
            thumbnailUrl: response.data.baseImageUrl || urls[0] || null,
          },
        );

        // ISSUE-12 UX polish: tell the caller the server has persisted the
        // generation so it can re-fetch the session and hydrate the gallery
        // without requiring a page reload. Only fire when the server
        // actually attached (generationId present) AND we have a session
        // to refetch.
        const sessionIdForCallback =
          sessionParams.sessionId ?? optionsRef.current.sessionId;
        if (serverGenerationId && sessionIdForCallback) {
          optionsRef.current.onServerGenerationPersisted?.({
            sessionId: sessionIdForCallback,
            generationId: serverGenerationId,
          });
        }
        // C7 fix: storyboard previews charge credits server-side, so the
        // client must refresh the balance badge or it stays stale until
        // the next bigger transaction. Mirrors the same call on the
        // draft-render and full-render success paths.
        syncCreditBalanceFromResponse(response.remainingCredits);
        inFlightRef.current.delete(generation.id);
        setSubmissionPending(false);
      } catch (error) {
        if (controller.signal.aborted) {
          clearSubmissionPendingIfNeeded(generationAccepted);
          return;
        }
        if (isInsufficientCreditsError(error)) {
          inFlightRef.current.delete(generation.id);
          if (generationAccepted) {
            finalizeGeneration(generation.id, {
              status: "failed",
              completedAt: Date.now(),
              error: `Insufficient credits — ${operationLabel} requires ${requiredCredits} credits`,
            });
          } else {
            setSubmissionPending(false);
          }
          optionsRef.current.onInsufficientCredits?.(
            requiredCredits,
            operationLabel,
          );
          return;
        }
        const durationMs = Date.now() - startedAt;
        const info = sanitizeError(error);
        const errObj = error instanceof Error ? error : new Error(info.message);

        log.error("Storyboard generation failed", errObj, {
          generationId: generation.id,
          durationMs,
          errorName: info.name,
          ...motionMeta,
        });
        if (generationAccepted) {
          finalizeGeneration(generation.id, {
            status: "failed",
            completedAt: Date.now(),
            error: errObj.message,
          });
        } else {
          acceptGeneration(generation, {
            status: "failed",
            completedAt: Date.now(),
            error: errObj.message,
          });
          inFlightRef.current.delete(generation.id);
          setSubmissionPending(false);
        }
      }
    },
    [
      acceptGeneration,
      clearSubmissionPendingIfNeeded,
      finalizeGeneration,
      setSubmissionPending,
    ],
  );

  const generateRender = useCallback(
    async (model: string, prompt: string, params: GenerationParams) => {
      if (isSubmittingRef.current) return;
      setSubmissionPending(true);
      const resolved = resolveGenerationOptions(optionsRef.current, params);
      const generation = buildGeneration("render", model, prompt, resolved);
      const modelConfig = getModelConfig(model);
      const requiredCredits = getModelCreditCost(model, resolved.duration);
      const operationLabel = `${modelConfig?.label ?? "Video"} render`;
      let generationAccepted = false;
      const startedAt = Date.now();
      const motionMeta = extractMotionMeta(resolved.generationParams);
      const faceSwapMeta = extractFaceSwapMeta(resolved);
      const isCharacterAsset =
        resolved.startImage?.source === "asset" &&
        Boolean(resolved.startImage?.assetId);
      const startImageUrlHost =
        !isCharacterAsset && resolved.startImage?.url
          ? safeUrlHost(resolved.startImage.url)
          : null;
      const requestedEndImage = Boolean(resolved.endImage?.url);
      const requestedReferenceImageCount =
        resolved.referenceImages?.length ?? 0;
      const requestedExtendMode = Boolean(resolved.extendVideoUrl);

      log.info("Render generation started", {
        generationId: generation.id,
        tier: "render",
        model,
        promptLength: prompt.trim().length,
        aspectRatio: resolved.aspectRatio ?? null,
        hasStartImage: Boolean(resolved.startImage),
        isCharacterAsset,
        startImageUrlHost,
        characterAssetId: isCharacterAsset
          ? (resolved.startImage?.assetId ?? null)
          : null,
        faceSwapApplied: faceSwapMeta.faceSwapApplied,
        faceSwapUrlHost: faceSwapMeta.faceSwapUrl
          ? safeUrlHost(faceSwapMeta.faceSwapUrl)
          : null,
        characterAssetIdOverride: faceSwapMeta.characterAssetId,
        requestedEndImage,
        requestedReferenceImageCount,
        requestedExtendMode,
        ...motionMeta,
      });

      const controller = new AbortController();
      inFlightRef.current.set(generation.id, controller);

      try {
        const videoInputSupport = await getVideoInputSupport(model);
        if (controller.signal.aborted) {
          clearSubmissionPendingIfNeeded(generationAccepted);
          return;
        }

        const requestedEndImageInput = resolved.endImage ?? null;
        const requestedReferenceInputs = resolved.referenceImages ?? [];
        const requestedExtendVideoUrl = resolved.extendVideoUrl ?? null;

        const allowedEndImageInput = videoInputSupport.supportsEndFrame
          ? requestedEndImageInput
          : null;
        const allowedReferenceInputs = videoInputSupport.supportsReferenceImages
          ? requestedReferenceInputs
          : [];
        const allowedExtendVideoUrl = videoInputSupport.supportsExtendVideo
          ? requestedExtendVideoUrl
          : null;

        const resolvedStartImage = !isCharacterAsset
          ? await resolveStartImageUrl(resolved.startImage ?? null)
          : (resolved.startImage ?? null);
        const resolvedEndImage = allowedEndImageInput
          ? await resolveEndImageUrl(allowedEndImageInput)
          : null;
        const resolvedReferenceImages = allowedReferenceInputs.length
          ? await Promise.all(
              allowedReferenceInputs.map((referenceImage) =>
                resolveReferenceImageUrl(referenceImage),
              ),
            )
          : [];
        const resolvedExtendVideoUrl = allowedExtendVideoUrl
          ? await resolveExtendVideoUrl(allowedExtendVideoUrl)
          : null;
        if (controller.signal.aborted) {
          clearSubmissionPendingIfNeeded(generationAccepted);
          return;
        }
        const requestStartImageUrlHost =
          !isCharacterAsset && resolvedStartImage?.url
            ? safeUrlHost(resolvedStartImage.url)
            : startImageUrlHost;
        const requestEndImageUrlHost = resolvedEndImage?.url
          ? safeUrlHost(resolvedEndImage.url)
          : null;
        const requestExtendVideoUrlHost = resolvedExtendVideoUrl
          ? safeUrlHost(resolvedExtendVideoUrl)
          : null;

        log.info("Render request dispatched", {
          generationId: generation.id,
          model,
          aspectRatio: resolved.aspectRatio ?? null,
          isCharacterAsset,
          startImageUrlHost: requestStartImageUrlHost,
          faceSwapApplied: faceSwapMeta.faceSwapApplied,
          faceSwapUrlHost: faceSwapMeta.faceSwapUrl
            ? safeUrlHost(faceSwapMeta.faceSwapUrl)
            : null,
          characterAssetId: faceSwapMeta.characterAssetId,
          requestedEndImage,
          requestedReferenceImageCount,
          requestedExtendMode,
          dispatchedEndImage: Boolean(resolvedEndImage?.url),
          dispatchedReferenceImageCount: resolvedReferenceImages.length,
          dispatchedExtendMode: Boolean(resolvedExtendVideoUrl),
          endImageUrlHost: requestEndImageUrlHost,
          extendVideoUrlHost: requestExtendVideoUrlHost,
          ...motionMeta,
        });
        const response = await generateVideoPreview(
          prompt,
          resolved.aspectRatio ?? undefined,
          model,
          {
            ...(!isCharacterAsset && resolvedStartImage?.url
              ? { startImage: resolvedStartImage.url }
              : {}),
            ...(!isCharacterAsset && resolvedStartImage?.generationId
              ? { sourceGenerationId: resolvedStartImage.generationId }
              : {}),
            ...(resolvedEndImage?.url
              ? { endImage: resolvedEndImage.url }
              : {}),
            ...(resolvedReferenceImages.length
              ? {
                  referenceImages: resolvedReferenceImages.map(
                    (referenceImage) => ({
                      url: referenceImage.url,
                      type: referenceImage.type,
                    }),
                  ),
                }
              : {}),
            ...(resolvedExtendVideoUrl
              ? { extendVideoUrl: resolvedExtendVideoUrl }
              : {}),
            ...(isCharacterAsset
              ? { characterAssetId: resolved.startImage?.assetId }
              : {}),
            ...(!isCharacterAsset && resolved.characterAssetId
              ? { characterAssetId: resolved.characterAssetId }
              : {}),
            ...(resolved.generationParams
              ? { generationParams: resolved.generationParams }
              : {}),
            ...(resolved.faceSwapAlreadyApplied
              ? { faceSwapAlreadyApplied: true }
              : {}),
            ...readSessionParams(optionsRef.current),
          },
        );
        if (controller.signal.aborted) {
          clearSubmissionPendingIfNeeded(generationAccepted);
          return;
        }

        log.info("Render response received", {
          generationId: generation.id,
          success: response.success,
          hasVideoUrl: Boolean(response.videoUrl),
          hasJobId: Boolean(response.jobId),
          jobId: response.jobId ?? null,
          faceSwapApplied: response.faceSwapApplied ?? false,
          faceSwapUrlHost: response.faceSwapUrl
            ? safeUrlHost(response.faceSwapUrl)
            : null,
          ...motionMeta,
        });
        syncCreditBalanceFromResponse(response.remainingCredits);
        let videoUrl: string | null = null;
        let videoStoragePath: string | null = response.storagePath ?? null;
        let videoAssetId: string | null = response.assetId ?? null;
        if (response.success && response.videoUrl) {
          generationAccepted = true;
          acceptGeneration(generation, {
            status: "completed",
            completedAt: Date.now(),
            mediaUrls: [response.videoUrl],
            ...buildFaceSwapUpdate(response, generation),
            ...buildMediaAssetIdsUpdate(videoAssetId, videoStoragePath),
          });
          inFlightRef.current.delete(generation.id);
          setSubmissionPending(false);
          videoUrl = response.videoUrl;
        } else if (response.success && response.jobId) {
          generationAccepted = true;
          acceptGeneration(generation, {
            status: resolveAcceptedGenerationStatus(response.status),
            jobId: response.jobId,
            ...(response.status ? { serverJobStatus: response.status } : {}),
            ...buildFaceSwapUpdate(response, generation),
          });
          setSubmissionPending(false);
          log.debug("Waiting for render job to complete", {
            generationId: generation.id,
            jobId: response.jobId,
          });
          const jobResult = await waitForVideoJob(
            response.jobId,
            controller.signal,
            (update) => {
              dispatch({
                type: "UPDATE_GENERATION",
                payload: {
                  id: generation.id,
                  updates: {
                    status: resolveAcceptedGenerationStatus(update.status),
                    jobId: response.jobId,
                    serverProgress: update.progress,
                    serverJobStatus: update.status,
                  },
                },
              });
            },
          );
          videoUrl = jobResult?.videoUrl ?? null;
          videoStoragePath = jobResult?.storagePath ?? videoStoragePath;
          videoAssetId = jobResult?.assetId ?? videoAssetId;
          log.debug("Render job completed", {
            generationId: generation.id,
            jobId: response.jobId,
            hasVideoUrl: Boolean(videoUrl),
          });
        }

        if (controller.signal.aborted) {
          clearSubmissionPendingIfNeeded(generationAccepted);
          return;
        }
        if (!generationAccepted) {
          setSubmissionPending(false);
        }
        if (!videoUrl) {
          log.warn("Render completed without a video URL", {
            generationId: generation.id,
            jobId: response.jobId ?? null,
            error:
              response.error || response.message || "Failed to render video",
            ...motionMeta,
          });
          throw new Error(
            response.error || response.message || "Failed to render video",
          );
        }
        const durationMs = Date.now() - startedAt;
        log.info("Render generation succeeded", {
          generationId: generation.id,
          durationMs,
          faceSwapApplied:
            response?.faceSwapApplied ?? faceSwapMeta.faceSwapApplied,
          ...motionMeta,
        });
        if (response.jobId) {
          finalizeGeneration(generation.id, {
            status: "completed",
            completedAt: Date.now(),
            mediaUrls: [videoUrl],
            jobId: null,
            serverProgress: 100,
            serverJobStatus: "completed",
            ...buildMediaAssetIdsUpdate(videoAssetId, videoStoragePath),
          });
        }
      } catch (error) {
        if (controller.signal.aborted) {
          clearSubmissionPendingIfNeeded(generationAccepted);
          return;
        }
        if (isInsufficientCreditsError(error)) {
          inFlightRef.current.delete(generation.id);
          if (generationAccepted) {
            finalizeGeneration(generation.id, {
              status: "failed",
              completedAt: Date.now(),
              error: `Insufficient credits — ${operationLabel} requires ${requiredCredits} credits`,
            });
          } else {
            setSubmissionPending(false);
          }
          optionsRef.current.onInsufficientCredits?.(
            requiredCredits,
            operationLabel,
          );
          return;
        }
        const durationMs = Date.now() - startedAt;
        const info = sanitizeError(error);
        const errObj = error instanceof Error ? error : new Error(info.message);

        log.error("Render generation failed", errObj, {
          generationId: generation.id,
          durationMs,
          errorName: info.name,
          ...motionMeta,
        });
        if (generationAccepted) {
          finalizeGeneration(generation.id, {
            status: "failed",
            completedAt: Date.now(),
            error: errObj.message,
            jobId: null,
            serverJobStatus: "failed",
          });
        } else {
          acceptGeneration(generation, {
            status: "failed",
            completedAt: Date.now(),
            error: errObj.message,
          });
          inFlightRef.current.delete(generation.id);
          setSubmissionPending(false);
        }
      }
    },
    [
      acceptGeneration,
      clearSubmissionPendingIfNeeded,
      dispatch,
      finalizeGeneration,
      setSubmissionPending,
    ],
  );

  const cancelGeneration = useCallback(
    (id: string) => {
      const controller = inFlightRef.current.get(id);
      log.info("Cancel generation requested", {
        generationId: id,
        hasController: Boolean(controller),
      });
      if (controller) controller.abort();
      markGenerationCancelled(id, "Cancelled");
    },
    [markGenerationCancelled],
  );

  const retryGeneration = useCallback(
    (id: string) => {
      const generation = generationsRef.current.find((item) => item.id === id);
      if (!generation) return;
      const opts = optionsRef.current;
      const motionMeta = extractMotionMeta(opts.generationParams);
      log.info("Retry generation requested", {
        generationId: id,
        tier: generation.tier,
        model: generation.model,
        promptLength: generation.prompt.trim().length,
        ...motionMeta,
      });
      const params: GenerationParams = {
        promptVersionId:
          generation.promptVersionId ?? opts.promptVersionId ?? null,
        aspectRatio: generation.aspectRatio ?? opts.aspectRatio ?? null,
        duration: generation.duration ?? opts.duration ?? null,
        fps: generation.fps ?? opts.fps ?? null,
        generationParams: opts.generationParams,
      };
      if (generation.tier === "draft") {
        generateDraft(
          generation.model as DraftModel,
          generation.prompt,
          params,
        );
        return;
      }
      generateRender(generation.model, generation.prompt, params);
    },
    [generateDraft, generateRender],
  );

  return {
    generateDraft,
    generateRender,
    generateStoryboard,
    isSubmitting,
    cancelGeneration,
    retryGeneration,
  };
}
