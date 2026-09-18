import { logger } from "@infrastructure/Logger";
import type { CreditRefunder } from "@services/credits/ports";
import { buildRefundKey, refundWithGuard } from "@services/credits/refundGuard";
import {
  classifyError,
  withStage,
  type StageAwareError,
} from "./classifyError";
import { HeartbeatManager } from "./HeartbeatManager";
import { RetryPolicy } from "@server/utils/RetryPolicy";
import type { VideoJobAttachment, VideoJobError, VideoJobRecord } from "./types";
import type { VideoGenerationResult } from "../types";
import {
  attachCompletedJobToSession,
  jobOwesAttachment,
} from "./attachJobToSession";

// ────────────────────────────────────────────────────────────────
// Dependency interfaces — kept minimal so both worker and inline
// processor can satisfy them without pulling in full class types.
// ────────────────────────────────────────────────────────────────

export interface JobProcessingStore {
  renewLease(
    jobId: string,
    workerId: string,
    leaseMs: number,
  ): Promise<boolean>;
  markCompleted(
    jobId: string,
    result: VideoGenerationResult | undefined,
  ): Promise<boolean>;
  markFailed(jobId: string, error: VideoJobError): Promise<boolean>;
  requeueForRetry(
    jobId: string,
    workerId: string,
    error: VideoJobError,
  ): Promise<boolean>;
  enqueueDeadLetter(
    job: VideoJobRecord,
    error: VideoJobError,
    source: string,
    options?: { creditsRefunded?: boolean },
  ): Promise<void>;
  setProviderResult?(
    jobId: string,
    workerId: string,
    result: {
      providerVideoUrl: string;
      assetId?: string | undefined;
      contentType?: string | undefined;
      inputMode?: string | undefined;
    },
  ): Promise<boolean | void>;
  /**
   * ADR-0022 decision 6: records whether the completed clip reached its
   * session. Optional so a store that predates the attachment boundary still
   * satisfies this port; the attachment then runs without a durable trace and
   * simply cannot be resumed.
   */
  setAttachment?(
    jobId: string,
    attachment: VideoJobAttachment,
  ): Promise<boolean | void>;
}

export interface JobGenerationService {
  generateVideo(
    prompt: string,
    options: Record<string, unknown> | undefined,
    signal?: AbortSignal,
  ): Promise<VideoGenerationResult>;
}

export interface JobStorageService {
  saveFromUrl(
    userId: string,
    videoUrl: string,
    category: string,
    metadata: Record<string, unknown>,
  ): Promise<{
    storagePath: string;
    viewUrl: string;
    expiresAt: string;
    sizeBytes: number;
  }>;
}

/**
 * ISSUE-12: narrow port for the session append primitive. Avoids importing
 * the full SessionService class here so this module stays testable with a
 * plain stub. Structurally identical to (and satisfied by the same objects as)
 * `SessionAppendPort` in @services/sessions/attachTakeToSession.
 */
export interface JobSessionAppendPort {
  appendGenerationToVersion(
    userId: string,
    sessionId: string,
    promptVersionId: string,
    generation: Record<string, unknown>,
  ): Promise<unknown>;
}

export interface ProcessVideoJobDeps {
  jobStore: JobProcessingStore;
  videoGenerationService: JobGenerationService;
  storageService: JobStorageService | null;
  userCreditService: CreditRefunder;
  /** Worker ID used for heartbeats and logging. */
  workerId: string;
  /** Lease duration in ms — heartbeat fires at leaseMs / 3. */
  leaseMs: number;
  /** Optional configurable heartbeat interval. When provided, overrides leaseMs / 3. */
  heartbeatIntervalMs?: number | undefined;
  /** AbortSignal for cancellation (e.g., heartbeat abort in worker). */
  signal?: AbortSignal | undefined;
  /** Callback on provider-level success (circuit breaker). */
  onProviderSuccess?: ((provider: string) => void) | undefined;
  /** Callback on provider-level failure (circuit breaker). */
  onProviderFailure?: ((provider: string) => void) | undefined;
  /** Metrics recorder for alerts. */
  metrics?:
    | {
        recordAlert: (
          alertName: string,
          metadata?: Record<string, unknown>,
        ) => void;
      }
    | undefined;
  /** DLQ source tag — differs between inline ("inline-terminal") and worker ("worker-terminal"). */
  dlqSource?: string | undefined;
  /** Reason string used when refunding credits on failure. */
  refundReason?: string | undefined;
  /** Log prefix for distinguishing inline vs worker in log messages. */
  logPrefix?: string | undefined;
  /** Injectable heartbeat strategy. When provided, overrides the default internal timer. */
  heartbeat?: {
    start(): void;
    stop(): void;
  };
  /**
   * ISSUE-12: optional session-append port. When set and the job carries
   * sessionId + promptVersionId, the pipeline attaches the completed
   * generation to the session version after markCompleted succeeds —
   * making the video generation server-authoritative without the client
   * having to re-fetch the session.
   */
  sessionService?: JobSessionAppendPort | null | undefined;
}

