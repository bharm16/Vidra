/**
 * Owner of the reserve→settle invariant for spend-bearing studio turns.
 *
 * A turn's cents are reserved against the daily cap before any provider
 * call, and released when the calls settle. Before this module the two
 * halves were separate calls joined by convention, with the turn's real
 * work sitting between them outside any protection: anything that threw
 * there (signed-URL minting, registry lookups, input shaping) left the
 * cents reserved forever and the turn stuck at `status: "running"` — a
 * state the client polls with no terminal condition.
 *
 * Here the work runs INSIDE the reservation, so there is no unprotected
 * region: settle exactly once on the happy path, and a `finally` that
 * settles a crashed turn as failed with a full refund. Callers report
 * outcomes; the ledger owns every cent of arithmetic.
 */

import { logger } from "@infrastructure/Logger";
import {
  studioUsageDayKey,
  type FirestoreStudioProjectStore,
} from "./storage/FirestoreStudioProjectStore";
import type { StudioCallRecord, StudioTurnRecord } from "./types";

/** The only thing a turn's work can do with its reservation. */
export interface StudioReservation {
  /**
   * Terminal settlement: refunds the failed calls' cents and finalizes the
   * turn record. Exactly one settlement happens per reservation — calling
   * this is what tells the ledger the turn did not crash.
   */
  settle(outcomes: readonly StudioCallRecord[]): Promise<void>;
}

export interface StudioSpendLedgerDeps {
  store: FirestoreStudioProjectStore;
  dailyCapCents: number;
  now: () => Date;
}

export class StudioSpendLedger {
  private readonly store: FirestoreStudioProjectStore;
  private readonly dailyCapCents: number;
  private readonly now: () => Date;
  private readonly log = logger.child({ service: "StudioSpendLedger" });

  constructor(deps: StudioSpendLedgerDeps) {
    this.store = deps.store;
    this.dailyCapCents = deps.dailyCapCents;
    this.now = deps.now;
  }

  /**
   * Reserve the turn's estimated cost atomically (throws
   * StudioCapExceededError and writes nothing when the cap would be
   * exceeded), then run `work` inside the protected region.
   *
   * Resolves as soon as the reservation commits — the returned `completion`
   * settles when the background work does. Routes ignore it; tests await it.
   */
  async reserve(
    turn: StudioTurnRecord,
    work: (reservation: StudioReservation) => Promise<void>,
  ): Promise<{ completion: Promise<void> }> {
    const day = studioUsageDayKey(this.now());
    await this.store.reserveTurn({
      turn,
      day,
      capCents: this.dailyCapCents,
    });

    // Reservations are per-call by construction: reservedCents is the
    // per-call cost times the number of call slots.
    const perCallCents = turn.reservedCents / Math.max(1, turn.calls.length);
    let settlementStarted = false;

    const reservation: StudioReservation = {
      settle: async (outcomes) => {
        // Marked on ENTRY, not on success: a settlement that fails halfway
        // must not be retried by the crash path, which would refund twice.
        settlementStarted = true;
        await this.settle(turn, day, perCallCents, outcomes);
      },
    };

    const completion = (async () => {
      let crashCause: unknown;
      try {
        await work(reservation);
      } catch (error) {
        crashCause = error;
        this.log.error(
          "Studio turn execution crashed",
          error instanceof Error ? error : new Error(String(error)),
          { projectId: turn.projectId, turnId: turn.id, userId: turn.userId },
        );
      } finally {
        // Work that returned without settling (an early return, a branch
        // that forgot) is a crash by another name: the cents are still
        // reserved and the turn still reads "running".
        if (!settlementStarted) {
          await this.settleCrash(turn, day, perCallCents, crashCause);
        }
      }
    })();

    return { completion };
  }

  /** Refund the failed calls' cents, then write the turn's terminal record. */
  private async settle(
    turn: StudioTurnRecord,
    day: string,
    perCallCents: number,
    outcomes: readonly StudioCallRecord[],
  ): Promise<void> {
    const failedCount = outcomes.filter(
      (call) => call.status === "failed",
    ).length;
    const succeededCount = outcomes.length - failedCount;
    // Failed calls never consume cap (plan: "Refunds").
    const refundedCents = Math.round(failedCount * perCallCents);

    if (refundedCents > 0) {
      await this.store.refundCents(turn.userId, day, refundedCents);
    }

    await this.store.finalizeTurn(turn.projectId, turn.id, {
      status:
        succeededCount === 0
          ? "failed"
          : failedCount > 0
            ? "partial"
            : "complete",
      calls: [...outcomes],
      refundedCents,
      updatedAtMs: this.now().getTime(),
    });
  }

  /**
   * Settle a turn whose work never reported: every reserved call becomes a
   * failure, so the reservation refunds in full and the turn reaches a
   * terminal status the client's poll can stop on.
   *
   * A store failure here cannot propagate — `completion` is fire-and-forget
   * for routes, and an unhandled rejection would take down the process.
   */
  private async settleCrash(
    turn: StudioTurnRecord,
    day: string,
    perCallCents: number,
    cause: unknown,
  ): Promise<void> {
    const message =
      cause instanceof Error
        ? cause.message
        : cause !== undefined
          ? String(cause)
          : "Turn execution ended without settling";

    try {
      await this.settle(
        turn,
        day,
        perCallCents,
        turn.calls.map((call) => ({
          index: call.index,
          status: "failed" as const,
          error: message,
        })),
      );
    } catch (error) {
      this.log.error(
        "Studio turn crash settlement failed — cents stay reserved",
        error instanceof Error ? error : new Error(String(error)),
        { projectId: turn.projectId, turnId: turn.id, userId: turn.userId },
      );
    }
  }
}
