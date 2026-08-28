import type { RefundCreditsOptions } from "./UserCreditService";

/**
 * Structural ports over UserCreditService for its active-loop consumers.
 *
 * The concrete class constructs Firestore at field-initialisation time, so
 * nothing outside DI can hold a real instance without Firebase Admin — which
 * previously forced every route test to smuggle stubs past the concrete type
 * with `as never`. Seams that only need a slice of the credit surface declare
 * that slice here; UserCreditService satisfies both ports structurally.
 *
 * NOTE: refundGuard.ts and RefundFailureStore.ts in this directory are HOT
 * ACTIVE code (first-frame image generation refunds) despite living beside
 * the ADR-0002-frozen economics stack — never sweep them as frozen.
 */
export interface CreditRefunder {
  refundCredits(
    userId: string,
    cost: number,
    options?: RefundCreditsOptions,
  ): Promise<boolean>;
}

/** The credit operations the generation routes depend on. */
export interface RouteCreditService extends CreditRefunder {
  reserveCredits(userId: string, cost: number): Promise<boolean>;
  getBalance(userId: string): Promise<number>;
  checkAndReserveInTransaction(
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
  >;
}
