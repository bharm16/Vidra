import { admin, getFirestore } from "@infrastructure/firebaseAdmin";
import { logger } from "@infrastructure/Logger";
import { isApiKeyUid } from "@utils/apiKeyUser";
import {
  FirestoreCircuitExecutor,
  getFirestoreCircuitExecutor,
} from "@services/firestore/FirestoreCircuitExecutor";

const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 100;
const DEFAULT_STARTER_CREDITS = 25;

export type CreditTransactionType =
  | "reserve"
  | "refund"
  | "add"
  | "starter_grant";

export interface CreditTransactionRecord {
  id: string;
  type: string;
  amount: number;
  source: string | null;
  reason: string | null;
  referenceId: string | null;
  createdAtMs: number;
}

export interface StarterGrantInfo {
  starterGrantCredits: number | null;
  starterGrantGrantedAtMs: number | null;
}

export interface RefundCreditsOptions {
  refundKey: string;
  reason?: string;
}

export interface AddCreditsOptions {
  source?: string;
  reason?: string;
  referenceId?: string;
}

type TransactionPayloadInput = {
  type: CreditTransactionType;
  amount: number;
  source?: string | undefined;
  reason?: string | undefined;
  referenceId?: string | undefined;
  createdAtMs?: number | undefined;
};

export class UserCreditService {
  private readonly db = getFirestore();
  private readonly collection = this.db.collection("users");
  private readonly refundCollection = this.db.collection("credit_refunds");
  private readonly firestoreCircuitExecutor: FirestoreCircuitExecutor;

  constructor(
    firestoreCircuitExecutor: FirestoreCircuitExecutor = getFirestoreCircuitExecutor(),
  ) {
    this.firestoreCircuitExecutor = firestoreCircuitExecutor;
  }

  private sanitizeHistoryLimit(limit: number): number {
    const numericLimit = Number.isFinite(limit)
      ? Math.trunc(limit)
      : DEFAULT_HISTORY_LIMIT;
    if (numericLimit < 1) return DEFAULT_HISTORY_LIMIT;
    return Math.min(numericLimit, MAX_HISTORY_LIMIT);
  }

  private sanitizeStarterCredits(starterCredits: number): number {
    const numeric = Number.isFinite(starterCredits)
      ? Math.trunc(starterCredits)
      : DEFAULT_STARTER_CREDITS;
    if (numeric <= 0) return DEFAULT_STARTER_CREDITS;
    return numeric;
  }

