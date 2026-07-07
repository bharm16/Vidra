import type { DocumentData, Query } from "firebase-admin/firestore";
import { admin, getFirestore } from "@infrastructure/firebaseAdmin";
import { logger } from "@infrastructure/Logger";
import {
  FirestoreCircuitExecutor,
  getFirestoreCircuitExecutor,
} from "@services/firestore/FirestoreCircuitExecutor";
import type {
  DlqEntry,
  VideoJobError,
  VideoJobRecord,
  VideoJobRequest,
} from "./types";
import { resolveProviderForModel } from "../providers/ProviderRegistry";
import type { VideoModelId } from "../types";
import { DeadLetterStore } from "./DeadLetterStore";
import { parseVideoJobRecord } from "./parseVideoJobRecord";
import {
  resolvePositiveInt,
  toVideoJobError,
  type VideoJobErrorInput,
} from "./normalizeError";
import { computeBackoffMs, RETRY_JITTER_RATIO } from "./computeBackoff";

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_PROVIDER = "unknown";
const SLOW_FIRESTORE_OPERATION_MS = 1_000;
// Bounds the per-session cancellation fan-out. Sized well below any
// realistic per-session job count; if a session legitimately exceeds this,
// the warning logged from findJobsBySessionId is the trigger to raise it
// (or to paginate). The +1 sentinel pattern in findJobsBySessionId requires
// this to remain a finite cap — do not raise to Number.MAX_SAFE_INTEGER.
const FIND_JOBS_BY_SESSION_CAP = 500;

interface CreateJobInput {
  userId: string;
  sessionId?: string;
  /**
   * ISSUE-12: when both sessionId and promptVersionId are set, the worker
   * pipeline appends the completed generation to the named session version
   * after successful markCompleted.
   */
  promptVersionId?: string;
  /** M5 / ADR-0013: source picture id, persisted for the clip's lineage edge. */
  sourceGenerationId?: string;
  requestId?: string;
  request: VideoJobRequest;
  creditsReserved: number;
  maxAttempts?: number;
}

function resolveProviderFromRequest(request: VideoJobRequest): string {
  const model = request.options?.model;
  if (typeof model === "string" && model.length > 0) {
    try {
      return resolveProviderForModel(model as VideoModelId);
    } catch {
      return DEFAULT_PROVIDER;
    }
  }
  return DEFAULT_PROVIDER;
}

export class VideoJobStore {
  private readonly db = getFirestore();
  private readonly collection = this.db.collection("video_jobs");
  private readonly log = logger.child({ service: "VideoJobStore" });
  private readonly firestoreCircuitExecutor: FirestoreCircuitExecutor;
  private readonly defaultMaxAttempts: number;
  private readonly dlq: DeadLetterStore;

  constructor(
    firestoreCircuitExecutor: FirestoreCircuitExecutor = getFirestoreCircuitExecutor(),
    defaultMaxAttempts: number = DEFAULT_MAX_ATTEMPTS,
  ) {
    this.firestoreCircuitExecutor = firestoreCircuitExecutor;
    this.defaultMaxAttempts = defaultMaxAttempts;
    this.dlq = new DeadLetterStore(firestoreCircuitExecutor);
  }

  private async withTiming<T>(
    operation: string,
    mode: "read" | "write",
    fn: () => Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now();
    try {
      if (mode === "write") {
        return await this.firestoreCircuitExecutor.executeWrite(
          `videoJobStore.${operation}`,
          fn,
        );
      }
      return await this.firestoreCircuitExecutor.executeRead(
        `videoJobStore.${operation}`,
        fn,
      );
    } finally {
      const durationMs = Date.now() - startedAt;
      if (durationMs >= SLOW_FIRESTORE_OPERATION_MS) {
        this.log.warn("Slow Firestore job operation", {
          operation,
          durationMs,
        });
      } else {
        this.log.debug("Firestore job operation completed", {
          operation,
          durationMs,
        });
      }
    }
  }

