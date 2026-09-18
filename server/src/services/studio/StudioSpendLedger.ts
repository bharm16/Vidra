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
 * settles a crashed turn from its own records. Callers report outcomes; the
 * ledger owns every cent of arithmetic.
 *
 * The `finally` only fires while the process lives (#126). A process DEATH
 * runs no `finally` — so settlement is also made durable and repeatable:
 * `settle` is one idempotent atomic unit at the store, and `recoverTurn`
 * lets a later reader terminate a turn a dead process abandoned, from the
 * turn's own checkpointed records, keeping the siblings that succeeded.
 */

import { logger } from "@infrastructure/Logger";
import { studioUsageDayKey } from "./storage/FirestoreStudioProjectStore";
import type { StudioProjectStore } from "./storage/StudioProjectStore";
import type {
  StudioCallRecord,
  StudioTurnRecord,
  StudioTurnStatus,
} from "./types";

/** The only thing a turn's work can do with its reservation. */
export interface StudioReservation {
  /**
   * Terminal settlement: releases the unspent calls' cents and finalizes the
   * turn record. Exactly one settlement takes effect per turn — settlement is
   * idempotent at the store, so calling this is what tells the ledger the turn
   * did not crash, but a second application (a crash-path or recovery replay)
   * is a safe no-op rather than a double refund.
   */
  settle(outcomes: readonly StudioCallRecord[]): Promise<void>;
}

export interface StudioSpendLedgerDeps {
  store: StudioProjectStore;
  dailyCapCents: number;
  now: () => Date;
}

/**
 * The usage day a turn's reservation was made against — derived from the
 * turn's own creation instant, not from "now". Reserve, in-process settle, and
 * a cross-process recovery all compute it the same way, so a refund always
 * credits the exact counter the reservation debited, with no stored field to
 * keep in sync.
 */
function usageDayOf(turn: StudioTurnRecord): string {
  return studioUsageDayKey(new Date(turn.createdAtMs));
}

/** Per-call reserved cost: the reservation is the per-call cost × call slots. */
function perCallCentsOf(turn: StudioTurnRecord): number {
  return turn.reservedCents / Math.max(1, turn.calls.length);
}

/**
 * The cents to release. A call is refunded only when it failed AND the
 * provider did no billable work. A provider that produced output the studio
 * then failed to store (`providerSpent`) is NOT refunded — the allowance was
 * consumed even though no image survives (#126, ADR-0022 decision 8). Failed
 * calls otherwise never consume cap (plan: "Refunds").
 */
function refundCentsFor(
  calls: readonly StudioCallRecord[],
  perCallCents: number,
): number {
  const releasable = calls.filter(
    (call) => call.status === "failed" && !call.providerSpent,
  ).length;
  return Math.round(releasable * perCallCents);
}

/**
 * The turn's terminal status from its settled calls: `failed` when nothing
 * succeeded, `partial` when some did, `complete` when all did. A
 * provider-succeeded-but-unstored call is `status: "failed"` (no usable
 * image), so it counts toward `failed` here even though it kept its cents.
 */
function statusOf(calls: readonly StudioCallRecord[]): StudioTurnStatus {
  const failedCount = calls.filter((call) => call.status === "failed").length;
  const succeededCount = calls.length - failedCount;
  return succeededCount === 0
    ? "failed"
    : failedCount > 0
      ? "partial"
      : "complete";
}

export class StudioSpendLedger {
  private readonly store: StudioProjectStore;
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
    await this.store.reserveTurn({
      turn,
      day: usageDayOf(turn),
      capCents: this.dailyCapCents,
    });

    let settlementStarted = false;

    const reservation: StudioReservation = {
      settle: async (outcomes) => {
        // Marked on ENTRY, not on success: it only suppresses the crash
        // `finally` from re-settling in this process. Correctness against a
        // genuine double-apply lives at the store's idempotency guard, not
        // here.
        settlementStarted = true;
        await this.settle(turn, outcomes);
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
        // Work that returned without settling (an early return, a branch that
        // forgot, or a throw) is a crash by another name: the cents are still
        // reserved and the turn still reads "running".
        if (!settlementStarted) {
          await this.settleCrash(turn, crashCause);
        }
      }
    })();

    return { completion };
  }

  /**
   * Terminal settlement from the KNOWN outcomes the work reported (the happy
   * path). One idempotent atomic write at the store releases the unspent cents
   * and finalizes the turn together.
   */
  private async settle(
    turn: StudioTurnRecord,
    outcomes: readonly StudioCallRecord[],
  ): Promise<void> {
    const perCallCents = perCallCentsOf(turn);
    await this.store.settleTurn({
      projectId: turn.projectId,
      turnId: turn.id,
      userId: turn.userId,
      day: usageDayOf(turn),
      refundCents: refundCentsFor(outcomes, perCallCents),
      status: statusOf(outcomes),
      calls: outcomes,
      updatedAtMs: this.now().getTime(),
    });
  }

  /**
   * Settle a turn from its OWN records: read the latest turn, treat any call
   * still `running` as an interrupted, unspent failure, and settle. This is
   * the one behavior behind both the in-process crash `finally` and a restart
   * recovery — whether the process is dying now or already died, the turn is
   * terminated from what it checkpointed, so calls that succeeded before the
   * interruption are KEPT and only the cents no call spent are released.
   *
   * Reading the LATEST record (not the stale in-memory snapshot the
   * reservation closed over) is what honors those checkpointed siblings.
   */
  private async settleFromRecords(
    turn: StudioTurnRecord,
    interruptedError: string,
  ): Promise<{ applied: boolean }> {
    const latest = (await this.store.getTurn(turn.projectId, turn.id)) ?? turn;
    if (latest.status !== "running") return { applied: false };

    const calls: StudioCallRecord[] = latest.calls.map((call) =>
      call.status === "running"
        ? {
            index: call.index,
            status: "failed" as const,
            error: interruptedError,
          }
        : call,
    );

    return this.store.settleTurn({
      projectId: latest.projectId,
      turnId: latest.id,
      userId: latest.userId,
      day: usageDayOf(latest),
      refundCents: refundCentsFor(calls, perCallCentsOf(latest)),
      status: statusOf(calls),
      calls,
      updatedAtMs: this.now().getTime(),
    });
  }

  /**
   * Settle a turn whose work never reported. Its still-running calls become
   * unspent failures, so the reservation refunds them and the turn reaches a
   * terminal status the client's poll can stop on — while any sibling that
   * already checkpointed a success is kept.
   *
   * A store failure here cannot propagate — `completion` is fire-and-forget
   * for routes, and an unhandled rejection would take down the process.
   */
  private async settleCrash(
    turn: StudioTurnRecord,
    cause: unknown,
  ): Promise<void> {
    const message =
      cause instanceof Error
        ? cause.message
        : cause !== undefined
          ? String(cause)
          : "Turn execution ended without settling";

    try {
      await this.settleFromRecords(turn, message);
    } catch (error) {
      this.log.error(
        "Studio turn crash settlement failed — cents stay reserved",
        error instanceof Error ? error : new Error(String(error)),
        { projectId: turn.projectId, turnId: turn.id, userId: turn.userId },
      );
    }
  }

  /**
   * Recover a turn found still `running` after a restart: settle it from its
   * own checkpointed records, keeping the siblings that succeeded and
   * releasing only the cents no provider call spent. Idempotent via the
   * store's guard, so two racing readers — or a client re-poll — still produce
   * exactly ONE refund and ONE finalization. Unlike the crash `finally`, this
   * is called by a live reader after the producing process is gone, so it
   * throws on a store fault (the reader logs and retries on the next read)
   * rather than swallowing it.
   */
  async recoverTurn(turn: StudioTurnRecord): Promise<{ applied: boolean }> {
    return this.settleFromRecords(turn, "Recovered after an interrupted turn");
  }
}
