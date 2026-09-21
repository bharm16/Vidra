import { sha256Hex } from "@utils/hash";
import { admin, getFirestore } from "@infrastructure/firebaseAdmin";
import { logger } from "@infrastructure/Logger";
import type { FirestoreCircuitExecutor } from "@services/firestore/FirestoreCircuitExecutor";
import { getFirestoreCircuitExecutor } from "@services/firestore/FirestoreCircuitExecutor";

const DEFAULT_PENDING_LOCK_TTL_MS = 6 * 60 * 1000;
const DEFAULT_REPLAY_TTL_MS = 24 * 60 * 60 * 1000;

export interface IdempotencyResponseSnapshot {
  statusCode: number;
  body: Record<string, unknown>;
}

interface IdempotencyRecord {
  key: string;
  userId: string;
  route: string;
  payloadHash: string;
  status: "pending" | "completed" | "failed";
  lockExpiresAtMs: number;
  expiresAt: Date;
  createdAtMs: number;
  updatedAtMs: number;
  jobId?: string;
  responseSnapshot?: IdempotencyResponseSnapshot;
  lastError?: string;
}

export type IdempotencyClaimResult =
  | { state: "claimed"; recordId: string }
  | { state: "replay"; recordId: string; snapshot: IdempotencyResponseSnapshot }
  | { state: "in_progress"; recordId: string }
  | { state: "conflict"; recordId: string };

export type VideoGenerateIdempotencyMode = "soft" | "required";

