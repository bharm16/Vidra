/**
 * Firestore persistence for the sketch relay's daily admission counter
 * (issue #84).
 *
 * Layout:
 *   sketch_usage/{userId}_{day} — per-creator-per-UTC-day reserved millicents
 *
 * The cap is enforced INSIDE a transaction: the counter read, the cap check,
 * and the increment commit together or not at all. Two tabs — or two server
 * instances behind the load balancer — cannot both pass a nearly exhausted
 * cap, because Firestore retries the loser against the updated counter and
 * the check re-runs. This is the same admission primitive the studio's spend
 * cap uses (FirestoreStudioProjectStore.reserveTurn); it is reproduced rather
 * than imported because the studio's version is fused to a turn-record write
 * and carries refund semantics this surface must not have.
 */

import { getFirestore } from "@infrastructure/firebaseAdmin";
import {
  SketchAllowanceExceededError,
  type SketchBudgetStore,
  type SketchReservation,
} from "./SketchBudgetStore";

interface StoredSketchUsage {
  userId: string;
  day: string;
  reservedMillicents: number;
}

export class FirestoreSketchBudgetStore implements SketchBudgetStore {
  private readonly db = getFirestore();
  private readonly usage = this.db.collection("sketch_usage");

  async reserve(reservation: SketchReservation): Promise<void> {
    const { userId, day, millicents, capMillicents } = reservation;
    const usageRef = this.usage.doc(`${userId}_${day}`);

    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(usageRef);
      const reservedMillicents = snapshot.exists
        ? ((snapshot.data() as StoredSketchUsage).reservedMillicents ?? 0)
        : 0;

      if (reservedMillicents + millicents > capMillicents) {
        throw new SketchAllowanceExceededError(
          reservedMillicents,
          millicents,
          capMillicents,
        );
      }

      const payload: StoredSketchUsage = {
        userId,
        day,
        reservedMillicents: reservedMillicents + millicents,
      };
      transaction.set(usageRef, payload);
    });
  }
}
