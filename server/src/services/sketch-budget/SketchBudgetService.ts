/**
 * Admission budget for the realtime sketch relay (issue #84).
 *
 * Owns one decision: may this creator dispatch one more sketch frame today?
 * The estimated cost is reserved against a shared, per-creator daily counter
 * BEFORE the relay calls fal, so the cap bounds requests actually sent rather
 * than requests that happened to come back.
 *
 * Three things this deliberately is NOT:
 *
 *  - It is not billing. Reservations are estimates; nothing here reconciles
 *    against an invoice, and no credit or payment code is involved (ADR-0010).
 *  - It is not settled. A frame that was dispatched keeps its allowance
 *    whether the browser disconnected, the watchdog aborted, or fal timed out
 *    ambiguously — all three may still have cost money upstream. This is the
 *    one place the studio's spend ledger must NOT be copied: its refund of
 *    failed calls is the wrong policy for an interactive relay.
 *  - It is not process-local. The counter lives in the injected store, so
 *    concurrent tabs and multiple server instances share one cap.
 *
 * Accounting unit: millicents (1 cent = 1000). A sketch frame costs far less
 * than a cent, and rounding it up to whole cents would shrink a creator's
 * real allowance several-fold.
 */

import { logger } from "@infrastructure/Logger";
import {
  SketchAllowanceExceededError,
  sketchBudgetDayKey,
  sketchBudgetResetAtMs,
  type SketchBudgetStore,
} from "./storage/SketchBudgetStore";

const MILLICENTS_PER_CENT = 1000;

export type SketchAdmission =
  | { outcome: "admitted" }
  /** Today's allowance is spent; `resetAtMs` is the next UTC midnight. */
  | { outcome: "allowance-reached"; resetAtMs: number }
  /** The budget could not be read or written — the caller must not dispatch. */
  | { outcome: "budget-unavailable" };

export interface SketchBudgetServiceDeps {
  store: SketchBudgetStore;
  /** Dollar-denominated daily cap, in cents (SKETCH_DAILY_SPEND_CAP_CENTS). */
  dailyCapCents: number;
  /** Estimated cost of one frame (SKETCH_FRAME_COST_MILLICENTS). */
  frameCostMillicents: number;
  now: () => Date;
}

export class SketchBudgetService {
  private readonly store: SketchBudgetStore;
  private readonly capMillicents: number;
  private readonly frameCostMillicents: number;
  private readonly now: () => Date;
  private readonly log = logger.child({ service: "SketchBudgetService" });

  constructor(deps: SketchBudgetServiceDeps) {
    this.store = deps.store;
    this.capMillicents = deps.dailyCapCents * MILLICENTS_PER_CENT;
    this.frameCostMillicents = deps.frameCostMillicents;
    this.now = deps.now;
  }

  /**
   * Reserve one frame's estimated cost for `userId`. The reservation is the
   * admission: an `admitted` outcome means the cost is already counted, so a
   * caller that then declines to dispatch has spent allowance for nothing.
   */
  async admit(userId: string): Promise<SketchAdmission> {
    const at = this.now();
    try {
      await this.store.reserve({
        userId,
        day: sketchBudgetDayKey(at),
        millicents: this.frameCostMillicents,
        capMillicents: this.capMillicents,
      });
      return { outcome: "admitted" };
    } catch (error) {
      if (error instanceof SketchAllowanceExceededError) {
        return {
          outcome: "allowance-reached",
          resetAtMs: sketchBudgetResetAtMs(at),
        };
      }
      // Fail closed: an unreadable budget is not an open one.
      this.log.error(
        "Sketch budget store unavailable — refusing the frame",
        error instanceof Error ? error : new Error(String(error)),
        { userId },
      );
      return { outcome: "budget-unavailable" };
    }
  }
}