// ────────────────────────────────────────────────────────────────
// Shared pipeline
// ────────────────────────────────────────────────────────────────

/**
 * Core video job processing pipeline shared by VideoJobWorker and the inline
 * preview processor. Handles: heartbeat → generate → store → markCompleted
 * (with retry) → refund on failure → requeue or DLQ.
 */
export async function processVideoJob(
  job: VideoJobRecord,
  deps: ProcessVideoJobDeps,
): Promise<void> {
  const {
    jobStore,
    videoGenerationService,
    storageService,
    userCreditService,
    workerId,
    leaseMs,
    signal,
    onProviderSuccess,
    onProviderFailure,
    metrics,
    dlqSource = "worker-terminal",
    refundReason = "video job failed",
    logPrefix = "Video job",
    sessionService,
  } = deps;

  const heartbeatIntervalMs =
    deps.heartbeatIntervalMs ?? Math.floor(leaseMs / 3);

  const log = logger.child({ service: "processVideoJob", workerId });

  log.info(`${logPrefix} processing started`, {
    jobId: job.id,
    userId: job.userId,
    attempt: job.attempts,
    maxAttempts: job.maxAttempts,
  });

  const heartbeat =
    deps.heartbeat ??
    new HeartbeatManager({
      jobId: job.id,
      workerId,
      leaseMs,
      intervalMs: heartbeatIntervalMs,
      renewLease: (id, wid, lease) => jobStore.renewLease(id, wid, lease),
      logger: log,
      logPrefix: `${logPrefix} heartbeat`,
    });

  try {
    heartbeat.start();

    // ── Generate ────────────────────────────────────────────────
    if (!storageService) {
      throw new Error("Storage service unavailable for required durable write");
    }

    let result: VideoGenerationResult;
    try {
      result = await videoGenerationService.generateVideo(
        job.request.prompt,
        job.request.options as Record<string, unknown> | undefined,
        signal,
      );
    } catch (error) {
      if (signal?.aborted) {
        throw withStage(
          new Error("Job aborted: lease heartbeat lost during generation"),
          "generation",
        );
      }
      throw withStage(error, "generation");
    }

    // ── Persist provider result (crash-recovery checkpoint) ────
    if (jobStore.setProviderResult) {
      try {
        await jobStore.setProviderResult(job.id, workerId, {
          providerVideoUrl: result.videoUrl,
          assetId: result.assetId,
          contentType: result.contentType,
          ...(result.inputMode ? { inputMode: result.inputMode } : {}),
        });
      } catch (error) {
        log.warn(`${logPrefix} failed to persist provider result (non-fatal)`, {
          jobId: job.id,
          workerId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // ── Store to durable storage ───────────────────────────────
    let storageResult: {
      storagePath: string;
      viewUrl: string;
      expiresAt: string;
      sizeBytes: number;
    };
    try {
      storageResult = await storageService.saveFromUrl(
        job.userId,
        result.videoUrl,
        "generation",
        {
          model: job.request.options?.model,
          creditsUsed: job.creditsReserved,
        },
      );
    } catch (error) {
      if (signal?.aborted) {
        throw withStage(
          new Error("Job aborted: lease heartbeat lost during storage"),
          "persistence",
        );
      }
      throw withStage(error, "persistence");
    }

    log.info("Required storage copy completed", {
      persistence_type: "durable-storage",
      required: true,
      outcome: "success",
      job_id: job.id,
      user_id: job.userId,
      storage_path: storageResult.storagePath,
    });

    const resultWithStorage: VideoGenerationResult = {
      ...result,
      storagePath: storageResult.storagePath,
      viewUrl: storageResult.viewUrl,
      viewUrlExpiresAt: storageResult.expiresAt,
      sizeBytes: storageResult.sizeBytes,
    };

    // ── Mark completed (with retry) ────────────────────────────
    let marked = false;
    try {
      marked = await RetryPolicy.execute(
        () => jobStore.markCompleted(job.id, resultWithStorage),
        {
          maxRetries: 2,
          getDelayMs: (attempt) => 100 * 2 ** (attempt - 1),
          logRetries: true,
        },
      );
    } catch (retryError) {
      log.error(
        `${logPrefix} markCompleted failed after retries — video stored but job not updated`,
        retryError instanceof Error ? retryError : undefined,
        {
          jobId: job.id,
          workerId,
          userId: job.userId,
          storagePath: storageResult.storagePath,
          assetId: result.assetId,
        },
      );
    }

    if (!marked) {
      log.error(
        `${logPrefix} completion failed — refunding credits`,
        undefined,
        {
          jobId: job.id,
          workerId,
          userId: job.userId,
          storagePath: storageResult.storagePath,
          assetId: result.assetId,
          recovery: "manual — asset exists at storagePath",
        },
      );
      const refundKey = buildRefundKey(["video-job", job.id, "video"]);
      await refundWithGuard({
        userCreditService,
        userId: job.userId,
        amount: job.creditsReserved,
        refundKey,
        reason: `${refundReason} markCompleted failed after retries`,
        metadata: {
          jobId: job.id,
          workerId,
          storagePath: storageResult.storagePath,
        },
      });
      return;
    }

    log.info(`${logPrefix} completed`, {
      jobId: job.id,
      userId: job.userId,
      assetId: result.assetId,
    });

    // ISSUE-12 / ADR-0022 decision 6: the completed clip is attached to its
    // session as a SEPARATE tracked fact. The job's generation outcome is
    // already settled above — markCompleted succeeded, credits are accounted
    // for, the media is in durable storage — so nothing below may reopen it.
    // A failed attachment is recorded as failed-and-retryable on the job and
    // surfaced to the creator as "made but not saved"; it never refunds, never
    // requeues, and never re-runs the provider.
    if (jobOwesAttachment(job) && sessionService) {
      await attachCompletedJobToSession({
        // markCompleted stamped the durable copy onto the result; the record
        // the session is owed is built from that, not from the provider URL.
        job: { ...job, result: resultWithStorage },
        jobStore,
        sessionService,
        log,
        logPrefix,
      });
    }

    if (onProviderSuccess && job.provider && job.provider !== "unknown") {
      onProviderSuccess(job.provider);
    }
  } catch (error) {
    const stageAware = withStage(
      error,
      (error as StageAwareError)?.stage || "generation",
    );
    const classifiedError = classifyError(stageAware, {
      request: job.request,
      attempts: job.attempts,
    });

    const errorInstance =
      error instanceof Error ? error : new Error(classifiedError.message);
    log.error(`${logPrefix} attempt failed`, errorInstance, {
      jobId: job.id,
      workerId,
      userId: job.userId,
      errorMessage: classifiedError.message,
      retryable: classifiedError.retryable,
      category: classifiedError.category,
      stage: classifiedError.stage,
    });

    if (
      onProviderFailure &&
      job.provider &&
      job.provider !== "unknown" &&
      (classifiedError.stage === "generation" ||
        classifiedError.category === "provider" ||
        classifiedError.category === "timeout")
    ) {
      onProviderFailure(job.provider);
    }

    if (classifiedError.stage === "persistence") {
      metrics?.recordAlert("video_job_persistence_failure", {
        jobId: job.id,
        attempt: job.attempts,
        code: classifiedError.code,
      });
    }

    const hasAttemptsRemaining = job.attempts < job.maxAttempts;
    if (classifiedError.retryable && hasAttemptsRemaining) {
      const requeued = await jobStore.requeueForRetry(
        job.id,
        workerId,
        classifiedError,
      );
      if (requeued) {
        log.info(`${logPrefix} requeued for retry`, {
          jobId: job.id,
          workerId,
          userId: job.userId,
          attempt: job.attempts,
          maxAttempts: job.maxAttempts,
        });
        metrics?.recordAlert("video_job_requeued", {
          jobId: job.id,
          attempt: job.attempts,
          maxAttempts: job.maxAttempts,
          code: classifiedError.code,
          category: classifiedError.category,
        });
      } else {
        log.warn(`${logPrefix} requeue skipped (status changed)`, {
          jobId: job.id,
          workerId,
          userId: job.userId,
        });
      }
      return;
    }

    const terminalError: VideoJobError = {
      ...classifiedError,
      retryable: false,
    };

    const markedFailed = await jobStore.markFailed(job.id, terminalError);
    if (markedFailed) {
      const refundKey = buildRefundKey(["video-job", job.id, "video"]);
      const refunded = await refundWithGuard({
        userCreditService,
        userId: job.userId,
        amount: job.creditsReserved,
        refundKey,
        reason: refundReason,
        metadata: {
          jobId: job.id,
          workerId,
          category: terminalError.category,
          code: terminalError.code,
          attempt: job.attempts,
        },
      });
      await jobStore.enqueueDeadLetter(job, terminalError, dlqSource, {
        creditsRefunded: refunded,
      });
      metrics?.recordAlert("video_job_terminal_failure", {
        jobId: job.id,
        attempt: job.attempts,
        maxAttempts: job.maxAttempts,
        code: terminalError.code,
        category: terminalError.category,
        stage: terminalError.stage,
      });
    } else {
      log.warn(`${logPrefix} failure skipped (status changed)`, {
        jobId: job.id,
        workerId,
        userId: job.userId,
      });
    }
  } finally {
    heartbeat.stop();
  }
}