function stableStringify(value: unknown): string {
  if (value === null) {
    return "null";
  }

  const valueType = typeof value;
  if (valueType === "string") {
    return JSON.stringify(value);
  }
  if (valueType === "number" || valueType === "boolean") {
    return JSON.stringify(value);
  }
  if (valueType === "bigint") {
    return JSON.stringify((value as bigint).toString());
  }
  if (valueType === "undefined") {
    return '\"\"';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (valueType === "object") {
    const objectValue = value as Record<string, unknown>;
    const keys = Object.keys(objectValue).sort();
    const entries = keys.map(
      (key) => `${JSON.stringify(key)}:${stableStringify(objectValue[key])}`,
    );
    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(String(value));
}

function hashSha256(input: string): string {
  return sha256Hex(input);
}

function toRecordId(userId: string, route: string, key: string): string {
  return hashSha256(`${userId}|${route}|${key}`);
}

function toPayloadHash(payload: unknown): string {
  return hashSha256(stableStringify(payload));
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function resolveVideoGenerateIdempotencyMode(
  env: NodeJS.ProcessEnv = process.env,
): VideoGenerateIdempotencyMode {
  return env.VIDEO_GENERATE_IDEMPOTENCY_MODE === "soft" ? "soft" : "required";
}

export class RequestIdempotencyService {
  private readonly db = getFirestore();
  private readonly collection = this.db.collection("request_idempotency");
  private readonly log = logger.child({ service: "RequestIdempotencyService" });
  private readonly pendingLockTtlMs: number;
  private readonly replayTtlMs: number;
  private readonly firestoreCircuitExecutor: FirestoreCircuitExecutor;

  constructor(
    firestoreCircuitExecutor: FirestoreCircuitExecutor = getFirestoreCircuitExecutor(),
    options?: {
      pendingLockTtlMs?: number;
      replayTtlMs?: number;
    },
  ) {
    this.firestoreCircuitExecutor = firestoreCircuitExecutor;
    this.pendingLockTtlMs =
      options?.pendingLockTtlMs ?? DEFAULT_PENDING_LOCK_TTL_MS;
    this.replayTtlMs = options?.replayTtlMs ?? DEFAULT_REPLAY_TTL_MS;
  }

  async claimRequest(input: {
    userId: string;
    route: string;
    key: string;
    payload: unknown;
  }): Promise<IdempotencyClaimResult> {
    const now = Date.now();
    const recordId = toRecordId(input.userId, input.route, input.key);
    const payloadHash = toPayloadHash(input.payload);
    const docRef = this.collection.doc(recordId);

    return await this.firestoreCircuitExecutor.executeWrite(
      "idempotency.claimRequest",
      async () =>
        await this.db.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(docRef);
          const lockExpiresAtMs = now + this.pendingLockTtlMs;
          const expiresAt = new Date(now + this.replayTtlMs);

          if (!snapshot.exists) {
            const createdRecord: IdempotencyRecord = {
              key: input.key,
              userId: input.userId,
              route: input.route,
              payloadHash,
              status: "pending",
              lockExpiresAtMs,
              expiresAt,
              createdAtMs: now,
              updatedAtMs: now,
            };
            transaction.set(docRef, {
              ...createdRecord,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return { state: "claimed", recordId };
          }

          const existing = snapshot.data() as
            | Partial<IdempotencyRecord>
            | undefined;
          if (!existing) {
            return { state: "conflict", recordId };
          }

          if (existing.payloadHash && existing.payloadHash !== payloadHash) {
            return { state: "conflict", recordId };
          }

          if (existing.status === "completed" && existing.responseSnapshot) {
            return {
              state: "replay",
              recordId,
              snapshot: existing.responseSnapshot,
            };
          }

          if (
            existing.status === "pending" &&
            typeof existing.lockExpiresAtMs === "number"
          ) {
            if (existing.lockExpiresAtMs > now) {
              return { state: "in_progress", recordId };
            }
          }

          transaction.set(
            docRef,
            {
              key: input.key,
              userId: input.userId,
              route: input.route,
              payloadHash,
              status: "pending",
              lockExpiresAtMs,
              expiresAt,
              updatedAtMs: now,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              lastError: admin.firestore.FieldValue.delete(),
            },
            { merge: true },
          );

          return { state: "claimed", recordId };
        }),
    );
  }

  async markCompleted(input: {
    recordId: string;
    jobId?: string;
    snapshot: IdempotencyResponseSnapshot;
  }): Promise<void> {
    const now = Date.now();
    await this.firestoreCircuitExecutor.executeWrite(
      "idempotency.markCompleted",
      async () =>
        await this.collection.doc(input.recordId).set(
          {
            status: "completed",
            ...(input.jobId ? { jobId: input.jobId } : {}),
            responseSnapshot: input.snapshot,
            lockExpiresAtMs: now,
            expiresAt: new Date(now + this.replayTtlMs),
            updatedAtMs: now,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        ),
    );
  }

  async markFailed(recordId: string, reason: string): Promise<void> {
    const now = Date.now();
    try {
      await this.firestoreCircuitExecutor.executeWrite(
        "idempotency.markFailed",
        async () =>
          await this.collection.doc(recordId).set(
            {
              status: "failed",
              lastError: reason,
              lockExpiresAtMs: now - 1,
              expiresAt: new Date(now + this.replayTtlMs),
              updatedAtMs: now,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          ),
      );
    } catch (error) {
      this.log.warn("Failed to clear idempotency lock after error", {
        recordId,
        reason,
        error: toErrorMessage(error),
      });
    }
  }

  /**
   * Read one claim's response snapshot without claiming it. ADR-0022 decision
   * 6 opens the attachment's persisted state and the client polling that reads
   * it — this is that read, and nothing more: a plain document get that
   * touches no claim, lock, TTL or retry semantics, so the frozen resilience
   * mechanics around it are untouched. A picture return whose attachment is
   * still owed is found through this receipt (issue #135), the same way a clip
   * job's attachment is read through its job record.
   */
  async getResponseSnapshot(input: {
    userId: string;
    route: string;
    key: string;
  }): Promise<IdempotencyResponseSnapshot | null> {
    const recordId = toRecordId(input.userId, input.route, input.key);
    try {
      const doc = await this.collection.doc(recordId).get();
      if (!doc.exists) return null;
      const data = doc.data() as Partial<IdempotencyRecord> | undefined;
      const snapshot = data?.responseSnapshot;
      if (
        !snapshot ||
        typeof snapshot !== "object" ||
        typeof snapshot.statusCode !== "number" ||
        typeof snapshot.body !== "object" ||
        snapshot.body === null
      ) {
        return null;
      }
      return snapshot;
    } catch (error) {
      this.log.warn("Failed to read idempotency response snapshot", {
        route: input.route,
        key: input.key,
        error: toErrorMessage(error),
      });
      return null;
    }
  }
}
