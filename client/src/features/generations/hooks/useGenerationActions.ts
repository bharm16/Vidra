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

  /**
   * Take ownership of one submission's lifecycle: its abort controller, the id
   * the take is currently known by, and the cleanup that must happen on every
   * exit.
   *
   * `release` belongs in a `finally`, which is the whole point. Each generate*
   * callback below has roughly eight exits, and each one previously had to
   * remember to deregister the controller and hand back the pending flag
   * itself. Miss one and the controller leaks — so cancel and prompt-version
   * aborts stop finding the take — while the submit button keeps spinning.
   *
   * The id lives in here rather than beside the caller's `takeId` on purpose:
   * cleanup has to deregister whatever the take is called *now*, and adoption
   * happens mid-flight. `adoptServerId` is the only way to re-key, so the two
   * cannot drift apart.
   */
  const registerSubmission = useCallback(
    (initialId: string, controller: AbortController) => {
      let currentId = initialId;
      // The pending flag is exclusive while held: the isSubmittingRef guard
      // blocks a second submission until this one hands it back.
      let ownsPendingFlag = true;
      inFlightRef.current.set(currentId, controller);
      return {
        /**
         * Take on the id the server persisted this take under, replacing the
         * optimistic local one (CONTEXT.md → Take identity).
         *
         * A take is known by one id, and it is the server's: a session refetch
         * has to match the take already on screen rather than land a second copy
         * of it. The picture paths do this inline with the id their response
         * returns; a clip's server id is its job id, which is what
         * `processVideoJob` writes the generation record under.
         *
         * Called before the take enters state, so only the in-flight controller
         * — registered under the local id so the request could be cancelled —
         * needs re-keying. Miss that and cancel/abort silently stop finding the
         * take.
         */
        adoptServerId: (serverId: string | null | undefined): string => {
          if (!serverId || serverId === currentId) return currentId;
          const registered = inFlightRef.current.get(currentId);
          if (registered) {
            inFlightRef.current.delete(currentId);
            inFlightRef.current.set(serverId, registered);
          }
          currentId = serverId;
          return currentId;
        },
        /**
         * Hand the pending flag back, which a take does the moment it is
         * accepted: from then on its own status drives the UI, and the next
         * submission is free to start. Idempotent.
         */
        releasePendingFlag: (): void => {
          if (!ownsPendingFlag) return;
          ownsPendingFlag = false;
          setSubmissionPending(false);
        },
        /**
         * Deregister the controller and, if this submission still holds the
         * pending flag, release it.
         *
         * Ownership is what makes this safe to call on every exit. Clearing the
         * flag unconditionally would stomp a *later* submission that started
         * after this take was accepted; keying off `generationAccepted` instead
         * — the previous shape — silently skipped the release when a throw
         * landed between acceptance and the handoff, and the flag stuck true for
         * the rest of the session with the generate buttons disabled.
         *
         * Deregistration is unconditional, a deliberate superset of what the
         * individual exits did: abort paths used to return with the controller
         * still registered. Nothing depended on that — `abortAll`,
         * `abortMismatched` and `markGenerationCancelled` all remove it — and
         * `resumeGenerationJob` reads the same map to decide whether a job is
         * already being watched.
         */
        release: (): void => {
          inFlightRef.current.delete(currentId);
          if (ownsPendingFlag) {
            ownsPendingFlag = false;
            setSubmissionPending(false);
          }
        },
      };
    },
    [setSubmissionPending],
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
            // The i2v start frame is the clip's poster — without it the
            // space tile and Library card have no still to show.
            ...(jobResult.startImageUrl && !generation.thumbnailUrl
              ? { thumbnailUrl: jobResult.startImageUrl }
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
  /**
   * End a failed run.
   *
   * The three run paths — draft, storyboard, render — had a byte-identical
   * copy of this block, differing only in the log line. That is where the
   * pending-flag wedge of 6840ffa7 lived, and a fix to it had to be applied
   * three times or land in two of three places. The rules stated once:
   *
   * - An aborted run reports nothing: the caller asked for it to stop.
   * - Insufficient credits is not a failure of the take. If the take was
   *   already accepted it is marked failed with the credit message; otherwise
   *   it never entered state and only the pending flag is handed back. Either
   *   way the caller's credit handler is invited to surface the gate.
   * - Otherwise the take is marked failed if it exists, or accepted as failed
   *   if it does not, so a failure is always visible as a take rather than as
   *   nothing happening.
   *
   * `submission.release()` is NOT called here — it belongs in the caller's
   * `finally`, which runs on the success path too.
   */
  const failGenerationRun = useCallback(
    (
      error: unknown,
      run: {
        runLabel: "Draft" | "Storyboard" | "Render";
        model: string;
        generation: Generation;
        /** The id the take is known by right now — server-adopted if it got that far. */
        takeId: string;
        /** Whether the take already entered state. */
        accepted: boolean;
        controller: AbortController;
        submission: { releasePendingFlag: () => void };
        operationLabel: string;
        requiredCredits: number;
        startedAt: number;
        motionMeta: Record<string, unknown>;
        /** A job-backed run clears its job fields when it fails; storyboards have no job. */
        jobBacked: boolean;
      },
    ): void => {
      if (run.controller.signal.aborted) return;

      if (isInsufficientCreditsError(error)) {
        if (run.accepted) {
          finalizeGeneration(run.takeId, {
            status: "failed",
            completedAt: Date.now(),
            error: `Insufficient credits — ${run.operationLabel} requires ${run.requiredCredits} credits`,
          });
        } else {
          run.submission.releasePendingFlag();
        }
        optionsRef.current.onInsufficientCredits?.(
          run.requiredCredits,
          run.operationLabel,
        );
        return;
      }

      const info = sanitizeError(error);
      const errObj = error instanceof Error ? error : new Error(info.message);

      log.error(`${run.runLabel} generation failed`, errObj, {
        generationId: run.takeId,
        model: run.model,
        durationMs: Date.now() - run.startedAt,
        errorName: info.name,
        ...run.motionMeta,
      });

      const failure: Partial<Generation> = {
        status: "failed",
        completedAt: Date.now(),
        error: errObj.message,
      };

      if (run.accepted) {
        finalizeGeneration(run.takeId, {
          ...failure,
          ...(run.jobBacked ? { jobId: null, serverJobStatus: "failed" } : {}),
        });
        return;
      }
      acceptGeneration({ ...run.generation, id: run.takeId }, failure);
      run.submission.releasePendingFlag();
    },
    [acceptGeneration, finalizeGeneration],
  );

  /**
   * The one video run. Draft and render were two ~400-line copies of this
   * pipeline — input-support gating, media resolution, dispatch, the
   * direct-URL/job fork, server-id adoption, polling, finalize — differing
   * only in prompt preparation, character-asset handling, and label strings.
   * The tier is data the run carries: it picks the prompt prep and the log
   * vocabulary, not which pipeline executes.
   *
   * Draft-only phases: a flux-kontext draft is a storyboard (a different
   * provider call inside the same submission envelope), and a video draft
   * resolves @-triggers then compiles the WAN prompt. Render-only: a start
   * frame that IS a character asset skips URL resolution and travels as
   * `characterAssetId`, never as `startImage`.
   */
  const runVideoGeneration = useCallback(
    async (
      tier: Generation["tier"],
      model: string,
      prompt: string,
      params: GenerationParams,
    ) => {
      if (isSubmittingRef.current) return;
      setSubmissionPending(true);
      const isDraft = tier === "draft";
      const runLabel = isDraft ? ("Draft" as const) : ("Render" as const);
      const dispatchNoun = isDraft ? "Video draft" : "Render";
      const resolved = resolveGenerationOptions(optionsRef.current, params);
      const generation = buildGeneration(model, prompt, resolved);
      // Provisional until the server names this take (CONTEXT.md → Take
      // identity). Every state reference below follows this, not the
      // original id, so adoption mid-flight cannot orphan the take.
      let takeId = generation.id;
      const modelConfig = getModelConfig(model);
      const requiredCredits = getModelCreditCost(model, resolved.duration);
      const operationLabel = `${modelConfig?.label ?? "Video"} ${
        isDraft ? "preview" : "render"
      }`;
      let generationAccepted = false;
      const startedAt = Date.now();
      const motionMeta = extractMotionMeta(resolved.generationParams);
      const faceSwapMeta = extractFaceSwapMeta(resolved);
      const isCharacterAsset =
        !isDraft &&
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

      log.info(`${runLabel} generation started`, {
        generationId: takeId,
        tier,
        model,
        promptLength: prompt.trim().length,
        aspectRatio: resolved.aspectRatio ?? null,
        hasStartImage: Boolean(resolved.startImage),
        ...(isDraft
          ? {
              startImageUrlHost,
              faceSwapApplied: faceSwapMeta.faceSwapApplied,
              faceSwapUrlHost: faceSwapMeta.faceSwapUrl
                ? safeUrlHost(faceSwapMeta.faceSwapUrl)
                : null,
              characterAssetId: faceSwapMeta.characterAssetId,
            }
          : {
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
            }),
        requestedEndImage,
        requestedReferenceImageCount,
        requestedExtendMode,
        ...motionMeta,
      });

      const controller = new AbortController();
      const submission = registerSubmission(takeId, controller);

      try {
        if (isDraft && model === "flux-kontext") {
          const response = await generateStoryboardPreview(prompt, {
            ...(resolved.aspectRatio
              ? { aspectRatio: resolved.aspectRatio }
              : {}),
            ...readSessionParams(optionsRef.current),
          });
          if (controller.signal.aborted) {
            return;
          }
          if (!response.success) {
            const reason =
              response.message || response.error || "Failed to generate frames";
            log.warn("Storyboard draft response invalid", {
              generationId: takeId,
              success: false,
              hasImageUrls: false,
              error: reason,
              ...motionMeta,
            });
            throw new Error(reason);
          }
          if (!response.data.imageUrls?.length) {
            log.warn("Storyboard draft response invalid", {
              generationId: takeId,
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
            generationId: takeId,
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
          submission.releasePendingFlag();
          return;
        }

        // Draft-only prompt preparation: resolve @-triggers into their asset
        // text, then compile the WAN prompt. A render sends the words as-is.
        let requestPrompt = prompt;
        let resolvedCharacterAssetId =
          resolved.characterAssetId?.trim() || null;
        if (isDraft) {
          let promptForCompilation = prompt.trim();
          if (hasPromptTriggers(promptForCompilation)) {
            try {
              const resolvedPrompt =
                await assetApi.resolve(promptForCompilation);
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
                  generationId: takeId,
                  error: info.message,
                  errorName: info.name,
                },
              );
            }
          }
          if (controller.signal.aborted) {
            return;
          }

          try {
            requestPrompt = await compileWanPrompt(
              promptForCompilation,
              controller.signal,
            );
          } catch (error) {
            const info = sanitizeError(error);
            log.warn("WAN prompt compilation failed; using raw prompt", {
              generationId: takeId,
              error: info.message,
              errorName: info.name,
            });
            requestPrompt = promptForCompilation;
          }
          if (controller.signal.aborted) {
            return;
          }
        }

        const videoInputSupport = await getVideoInputSupport(model);
        if (controller.signal.aborted) {
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

        const resolvedStartImage = isCharacterAsset
          ? (resolved.startImage ?? null)
          : resolved.startImage
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

        // What the request names as the character: a render whose start frame
        // IS the asset names that asset; otherwise whatever the options
        // carried (a draft may have upgraded it from a prompt trigger).
        const requestCharacterAssetId = isCharacterAsset
          ? (resolved.startImage?.assetId ?? null)
          : resolvedCharacterAssetId;

        log.info(`${dispatchNoun} request dispatched`, {
          generationId: takeId,
          model,
          aspectRatio: resolved.aspectRatio ?? null,
          ...(isDraft
            ? {
                promptLength: requestPrompt.length,
                hasStartImage: Boolean(resolvedStartImage?.url),
                startImageUrlHost: requestStartImageUrlHost,
                motionPromptInjected: false,
                faceSwapApplied: faceSwapMeta.faceSwapApplied,
                faceSwapUrlHost: faceSwapMeta.faceSwapUrl
                  ? safeUrlHost(faceSwapMeta.faceSwapUrl)
                  : null,
                characterAssetId: resolvedCharacterAssetId,
              }
            : {
                isCharacterAsset,
                startImageUrlHost: requestStartImageUrlHost,
                faceSwapApplied: faceSwapMeta.faceSwapApplied,
                faceSwapUrlHost: faceSwapMeta.faceSwapUrl
                  ? safeUrlHost(faceSwapMeta.faceSwapUrl)
                  : null,
                characterAssetId: faceSwapMeta.characterAssetId,
              }),
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
          requestPrompt,
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
            ...(requestCharacterAssetId
              ? { characterAssetId: requestCharacterAssetId }
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
          return;
        }

        log.info(`${dispatchNoun} response received`, {
          generationId: takeId,
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
        let videoPosterUrl: string | null = response.startImageUrl ?? null;
        let videoAssetId: string | null = response.assetId ?? null;
        if (response.success && response.videoUrl) {
          generationAccepted = true;
          acceptGeneration(
            { ...generation, id: takeId },
            {
              status: "completed",
              completedAt: Date.now(),
              mediaUrls: [response.videoUrl],
              ...buildFaceSwapUpdate(response, generation),
              ...buildMediaAssetIdsUpdate(videoAssetId, videoStoragePath),
            },
          );
          submission.releasePendingFlag();
          videoUrl = response.videoUrl;
        } else if (response.success && response.jobId) {
          // The server persists this clip's generation record under the job
          // id (processVideoJob), so that is this take's identity from here
          // on. Without adopting it a session refetch lands a second copy of
          // the same clip — the duplicate the picture paths already avoid.
          takeId = submission.adoptServerId(response.jobId);
          generationAccepted = true;
          acceptGeneration(
            { ...generation, id: takeId },
            {
              status: resolveAcceptedGenerationStatus(response.status),
              jobId: response.jobId,
              ...(response.status ? { serverJobStatus: response.status } : {}),
              ...buildFaceSwapUpdate(response, generation),
            },
          );
          submission.releasePendingFlag();
          log.debug(`Waiting for ${dispatchNoun.toLowerCase()} job to complete`, {
            generationId: takeId,
            jobId: response.jobId,
          });
          const jobResult = await waitForVideoJob(
            response.jobId,
            controller.signal,
            (update) => {
              dispatch({
                type: "UPDATE_GENERATION",
                payload: {
                  id: takeId,
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
          videoPosterUrl = jobResult?.startImageUrl ?? videoPosterUrl;
          log.debug(`${dispatchNoun} job completed`, {
            generationId: takeId,
            jobId: response.jobId,
            hasVideoUrl: Boolean(videoUrl),
          });
        }

        if (controller.signal.aborted) {
          return;
        }
        if (!generationAccepted) {
          submission.releasePendingFlag();
        }
        if (!videoUrl) {
          const fallbackError = isDraft
            ? "Failed to generate video"
            : "Failed to render video";
          log.warn(`${dispatchNoun} completed without a video URL`, {
            generationId: takeId,
            jobId: response.jobId ?? null,
            error: response.error || response.message || fallbackError,
            ...motionMeta,
          });
          throw new Error(response.error || response.message || fallbackError);
        }
        const durationMs = Date.now() - startedAt;
        log.info(`${dispatchNoun} generation succeeded`, {
          generationId: takeId,
          durationMs,
          faceSwapApplied:
            response?.faceSwapApplied ?? faceSwapMeta.faceSwapApplied,
          ...motionMeta,
        });
        if (response.jobId) {
          // The i2v start frame doubles as the clip's poster — the space
          // tile and Library card render stills, never the video itself.
          const posterUrl = videoPosterUrl ?? resolved.startImage?.url ?? null;
          finalizeGeneration(takeId, {
            status: "completed",
            completedAt: Date.now(),
            mediaUrls: [videoUrl],
            jobId: null,
            serverProgress: 100,
            serverJobStatus: "completed",
            ...(posterUrl ? { thumbnailUrl: posterUrl } : {}),
            ...buildMediaAssetIdsUpdate(videoAssetId, videoStoragePath),
          });
        }
      } catch (error) {
        failGenerationRun(error, {
          runLabel,
          model,
          generation,
          takeId,
          accepted: generationAccepted,
          controller,
          submission,
          operationLabel,
          requiredCredits,
          startedAt,
          motionMeta,
          jobBacked: true,
        });
      } finally {
        submission.release();
      }
    },
    [
      acceptGeneration,
      dispatch,
      failGenerationRun,
      finalizeGeneration,
      registerSubmission,
      setSubmissionPending,
    ],
  );

  const generateDraft = useCallback(
    (model: DraftModel, prompt: string, params: GenerationParams) =>
      runVideoGeneration("draft", model, prompt, params),
    [runVideoGeneration],
  );

  const generateStoryboard = useCallback(
    async (prompt: string, params: StoryboardParams) => {
      if (isSubmittingRef.current) return;
      setSubmissionPending(true);
      const { seedImageUrl, ...baseParams } = params;
      const resolved = resolveGenerationOptions(optionsRef.current, baseParams);
      const generation = buildGeneration("flux-kontext", prompt, resolved);
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
      const submission = registerSubmission(generation.id, controller);

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
        submission.releasePendingFlag();
      } catch (error) {
        failGenerationRun(error, {
          runLabel: "Storyboard",
          model: "flux-kontext",
          generation,
          takeId: generation.id,
          accepted: generationAccepted,
          controller,
          submission,
          operationLabel,
          requiredCredits,
          startedAt,
          motionMeta,
          jobBacked: false,
        });
      } finally {
        submission.release();
      }
    },
    [
      acceptGeneration,
      failGenerationRun,
      registerSubmission,
      setSubmissionPending,
    ],
  );

  const generateRender = useCallback(
    (model: string, prompt: string, params: GenerationParams) =>
      runVideoGeneration("render", model, prompt, params),
    [runVideoGeneration],
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
      // One pipeline: the take's tier is data it carries (derived from its
      // model, ADR-0021), not a fork between two copies of the run. A
      // flux-kontext draft re-enters its storyboard branch the same way.
      runVideoGeneration(
        generation.tier,
        generation.model,
        generation.prompt,
        params,
      );
    },
    [runVideoGeneration],
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
