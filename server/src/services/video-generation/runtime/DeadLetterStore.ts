import { admin, getFirestore } from "@infrastructure/firebaseAdmin";
import { logger } from "@infrastructure/Logger";
import type { FirestoreCircuitExecutor } from "@services/firestore/FirestoreCircuitExecutor";
import { z } from "zod";
import { toVideoJobError } from "./normalizeError";
import type {
  DlqEntry,
  VideoJobError,
  VideoJobRecord,
  VideoJobRequest,
} from "./types";

/**
 * Forward-compatibility check for DLQ records. Today only `schemaVersion: 1`
 * (or `undefined` for legacy records) is valid. Any other value indicates a
 * record written by a newer version of the code — fail loudly so old pods do
 * not silently mis-parse a future shape.
 */
export const DlqEntrySchemaVersionSchema = z.literal(1).optional();

/**
 * Parse a raw DLQ document into a DlqEntry. Throws (Zod error) when the
 * `schemaVersion` field is present but not the supported literal `1`,
 * preventing silent mis-parsing of records written by future schema versions.
 *
 * Exported so tests and other readers can validate the same forward-compat
 * contract without going through a Firestore transaction.
 */
export function parseDlqEntry(
  id: string,
  data: Record<string, unknown>,
): DlqEntry {
  const schemaVersion = DlqEntrySchemaVersionSchema.parse(data.schemaVersion);

  return {
    id,
    ...(schemaVersion !== undefined ? { schemaVersion } : {}),
    jobId: data.jobId as string,
    userId: data.userId as string,
    request: data.request as VideoJobRequest,
    creditsReserved:
      typeof data.creditsReserved === "number" ? data.creditsReserved : 0,
    creditsRefunded: data.creditsRefunded === true,
    provider: typeof data.provider === "string" ? data.provider : "unknown",
    error: data.error as VideoJobError,
    source: data.source as string,
    dlqAttempt: typeof data.dlqAttempt === "number" ? data.dlqAttempt : 0,
    maxDlqAttempts:
      typeof data.maxDlqAttempts === "number" ? data.maxDlqAttempts : 3,
  };
}

const SLOW_FIRESTORE_OPERATION_MS = 1_000;

type DeadLetterSource =
  | "worker-terminal"
  | "sweeper-stale"
  | "shutdown-release"
  | "manual-release"
  | "inline-terminal";

export class DeadLetterStore {
  private readonly db = getFirestore();
  private readonly collection = this.db.collection("video_job_dlq");
  private readonly log = logger.child({ service: "DeadLetterStore" });
  private readonly firestoreCircuitExecutor: FirestoreCircuitExecutor;

  constructor(firestoreCircuitExecutor: FirestoreCircuitExecutor) {
    this.firestoreCircuitExecutor = firestoreCircuitExecutor;
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
          `deadLetterStore.${operation}`,
          fn,
        );
      }
      return await this.firestoreCircuitExecutor.executeRead(
        `deadLetterStore.${operation}`,
        fn,
      );
    } finally {
      const durationMs = Date.now() - startedAt;
      if (durationMs >= SLOW_FIRESTORE_OPERATION_MS) {
        this.log.warn("Slow Firestore DLQ operation", {
          operation,
          durationMs,
        });
      } else {
        this.log.debug("Firestore DLQ operation completed", {
          operation,
          durationMs,
        });
      }
    }
  }

  async enqueueDeadLetter(
    job: VideoJobRecord,
    error: VideoJobError,
    source: DeadLetterSource | string,
    options?: { creditsRefunded?: boolean },
  ): Promise<void> {
    const now = Date.now();
    const normalizedError = toVideoJobError(error);
    const isRetryable = normalizedError.retryable !== false;
    const initialBackoffMs = 30_000;
    const maxDlqAttempts = 3;

    await this.withTiming("enqueueDeadLetter", "write", async () => {
      await this.collection.doc(job.id).set(
        {
          schemaVersion: 1 as const,
          jobId: job.id,
          userId: job.userId,
          status: job.status,
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
          request: job.request,
          creditsReserved: job.creditsReserved,
          creditsRefunded: options?.creditsRefunded ?? false,
          provider: job.provider ?? "unknown",
          error: normalizedError,
          source,
          dlqStatus: isRetryable ? "pending" : "escalated",
          dlqAttempt: 0,
          maxDlqAttempts,
          nextRetryAtMs: isRetryable ? now + initialBackoffMs : 0,
          lastDlqError: null,
          createdAtMs: now,
          updatedAtMs: now,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });
  }
}
