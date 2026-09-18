/**
 * The persistence surface the sketch admission budget consumes (issue #84).
 *
 * Extracted as a port for the same reason StudioProjectStore was: the
 * Firestore adapter's `getFirestore()` field initialiser makes it
 * unconstructable in a unit test. Firestore is the production adapter;
 * tests supply their own.
 *
 * The port is deliberately one method wide. `reserve` is a single
 * compare-and-increment the adapter performs atomically — the service never
 * reads a balance and writes it back, because that split is exactly how two
 * tabs (or two server instances) would both pass a nearly exhausted cap.
 *
 * There is no release, refund, or settle here, and that is a policy
 * decision rather than an omission: the studio ledger refunds failed calls,
 * but a sketch frame that was dispatched already cost money upstream
 * whether or not the browser stayed to collect it (issue #84, "a dispatched
 * request keeps its allowance").
 */

/** Sub-cent accounting unit: 1 cent = 1000 millicents (see SketchBudgetService). */
export interface SketchReservation {
  userId: string;
  /** UTC calendar day, from `sketchBudgetDayKey`. */
  day: string;
  millicents: number;
  capMillicents: number;
}

export interface SketchBudgetStore {
  /**
   * Atomically add `millicents` to the creator's counter for `day`, or throw
   * SketchAllowanceExceededError and write nothing when that would exceed
   * `capMillicents`. Any other rejection means the store could not answer,
   * and the caller must fail closed.
   */
  reserve(reservation: SketchReservation): Promise<void>;
}

export class SketchAllowanceExceededError extends Error {
  constructor(
    public readonly reservedMillicents: number,
    public readonly requestedMillicents: number,
    public readonly capMillicents: number,
  ) {
    super(
      `Daily sketch allowance reached (${reservedMillicents} + ${requestedMillicents} millicents > ${capMillicents} cap)`,
    );
    this.name = "SketchAllowanceExceededError";
  }
}

/**
 * The reset boundary: a UTC calendar day, e.g. "2026-09-17" — the same
 * boundary the studio's daily cap uses, so a creator's two daily allowances
 * roll over together.
 */
export function sketchBudgetDayKey(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** Epoch ms of the next UTC midnight — when the day's allowance returns. */
export function sketchBudgetResetAtMs(at: Date): number {
  return Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() + 1);
}