  private buildTransactionPayload(
    input: TransactionPayloadInput,
  ): Record<string, unknown> {
    const createdAtMs = input.createdAtMs ?? Date.now();
    return {
      type: input.type,
      amount: Math.trunc(input.amount),
      ...(input.source ? { source: input.source } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.referenceId ? { referenceId: input.referenceId } : {}),
      createdAtMs,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
  }

  private writeTransaction(
    transaction: FirebaseFirestore.Transaction,
    userRef: FirebaseFirestore.DocumentReference,
    payload: Record<string, unknown>,
  ): void {
    const transactionRef = userRef.collection("credit_transactions").doc();
    transaction.set(transactionRef, payload);
  }

  /**
   * Check-and-reserve credits inside an externally-provided Firestore transaction.
   * The caller opens the transaction; this method queues the balance read plus the
   * decrement/ledger writes, enabling atomic composition with other writes (e.g.
   * creating a job record in the same transaction).
   *
   * Must be called before any non-read operations on the passed transaction
   * (Firestore requires all reads to precede all writes).
   */
  async checkAndReserveInTransaction(
    transaction: FirebaseFirestore.Transaction,
    userId: string,
    cost: number,
    options?: {
      source?: string;
      reason?: string;
      referenceId?: string;
    },
  ): Promise<
    | { ok: true }
    | { ok: false; reason: "user_not_found" | "insufficient_credits" }
  > {
    const userRef = this.collection.doc(userId);
    const normalizedCost = Math.max(0, Math.trunc(cost));

    const snapshot = await transaction.get(userRef);
    if (!snapshot.exists) {
      return { ok: false, reason: "user_not_found" };
    }

    const data = snapshot.data();
    const currentCredits = typeof data?.credits === "number" ? data.credits : 0;
    if (currentCredits < normalizedCost) {
      return { ok: false, reason: "insufficient_credits" };
    }

    if (normalizedCost > 0) {
      transaction.update(userRef, {
        credits: admin.firestore.FieldValue.increment(-normalizedCost),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      this.writeTransaction(
        transaction,
        userRef,
        this.buildTransactionPayload({
          type: "reserve",
          amount: -normalizedCost,
          source: options?.source ?? "generation",
          reason: options?.reason,
          referenceId: options?.referenceId,
        }),
      );
    }

    return { ok: true };
  }

  /**
   * Checks if a user has enough credits and reserves them in a transaction.
   * Deducts immediately to prevent double-spending during long-running generations.
   */
  async reserveCredits(userId: string, cost: number): Promise<boolean> {
    const userRef = this.collection.doc(userId);
    const normalizedCost = Math.max(0, Math.trunc(cost));

    try {
      return await this.firestoreCircuitExecutor.executeWrite(
        "credits.reserveCredits",
        async () =>
          await this.db.runTransaction(async (transaction) => {
            const snapshot = await transaction.get(userRef);

            if (!snapshot.exists) {
              return false;
            }

            const data = snapshot.data();
            const currentCredits = data?.credits ?? 0;

            if (currentCredits < normalizedCost) {
              return false;
            }

            transaction.update(userRef, {
              credits: admin.firestore.FieldValue.increment(-normalizedCost),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            this.writeTransaction(
              transaction,
              userRef,
              this.buildTransactionPayload({
                type: "reserve",
                amount: -normalizedCost,
                source: "generation",
              }),
            );

            return true;
          }),
      );
    } catch (error) {
      logger.error("Credit reservation failed", error as Error, {
        userId,
        cost: normalizedCost,
      });
      throw new Error("Failed to process credit transaction");
    }
  }

  /**
   * Refund credits when a generation fails.
   */
  async refundCredits(
    userId: string,
    cost: number,
    options?: RefundCreditsOptions,
  ): Promise<boolean> {
    const normalizedCost = Math.max(0, Math.trunc(cost));
    if (normalizedCost <= 0) {
      return true;
    }

    try {
      const refundKey = options?.refundKey?.trim();
      const userRef = this.collection.doc(userId);

      if (!refundKey) {
        await this.firestoreCircuitExecutor.executeWrite(
          "credits.refundCredits.noKey",
          async () =>
            await this.db.runTransaction(async (transaction) => {
              const snapshot = await transaction.get(userRef);
              if (!snapshot.exists) {
                throw new Error(`Missing user: ${userId}`);
              }

              transaction.update(userRef, {
                credits: admin.firestore.FieldValue.increment(normalizedCost),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });

              this.writeTransaction(
                transaction,
                userRef,
                this.buildTransactionPayload({
                  type: "refund",
                  amount: normalizedCost,
                  source: "generation",
                  reason: options?.reason,
                }),
              );
            }),
        );

        return true;
      }

      const refundRef = this.refundCollection.doc(refundKey);

      await this.firestoreCircuitExecutor.executeWrite(
        "credits.refundCredits.idempotent",
        async () =>
          await this.db.runTransaction(async (transaction) => {
            const existingRefund = await transaction.get(refundRef);
            if (existingRefund.exists) {
              return;
            }

            const userSnapshot = await transaction.get(userRef);
            if (!userSnapshot.exists) {
              throw new Error(`Missing user: ${userId}`);
            }

            transaction.update(userRef, {
              credits: admin.firestore.FieldValue.increment(normalizedCost),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            transaction.set(refundRef, {
              refundKey,
              userId,
              amount: normalizedCost,
              ...(options?.reason ? { reason: options.reason } : {}),
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            this.writeTransaction(
              transaction,
              userRef,
              this.buildTransactionPayload({
                type: "refund",
                amount: normalizedCost,
                source: "generation",
                reason: options?.reason,
                referenceId: refundKey,
              }),
            );
          }),
      );

      return true;
    } catch (error) {
      logger.error("Credit refund failed", error as Error, {
        userId,
        cost: normalizedCost,
        refundKey: options?.refundKey,
      });
      return false;
    }
  }

  async getBalance(userId: string): Promise<number> {
    const snapshot = await this.firestoreCircuitExecutor.executeRead(
      "credits.getBalance",
      async () => await this.collection.doc(userId).get(),
    );
    return snapshot.data()?.credits ?? 0;
  }

  /**
   * Adds credits to a user's balance in a transaction-safe way.
   * Creates the user document if it does not exist.
   */
  async addCredits(
    userId: string,
    amount: number,
    options?: AddCreditsOptions,
  ): Promise<void> {
    const userRef = this.collection.doc(userId);
    const normalizedAmount = Math.trunc(amount);

    if (normalizedAmount <= 0) {
      logger.warn("Skipping addCredits because amount is not positive", {
        userId,
        amount: normalizedAmount,
      });
      return;
    }

    try {
      await this.firestoreCircuitExecutor.executeWrite(
        "credits.addCredits",
        async () =>
          await this.db.runTransaction(async (transaction) => {
            const snapshot = await transaction.get(userRef);

            if (!snapshot.exists) {
              transaction.set(userRef, {
                credits: normalizedAmount,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
            } else {
              transaction.update(userRef, {
                credits: admin.firestore.FieldValue.increment(normalizedAmount),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
            }

            this.writeTransaction(
              transaction,
              userRef,
              this.buildTransactionPayload({
                type: "add",
                amount: normalizedAmount,
                source: options?.source ?? "billing",
                reason: options?.reason,
                referenceId: options?.referenceId,
              }),
            );
          }),
      );

      logger.info("Credits added successfully", {
        userId,
        amount: normalizedAmount,
      });
    } catch (error) {
      logger.error("Failed to add credits", error as Error, {
        userId,
        amount: normalizedAmount,
      });
      throw new Error("Transaction failed");
    }
  }

  async ensureStarterGrant(
    userId: string,
    starterCredits: number,
  ): Promise<boolean> {
    if (isApiKeyUid(userId)) {
      return false;
    }

    const resolvedStarterCredits = this.sanitizeStarterCredits(starterCredits);
    const userRef = this.collection.doc(userId);

    try {
      return await this.firestoreCircuitExecutor.executeWrite(
        "credits.ensureStarterGrant",
        async () =>
          await this.db.runTransaction(async (transaction) => {
            const snapshot = await transaction.get(userRef);
            if (snapshot.exists) {
              return false;
            }

            const now = Date.now();

            transaction.set(userRef, {
              credits: resolvedStarterCredits,
              starterGrantCredits: resolvedStarterCredits,
              starterGrantGrantedAtMs: now,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            this.writeTransaction(
              transaction,
              userRef,
              this.buildTransactionPayload({
                type: "starter_grant",
                amount: resolvedStarterCredits,
                source: "starter-grant",
                reason: "free_tier_starter",
                createdAtMs: now,
              }),
            );

            return true;
          }),
      );
    } catch (error) {
      logger.error("Failed to ensure starter grant", error as Error, {
        userId,
        starterCredits: resolvedStarterCredits,
      });
      throw error;
    }
  }

  async getStarterGrantInfo(userId: string): Promise<StarterGrantInfo> {
    const snapshot = await this.firestoreCircuitExecutor.executeRead(
      "credits.getStarterGrantInfo",
      async () => await this.collection.doc(userId).get(),
    );
    const data = snapshot.data() as Record<string, unknown> | undefined;

    const starterGrantCredits =
      typeof data?.starterGrantCredits === "number" &&
      Number.isFinite(data.starterGrantCredits)
        ? Math.trunc(data.starterGrantCredits)
        : null;
    const starterGrantGrantedAtMs =
      typeof data?.starterGrantGrantedAtMs === "number" &&
      Number.isFinite(data.starterGrantGrantedAtMs)
        ? Math.trunc(data.starterGrantGrantedAtMs)
        : null;

    return {
      starterGrantCredits,
      starterGrantGrantedAtMs,
    };
  }

  async listCreditTransactions(
    userId: string,
    limit: number,
  ): Promise<CreditTransactionRecord[]> {
    const normalizedLimit = this.sanitizeHistoryLimit(limit);

    const snapshot = await this.firestoreCircuitExecutor.executeRead(
      "credits.listCreditTransactions",
      async () =>
        await this.collection
          .doc(userId)
          .collection("credit_transactions")
          .orderBy("createdAtMs", "desc")
          .limit(normalizedLimit)
          .get(),
    );

    return snapshot.docs.map((docSnapshot) => {
      const data = docSnapshot.data() as Record<string, unknown>;
      return {
        id: docSnapshot.id,
        type: typeof data.type === "string" ? data.type : "unknown",
        amount:
          typeof data.amount === "number" && Number.isFinite(data.amount)
            ? data.amount
            : 0,
        source: typeof data.source === "string" ? data.source : null,
        reason: typeof data.reason === "string" ? data.reason : null,
        referenceId:
          typeof data.referenceId === "string" ? data.referenceId : null,
        createdAtMs:
          typeof data.createdAtMs === "number" &&
          Number.isFinite(data.createdAtMs)
            ? Math.trunc(data.createdAtMs)
            : 0,
      };
    });
  }
}
