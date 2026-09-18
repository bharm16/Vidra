import { sha256Hex } from "@utils/hash";
import { admin, getFirestore } from "@infrastructure/firebaseAdmin";
import {
  FirestoreCircuitExecutor,
  getFirestoreCircuitExecutor,
} from "@services/firestore/FirestoreCircuitExecutor";
import type { TakeAttachment } from "@shared/schemas/attachment.schemas";
import type {
  OwedTakeAttachment,
  OwedTakeAttachmentInput,
  OwedTakeAttachmentStore,
} from "./attachTakeWithOwedTracking";

/**
 * The durable ledger of quick-picture takes whose session write is still owed —
 * the persisted attachment state ADR-0022 decision 6 opens, the picture
 * analogue of `video_jobs.attachment`. A generated take is not admitted, so it
 * has no idempotency snapshot to resume from; this is where its debt lives until
 * a reloaded client discovers and repairs it.
 *
 * Keyed by generation id (the take identity), with an `ownerSessionKey` digest
 * so a session's owed takes are found with a single equality filter and no
 * composite index — the same index-free shape `RequestIdempotencyService` and
 * `VideoJobStore.findPendingAttachments` use. Entries carry a TTL so a debt that
 * is never repaired (its session was deleted, say) does not linger forever.
 *
 * It is NOT a decision-8 "operations" collection: it stores no provenance and
 * schedules no work, and an `attached` take is deleted from it — the session
 * becomes the single source of truth the moment the write lands.
 */

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIST_LIMIT = 50;

function ownerSessionKey(userId: string, sessionId: string): string {
  return sha256Hex(`${userId}|${sessionId}`);
}

interface OwedAttachmentDoc {
  generationId: string;
  userId: string;
  sessionId: string;
  promptVersionId: string;
  ownerSessionKey: string;
  state: "pending" | "failed";
  reason?: string;
  record: Record<string, unknown>;
  updatedAtMs: number;
  expiresAt: Date;
}

function toOwed(data: OwedAttachmentDoc): OwedTakeAttachment {
  return {
    userId: data.userId,
    generationId: data.generationId,
    sessionId: data.sessionId,
    promptVersionId: data.promptVersionId,
    state: data.state === "failed" ? "failed" : "pending",
    ...(data.reason ? { reason: data.reason } : {}),
    record: data.record,
  };
}

export class FirestoreOwedTakeAttachmentStore
  implements OwedTakeAttachmentStore
{
  private readonly db = getFirestore();
  private readonly collection = this.db.collection("owed_take_attachments");
  private readonly firestoreCircuitExecutor: FirestoreCircuitExecutor;
  private readonly ttlMs: number;
  private readonly listLimit: number;

  constructor(
    firestoreCircuitExecutor: FirestoreCircuitExecutor = getFirestoreCircuitExecutor(),
    options?: { ttlMs?: number; listLimit?: number },
  ) {
    this.firestoreCircuitExecutor = firestoreCircuitExecutor;
    this.ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
    this.listLimit = options?.listLimit ?? DEFAULT_LIST_LIMIT;
  }

  async recordOwedPending(input: OwedTakeAttachmentInput): Promise<void> {
    const now = Date.now();
    await this.firestoreCircuitExecutor.executeWrite(
      "owedTakeAttachment.recordOwedPending",
      async () =>
        await this.collection.doc(input.generationId).set(
          {
            generationId: input.generationId,
            userId: input.userId,
            sessionId: input.sessionId,
            promptVersionId: input.promptVersionId,
            ownerSessionKey: ownerSessionKey(input.userId, input.sessionId),
            state: "pending",
            record: input.record,
            reason: admin.firestore.FieldValue.delete(),
            updatedAtMs: now,
            expiresAt: new Date(now + this.ttlMs),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        ),
    );
  }

  async settleOwed(
    input: OwedTakeAttachmentInput,
    attachment: TakeAttachment,
  ): Promise<void> {
    if (attachment.state === "attached") {
      // Cleared: the session is now the source of truth for the take, so the
      // debt must not be rediscoverable on the next reload.
      await this.firestoreCircuitExecutor.executeWrite(
        "owedTakeAttachment.settleOwed.attached",
        async () => await this.collection.doc(input.generationId).delete(),
      );
      return;
    }

    const now = Date.now();
    await this.firestoreCircuitExecutor.executeWrite(
      "owedTakeAttachment.settleOwed.failed",
      async () =>
        await this.collection.doc(input.generationId).set(
          {
            generationId: input.generationId,
            userId: input.userId,
            sessionId: input.sessionId,
            promptVersionId: input.promptVersionId,
            ownerSessionKey: ownerSessionKey(input.userId, input.sessionId),
            state: "failed",
            reason: attachment.reason ?? "session append failed",
            record: input.record,
            updatedAtMs: now,
            expiresAt: new Date(now + this.ttlMs),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        ),
    );
  }

  async listOwedForSession(
    userId: string,
    sessionId: string,
  ): Promise<OwedTakeAttachment[]> {
    const snapshot = await this.firestoreCircuitExecutor.executeRead(
      "owedTakeAttachment.listOwedForSession",
      async () =>
        await this.collection
          .where("ownerSessionKey", "==", ownerSessionKey(userId, sessionId))
          .limit(this.listLimit)
          .get(),
    );
    if (snapshot.empty) return [];
    return (
      snapshot.docs
        .map((doc) => doc.data() as OwedAttachmentDoc)
        // The digest is not a security boundary — re-check the plain uid so a
        // (vanishingly unlikely) collision cannot leak another creator's debt.
        .filter((data) => data.userId === userId)
        .map(toOwed)
    );
  }

  async getOwned(
    userId: string,
    generationId: string,
  ): Promise<OwedTakeAttachment | undefined> {
    const snapshot = await this.firestoreCircuitExecutor.executeRead(
      "owedTakeAttachment.getOwned",
      async () => await this.collection.doc(generationId).get(),
    );
    if (!snapshot.exists) return undefined;
    const data = snapshot.data() as OwedAttachmentDoc | undefined;
    if (!data || data.userId !== userId) return undefined;
    return toOwed(data);
  }
}
