import { admin, getFirestore } from "@infrastructure/firebaseAdmin";
import { logger } from "@infrastructure/Logger";
import {
  FirestoreCircuitExecutor,
  getFirestoreCircuitExecutor,
} from "@services/firestore/FirestoreCircuitExecutor";

import type { RefundCreditsOptions } from "./ports";

type TransactionPayloadInput = {
  type: "refund";
  amount: number;
  source?: string | undefined;
  reason?: string | undefined;
  referenceId?: string | undefined;
  createdAtMs?: number | undefined;
};

export class LegacyCreditRefundService {
  private readonly db = getFirestore();
  private readonly collection = this.db.collection("users");
  private readonly refundCollection = this.db.collection("credit_refunds");
  private readonly firestoreCircuitExecutor: FirestoreCircuitExecutor;

  constructor(
    firestoreCircuitExecutor: FirestoreCircuitExecutor = getFirestoreCircuitExecutor(),
  ) {
    this.firestoreCircuitExecutor = firestoreCircuitExecutor;
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
}
