import { admin, getFirestore } from "@infrastructure/firebaseAdmin";
import { logger } from "@infrastructure/Logger";
import {
  FirestoreCircuitExecutor,
  getFirestoreCircuitExecutor,
} from "@services/firestore/FirestoreCircuitExecutor";

export type CreditRefundFailureStatus =
  | "pending"
  | "processing"
  | "resolved"
  | "escalated";

export interface CreditRefundFailureRecord {
  refundKey: string;
  userId: string;
  amount: number;
  reason?: string;
  status: CreditRefundFailureStatus;
  attempts: number;
  lastError?: string;
  createdAtMs: number;
  updatedAtMs: number;
  processingStartedAtMs?: number;
  resolvedAtMs?: number;
  escalatedAtMs?: number;
  metadata?: Record<string, unknown>;
}

export interface UpsertRefundFailureInput {
  refundKey: string;
  userId: string;
  amount: number;
  reason?: string;
  lastError?: string;
  metadata?: Record<string, unknown>;
}

export class RefundFailureStore {
  private readonly db = getFirestore();
  private readonly collection = this.db.collection("credit_refund_failures");
  private readonly firestoreCircuitExecutor: FirestoreCircuitExecutor;

  constructor(
    firestoreCircuitExecutor: FirestoreCircuitExecutor = getFirestoreCircuitExecutor(),
  ) {
    this.firestoreCircuitExecutor = firestoreCircuitExecutor;
  }