  async createJob(input: CreateJobInput): Promise<VideoJobRecord> {
    const now = Date.now();
    const docRef = this.collection.doc();
    const maxAttempts = resolvePositiveInt(
      input.maxAttempts,
      this.defaultMaxAttempts,
    );
    const provider = resolveProviderFromRequest(input.request);

    const record = {
      schemaVersion: 1 as const,
      status: "queued",
      userId: input.userId,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.promptVersionId
        ? { promptVersionId: input.promptVersionId }
        : {}),
      ...(input.sourceGenerationId
        ? { sourceGenerationId: input.sourceGenerationId }
        : {}),
      ...(input.requestId ? { requestId: input.requestId } : {}),
      request: input.request,
      creditsReserved: input.creditsReserved,
      provider,
      attempts: 0,
      maxAttempts,
      createdAtMs: now,
      updatedAtMs: now,
    };

    await this.withTiming("createJob", "write", async () => {
      await docRef.set({
        ...record,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return this.parseJob(docRef.id, record);
  }

  /**
   * Atomically reserve credits AND create the job record in one Firestore transaction.
   * Closes the Seam-A/Seam-B window where a crash between reserveCredits() and createJob()
   * could leave credits debited with no job record to drive completion (or, on client retry,
   * double-charge the user).
   */
  async createJobWithReservation(
    input: CreateJobInput,
    deps: {
      creditService: {
        checkAndReserveInTransaction: (
          tx: FirebaseFirestore.Transaction,
          userId: string,
          cost: number,
          options?: { source?: string; reason?: string; referenceId?: string },
        ) => Promise<
          | { ok: true }
          | { ok: false; reason: "user_not_found" | "insufficient_credits" }
        >;
      };
      cost: number;
    },
  ): Promise<
    | { reserved: true; job: VideoJobRecord }
    | { reserved: false; reason: "user_not_found" | "insufficient_credits" }
  > {
    const now = Date.now();
    const docRef = this.collection.doc();
    const maxAttempts = resolvePositiveInt(
      input.maxAttempts,
      this.defaultMaxAttempts,
    );
    const provider = resolveProviderFromRequest(input.request);

    const record = {
      schemaVersion: 1 as const,
      status: "queued",
      userId: input.userId,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.promptVersionId
        ? { promptVersionId: input.promptVersionId }
        : {}),
      ...(input.sourceGenerationId
        ? { sourceGenerationId: input.sourceGenerationId }
        : {}),
      ...(input.requestId ? { requestId: input.requestId } : {}),
      request: input.request,
      creditsReserved: input.creditsReserved,
      provider,
      attempts: 0,
      maxAttempts,
      createdAtMs: now,
      updatedAtMs: now,
    };

    const outcome = await this.withTiming(
      "createJobWithReservation",
      "write",
      async () =>
        await this.db.runTransaction(async (transaction) => {
          const reservation =
            await deps.creditService.checkAndReserveInTransaction(
              transaction,
              input.userId,
              deps.cost,
              {
                source: "generation",
                ...(input.requestId ? { referenceId: input.requestId } : {}),
              },
            );

          if (!reservation.ok) {
            return { reserved: false as const, reason: reservation.reason };
          }

          transaction.set(docRef, {
            ...record,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          return { reserved: true as const };
        }),
    );

    if (!outcome.reserved) {
      return outcome;
    }

    return { reserved: true, job: this.parseJob(docRef.id, record) };
  }

  async getJob(jobId: string): Promise<VideoJobRecord | null> {
    const snapshot = await this.withTiming(
      "getJob",
      "read",
      async () => await this.collection.doc(jobId).get(),
    );
    if (!snapshot.exists) {
      return null;
    }
    return this.parseJob(snapshot.id, snapshot.data());
  }

  /**
   * Returns jobs (across all statuses) associated with the given session.
   * Used by SessionService to cascade cancellation when a session is deleted.
   */
  async findJobsBySessionId(sessionId: string): Promise<VideoJobRecord[]> {
    // Bound worst-case load on session delete: cancelJobsForSession dispatches
    // one transaction per returned job in parallel, so a session with
    // pathologically many jobs could fan out into a large concurrent
    // transaction storm. The cap (FIND_JOBS_BY_SESSION_CAP) keeps the
    // dispatch bounded.
    //
    // We query `limit + 1` (with deterministic ordering) so a returned size
    // equal to limit + 1 unambiguously signals truncation — at which point
    // we trim back to limit and log a warning so operators can paginate or
    // raise the cap. Without orderBy, Firestore would return an arbitrary
    // subset and the remaining jobs would silently keep processing after
    // the session is deleted.
    const snapshot = await this.withTiming(
      "findJobsBySessionId",
      "read",
      async () =>
        await this.collection
          .where("sessionId", "==", sessionId)
          .orderBy("createdAtMs", "asc")
          .limit(FIND_JOBS_BY_SESSION_CAP + 1)
          .get(),
    );

    if (snapshot.empty) {
      return [];
    }

    let docs = snapshot.docs;
    if (docs.length > FIND_JOBS_BY_SESSION_CAP) {
      this.log.warn(
        "Session has more jobs than the lookup cap; cancellation will be partial",
        {
          sessionId,
          cap: FIND_JOBS_BY_SESSION_CAP,
          observedAtLeast: docs.length,
        },
      );
      docs = docs.slice(0, FIND_JOBS_BY_SESSION_CAP);
    }

    return docs
      .map((doc) => {
        try {
          return this.parseJob(doc.id, doc.data());
        } catch (error) {
          this.log.warn("Skipping unparsable job record in session lookup", {
            jobId: doc.id,
            sessionId,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      })
      .filter((job): job is VideoJobRecord => job !== null);
  }

  /**
   * Marks queued/processing jobs for the given session as failed with a
   * session-deleted reason. Completed or already-failed jobs are left alone
   * (their assets are handled by the retention/reconciler path).
   *
   * Returns the count of jobs successfully cancelled.
   */
  async cancelJobsForSession(sessionId: string): Promise<number> {
    const jobs = await this.findJobsBySessionId(sessionId);
    const cancellable = jobs.filter(
      (job) => job.status === "queued" || job.status === "processing",
    );

    // Run cancellations in parallel. Each markFailed runs its own transaction
    // (state-machine validation per doc) so they're safe to dispatch
    // concurrently — different doc IDs, no cross-doc invariants. The serial
    // loop here paid N round-trips on session delete.
    const results = await Promise.all(
      cancellable.map((job) =>
        this.markFailed(job.id, {
          message: "Session deleted — job cancelled",
          code: "SESSION_DELETED",
          category: "validation",
          retryable: false,
          stage: "queue",
        }),
      ),
    );
    return results.filter(Boolean).length;
  }

  async findJobByAssetId(assetId: string): Promise<VideoJobRecord | null> {
    const snapshot = await this.withTiming(
      "findJobByAssetId",
      "read",
      async () =>
        await this.collection
          .where("result.assetId", "==", assetId)
          .limit(1)
          .get(),
    );

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    if (!doc) {
      return null;
    }
    return this.parseJob(doc.id, doc.data());
  }

  async failNextQueuedStaleJob(
    cutoffMs: number,
    reason: string,
  ): Promise<VideoJobRecord | null> {
    const query = this.collection
      .where("status", "==", "queued")
      .where("createdAtMs", "<=", cutoffMs)
      .orderBy("createdAtMs", "asc")
      .limit(1);

    return await this.failFromQuery(query, {
      message: reason,
      code: "VIDEO_JOB_STALE_QUEUED",
      category: "timeout",
      retryable: false,
      stage: "sweeper",
    });
  }

  async failNextProcessingStaleJob(
    cutoffMs: number,
    reason: string,
  ): Promise<VideoJobRecord | null> {
    const query = this.collection
      .where("status", "==", "processing")
      .where("leaseExpiresAtMs", "<=", cutoffMs)
      .orderBy("leaseExpiresAtMs", "asc")
      .limit(1);

    return await this.failFromQuery(query, {
      message: reason,
      code: "VIDEO_JOB_STALE_PROCESSING",
      category: "timeout",
      retryable: false,
      stage: "sweeper",
    });
  }

  async claimNextJob(
    workerId: string,
    leaseMs: number,
    provider?: string,
  ): Promise<VideoJobRecord | null> {
    let queuedQuery: Query = this.collection.where("status", "==", "queued");
    if (provider) {
      queuedQuery = queuedQuery.where("provider", "==", provider);
    }
    queuedQuery = queuedQuery.orderBy("createdAtMs", "asc").limit(1);

    const queued = await this.claimFromQuery(queuedQuery, workerId, leaseMs);
    if (queued) {
      return queued;
    }

    const now = Date.now();
    const expiredQuery = this.collection
      .where("status", "==", "processing")
      .where("leaseExpiresAtMs", "<=", now)
      .orderBy("leaseExpiresAtMs", "asc")
      .limit(1);

    return await this.claimFromQuery(expiredQuery, workerId, leaseMs);
  }

  /**
   * Direct claim by id — used by the inline processor right after job creation
   * and by admin/test flows. Deliberately bypasses the retry-backoff gate:
   * callers that want backoff semantics should go through `claimNextJob`.
   */
  async claimJob(
    jobId: string,
    workerId: string,
    leaseMs: number,
  ): Promise<VideoJobRecord | null> {
    try {
      return await this.withTiming(
        "claimJob",
        "write",
        async () =>
          await this.db.runTransaction(async (transaction) => {
            const docRef = this.collection.doc(jobId);
            const snapshot = await transaction.get(docRef);
            if (!snapshot.exists) {
              return null;
            }

            const data = snapshot.data();
            if (!data || data.status !== "queued") {
              return null;
            }

            const now = Date.now();
            const leaseExpiresAtMs = now + leaseMs;
            const attempts =
              typeof data.attempts === "number" &&
              Number.isFinite(data.attempts)
                ? data.attempts + 1
                : 1;
            const maxAttempts = resolvePositiveInt(
              typeof data.maxAttempts === "number"
                ? data.maxAttempts
                : undefined,
              this.defaultMaxAttempts,
            );

            transaction.update(docRef, {
              status: "processing",
              workerId,
              attempts,
              maxAttempts,
              leaseExpiresAtMs,
              lastHeartbeatAtMs: now,
              updatedAtMs: now,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              releasedAtMs: admin.firestore.FieldValue.delete(),
              releaseReason: admin.firestore.FieldValue.delete(),
            });

            return this.parseJob(jobId, {
              ...data,
              status: "processing",
              workerId,
              attempts,
              maxAttempts,
              leaseExpiresAtMs,
              lastHeartbeatAtMs: now,
              updatedAtMs: now,
            });
          }),
      );
    } catch (error) {
      logger.error("Failed to claim video job by id", error as Error, {
        jobId,
        workerId,
      });
      return null;
    }
  }

  async renewLease(
    jobId: string,
    workerId: string,
    leaseMs: number,
  ): Promise<boolean> {
    try {
      return await this.withTiming(
        "renewLease",
        "write",
        async () =>
          await this.db.runTransaction(async (transaction) => {
            const docRef = this.collection.doc(jobId);
            const snapshot = await transaction.get(docRef);
            if (!snapshot.exists) {
              return false;
            }

            const data = snapshot.data();
            if (
              !data ||
              data.status !== "processing" ||
              data.workerId !== workerId
            ) {
              return false;
            }

            const now = Date.now();
            transaction.update(docRef, {
              leaseExpiresAtMs: now + leaseMs,
              lastHeartbeatAtMs: now,
              updatedAtMs: now,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            return true;
          }),
      );
    } catch (error) {
      logger.error("Failed to renew video job lease", error as Error, {
        jobId,
        workerId,
      });
      return false;
    }
  }

  async releaseClaim(
    jobId: string,
    workerId: string,
    reason: string,
  ): Promise<boolean> {
    try {
      return await this.withTiming(
        "releaseClaim",
        "write",
        async () =>
          await this.db.runTransaction(async (transaction) => {
            const docRef = this.collection.doc(jobId);
            const snapshot = await transaction.get(docRef);
            if (!snapshot.exists) {
              return false;
            }

            const data = snapshot.data();
            if (
              !data ||
              data.status !== "processing" ||
              data.workerId !== workerId
            ) {
              return false;
            }

            const now = Date.now();
            transaction.update(docRef, {
              status: "queued",
              releasedAtMs: now,
              releaseReason: reason,
              updatedAtMs: now,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              workerId: admin.firestore.FieldValue.delete(),
              leaseExpiresAtMs: admin.firestore.FieldValue.delete(),
              lastHeartbeatAtMs: admin.firestore.FieldValue.delete(),
            });

            return true;
          }),
      );
    } catch (error) {
      logger.error("Failed to release claimed video job", error as Error, {
        jobId,
        workerId,
        reason,
      });
      return false;
    }
  }

  async requeueForRetry(
    jobId: string,
    workerId: string,
    error: VideoJobError,
  ): Promise<boolean> {
    const normalizedError = toVideoJobError(error);
    try {
      return await this.withTiming(
        "requeueForRetry",
        "write",
        async () =>
          await this.db.runTransaction(async (transaction) => {
            const docRef = this.collection.doc(jobId);
            const snapshot = await transaction.get(docRef);
            if (!snapshot.exists) {
              return false;
            }

            const data = snapshot.data();
            if (
              !data ||
              data.status !== "processing" ||
              data.workerId !== workerId
            ) {
              return false;
            }

            const now = Date.now();
            const attempts =
              typeof data.attempts === "number" &&
              Number.isFinite(data.attempts)
                ? data.attempts
                : 0;
            const nextRetryAtMs =
              now +
              computeBackoffMs(attempts, {
                jitterRatio: RETRY_JITTER_RATIO,
                now,
              });
            transaction.update(docRef, {
              status: "queued",
              error: normalizedError,
              releasedAtMs: now,
              releaseReason: "retry",
              nextRetryAtMs,
              updatedAtMs: now,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              workerId: admin.firestore.FieldValue.delete(),
              leaseExpiresAtMs: admin.firestore.FieldValue.delete(),
              lastHeartbeatAtMs: admin.firestore.FieldValue.delete(),
            });

            return true;
          }),
      );
    } catch (txError) {
      logger.error("Failed to requeue video job for retry", txError as Error, {
        jobId,
        workerId,
      });
      return false;
    }
  }

  /**
   * Persist the raw provider result (video URL, assetId) to the job record immediately
   * after generation succeeds but before storage. This enables the reconciler to retry
   * storage from the provider URL if the worker crashes between generation and completion.
   */
  async setProviderResult(
    jobId: string,
    workerId: string,
    providerResult: {
      providerVideoUrl: string;
      assetId: string;
      contentType: string;
      inputMode?: string;
    },
  ): Promise<boolean> {
    try {
      return await this.withTiming(
        "setProviderResult",
        "write",
        async () =>
          await this.db.runTransaction(async (transaction) => {
            const docRef = this.collection.doc(jobId);
            const snapshot = await transaction.get(docRef);
            if (!snapshot.exists) {
              return false;
            }

            const data = snapshot.data();
            if (
              !data ||
              data.status !== "processing" ||
              data.workerId !== workerId
            ) {
              return false;
            }

            const now = Date.now();
            transaction.update(docRef, {
              providerResult: providerResult,
              updatedAtMs: now,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            return true;
          }),
      );
    } catch (error) {
      logger.error(
        "Failed to set provider result on video job",
        error as Error,
        { jobId, workerId },
      );
      return false;
    }
  }

  async markCompleted(
    jobId: string,
    result: VideoJobRecord["result"],
  ): Promise<boolean> {
    const now = Date.now();

    try {
      return await this.withTiming(
        "markCompleted",
        "write",
        async () =>
          await this.db.runTransaction(async (transaction) => {
            const docRef = this.collection.doc(jobId);
            const snapshot = await transaction.get(docRef);
            if (!snapshot.exists) {
              return false;
            }

            const data = snapshot.data();
            if (!data || data.status !== "processing") {
              return false;
            }

            transaction.update(docRef, {
              status: "completed",
              result,
              completedAtMs: now,
              updatedAtMs: now,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              workerId: admin.firestore.FieldValue.delete(),
              leaseExpiresAtMs: admin.firestore.FieldValue.delete(),
              lastHeartbeatAtMs: admin.firestore.FieldValue.delete(),
            });

            return true;
          }),
      );
    } catch (error) {
      logger.error("Failed to mark video job completed", error as Error, {
        jobId,
      });
      return false;
    }
  }

  async markFailed(jobId: string, error: VideoJobErrorInput): Promise<boolean> {
    const now = Date.now();
    const normalizedError = toVideoJobError(error);

    try {
      return await this.withTiming(
        "markFailed",
        "write",
        async () =>
          await this.db.runTransaction(async (transaction) => {
            const docRef = this.collection.doc(jobId);
            const snapshot = await transaction.get(docRef);
            if (!snapshot.exists) {
              return false;
            }

            const data = snapshot.data();
            if (
              !data ||
              data.status === "failed" ||
              data.status === "completed"
            ) {
              return false;
            }

            transaction.update(docRef, {
              status: "failed",
              error: normalizedError,
              updatedAtMs: now,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              workerId: admin.firestore.FieldValue.delete(),
              leaseExpiresAtMs: admin.firestore.FieldValue.delete(),
              lastHeartbeatAtMs: admin.firestore.FieldValue.delete(),
            });

            return true;
          }),
      );
    } catch (txError) {
      logger.error("Failed to mark video job failed", txError as Error, {
        jobId,
      });
      return false;
    }
  }

  async enqueueDeadLetter(
    job: VideoJobRecord,
    error: VideoJobError,
    source: string,
    options?: { creditsRefunded?: boolean },
  ): Promise<void> {
    return this.dlq.enqueueDeadLetter(job, error, source, options);
  }

  async claimNextDlqEntry(nowMs: number): Promise<DlqEntry | null> {
    return this.dlq.claimNextDlqEntry(nowMs);
  }

  async markDlqReprocessed(dlqId: string): Promise<void> {
    return this.dlq.markDlqReprocessed(dlqId);
  }

  async markDlqFailed(
    dlqId: string,
    attempt: number,
    maxAttempts: number,
    errorMessage: string,
  ): Promise<boolean> {
    return this.dlq.markDlqFailed(dlqId, attempt, maxAttempts, errorMessage);
  }

  async getDlqBacklogCount(): Promise<number> {
    return this.dlq.getDlqBacklogCount();
  }

  private async claimFromQuery(
    query: Query,
    workerId: string,
    leaseMs: number,
  ): Promise<VideoJobRecord | null> {
    try {
      return await this.withTiming(
        "claimFromQuery",
        "write",
        async () =>
          await this.db.runTransaction(async (transaction) => {
            const snapshot = await transaction.get(query);
            if (snapshot.empty) {
              return null;
            }

            const doc = snapshot.docs[0];
            if (!doc) {
              return null;
            }
            const data = doc.data();
            if (!data) {
              return null;
            }

            const now = Date.now();

            // Respect retry backoff: skip this job if it's waiting to retry.
            // The next poll cycle will reconsider it once the clock catches up.
            if (
              typeof data.nextRetryAtMs === "number" &&
              data.nextRetryAtMs > now
            ) {
              return null;
            }

            const leaseExpiresAtMs = now + leaseMs;
            const attempts =
              typeof data.attempts === "number" &&
              Number.isFinite(data.attempts)
                ? data.attempts + 1
                : 1;
            const maxAttempts = resolvePositiveInt(
              typeof data.maxAttempts === "number"
                ? data.maxAttempts
                : undefined,
              this.defaultMaxAttempts,
            );

            transaction.update(doc.ref, {
              status: "processing",
              workerId,
              attempts,
              maxAttempts,
              leaseExpiresAtMs,
              lastHeartbeatAtMs: now,
              updatedAtMs: now,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              releasedAtMs: admin.firestore.FieldValue.delete(),
              releaseReason: admin.firestore.FieldValue.delete(),
              nextRetryAtMs: admin.firestore.FieldValue.delete(),
            });

            return this.parseJob(doc.id, {
              ...data,
              status: "processing",
              workerId,
              attempts,
              maxAttempts,
              leaseExpiresAtMs,
              lastHeartbeatAtMs: now,
              updatedAtMs: now,
            });
          }),
      );
    } catch (error) {
      logger.error("Failed to claim video job", error as Error);
      return null;
    }
  }

  private parseJob(id: string, data: DocumentData | undefined): VideoJobRecord {
    return parseVideoJobRecord(id, data, this.defaultMaxAttempts);
  }

  private async failFromQuery(
    query: Query,
    error: VideoJobError,
  ): Promise<VideoJobRecord | null> {
    const normalizedError = toVideoJobError(error);
    try {
      return await this.withTiming(
        "failFromQuery",
        "write",
        async () =>
          await this.db.runTransaction(async (transaction) => {
            const snapshot = await transaction.get(query);
            if (snapshot.empty) {
              return null;
            }

            const doc = snapshot.docs[0];
            if (!doc) {
              return null;
            }
            const data = doc.data();
            if (!data) {
              return null;
            }

            const now = Date.now();
            transaction.update(doc.ref, {
              status: "failed",
              error: normalizedError,
              updatedAtMs: now,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              workerId: admin.firestore.FieldValue.delete(),
              leaseExpiresAtMs: admin.firestore.FieldValue.delete(),
              lastHeartbeatAtMs: admin.firestore.FieldValue.delete(),
            });

            return this.parseJob(doc.id, {
              ...data,
              status: "failed",
              error: normalizedError,
              updatedAtMs: now,
            });
          }),
      );
    } catch (txError) {
      logger.error("Failed to mark stale video job failed", txError as Error, {
        reason: normalizedError.message,
        code: normalizedError.code,
      });
      return null;
    }
  }
}