  async upsertFailure(input: UpsertRefundFailureInput): Promise<void> {
    const now = Date.now();
    const docRef = this.collection.doc(input.refundKey);

    try {
      await this.firestoreCircuitExecutor.executeWrite(
        "credits.refundFailure.upsert",
        async () =>
          await this.db.runTransaction(async (transaction) => {
            const snapshot = await transaction.get(docRef);

            if (!snapshot.exists) {
              transaction.set(docRef, {
                refundKey: input.refundKey,
                userId: input.userId,
                amount: input.amount,
                ...(input.reason ? { reason: input.reason } : {}),
                status: "pending" as CreditRefundFailureStatus,
                attempts: 0,
                ...(input.lastError ? { lastError: input.lastError } : {}),
                ...(input.metadata ? { metadata: input.metadata } : {}),
                createdAtMs: now,
                updatedAtMs: now,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
              return;
            }

            const data = snapshot.data();
            if (data?.status === "resolved") {
              return;
            }

            transaction.update(docRef, {
              userId: input.userId,
              amount: input.amount,
              ...(input.reason ? { reason: input.reason } : {}),
              status: "pending" as CreditRefundFailureStatus,
              ...(input.lastError ? { lastError: input.lastError } : {}),
              ...(input.metadata ? { metadata: input.metadata } : {}),
              updatedAtMs: now,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }),
      );
    } catch (error) {
      logger.error("Failed to upsert credit refund failure", error as Error, {
        refundKey: input.refundKey,
        userId: input.userId,
        amount: input.amount,
      });
      throw error;
    }
  }

  async claimNextPending(
    maxAttempts: number,
    _scanLimit?: number,
  ): Promise<CreditRefundFailureRecord | null> {
    try {
      const query = this.collection
        .where("status", "==", "pending")
        .orderBy("updatedAtMs", "asc")
        .limit(1);

      return await this.firestoreCircuitExecutor.executeWrite(
        "credits.refundFailure.claim.transaction",
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
            if (!data || data.status !== "pending") {
              return null;
            }

            const attempts =
              typeof data.attempts === "number" ? data.attempts : 0;
            if (attempts >= maxAttempts) {
              transaction.update(doc.ref, {
                status: "escalated" as CreditRefundFailureStatus,
                escalatedAtMs: Date.now(),
                updatedAtMs: Date.now(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
              return null;
            }

            const now = Date.now();
            transaction.update(doc.ref, {
              status: "processing" as CreditRefundFailureStatus,
              processingStartedAtMs: now,
              updatedAtMs: now,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            return this.toRecord({
              ...data,
              refundKey: doc.id,
              status: "processing",
              processingStartedAtMs: now,
              updatedAtMs: now,
            });
          }),
      );
    } catch (error) {
      logger.error(
        "Failed to claim pending credit refund failure",
        error as Error,
        {
          maxAttempts,
        },
      );
      return null;
    }
  }

  async markResolved(refundKey: string): Promise<void> {
    await this.firestoreCircuitExecutor.executeWrite(
      "credits.refundFailure.markResolved",
      async () =>
        await this.collection.doc(refundKey).set(
          {
            status: "resolved" as CreditRefundFailureStatus,
            resolvedAtMs: Date.now(),
            updatedAtMs: Date.now(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        ),
    );
  }

  async releaseForRetry(refundKey: string, lastError: string): Promise<void> {
    await this.firestoreCircuitExecutor.executeWrite(
      "credits.refundFailure.releaseForRetry",
      async () =>
        await this.db.runTransaction(async (transaction) => {
          const docRef = this.collection.doc(refundKey);
          const snapshot = await transaction.get(docRef);
          if (!snapshot.exists) {
            return;
          }

          const data = snapshot.data();
          if (!data) {
            return;
          }

          const attempts =
            typeof data.attempts === "number" ? data.attempts : 0;
          const now = Date.now();
          transaction.update(docRef, {
            status: "pending" as CreditRefundFailureStatus,
            attempts: attempts + 1,
            lastError,
            updatedAtMs: now,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }),
    );
  }

  async markEscalated(refundKey: string, lastError: string): Promise<void> {
    await this.firestoreCircuitExecutor.executeWrite(
      "credits.refundFailure.markEscalated",
      async () =>
        await this.db.runTransaction(async (transaction) => {
          const docRef = this.collection.doc(refundKey);
          const snapshot = await transaction.get(docRef);
          if (!snapshot.exists) {
            return;
          }

          const data = snapshot.data();
          if (!data) {
            return;
          }

          const attempts =
            typeof data.attempts === "number" ? data.attempts : 0;
          const now = Date.now();
          transaction.update(docRef, {
            status: "escalated" as CreditRefundFailureStatus,
            attempts: attempts + 1,
            lastError,
            escalatedAtMs: now,
            updatedAtMs: now,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }),
    );
  }

  private toRecord(
    data: Record<string, unknown> & { refundKey: string },
  ): CreditRefundFailureRecord {
    return {
      refundKey: data.refundKey,
      userId: String(data.userId ?? ""),
      amount: Number(data.amount ?? 0),
      status: (data.status as CreditRefundFailureStatus) ?? "pending",
      attempts: typeof data.attempts === "number" ? data.attempts : 0,
      createdAtMs:
        typeof data.createdAtMs === "number" ? data.createdAtMs : Date.now(),
      updatedAtMs:
        typeof data.updatedAtMs === "number" ? data.updatedAtMs : Date.now(),
      ...(typeof data.reason === "string" ? { reason: data.reason } : {}),
      ...(typeof data.lastError === "string"
        ? { lastError: data.lastError }
        : {}),
      ...(typeof data.processingStartedAtMs === "number"
        ? { processingStartedAtMs: data.processingStartedAtMs }
        : {}),
      ...(typeof data.resolvedAtMs === "number"
        ? { resolvedAtMs: data.resolvedAtMs }
        : {}),
      ...(typeof data.escalatedAtMs === "number"
        ? { escalatedAtMs: data.escalatedAtMs }
        : {}),
      ...(data.metadata && typeof data.metadata === "object"
        ? { metadata: data.metadata as Record<string, unknown> }
        : {}),
    };
  }
}

let refundFailureStoreInstance: RefundFailureStore | null = null;

export function getRefundFailureStore(): RefundFailureStore {
  if (!refundFailureStoreInstance) {
    refundFailureStoreInstance = new RefundFailureStore();
  }

  return refundFailureStoreInstance;
}

export function setRefundFailureStore(store: RefundFailureStore): void {
  refundFailureStoreInstance = store;
}
