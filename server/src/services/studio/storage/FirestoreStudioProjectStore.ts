/**
 * Firestore persistence for studio projects, turns, and the daily spend
 * counter.
 *
 * Layout (plan: "Firestore document growth"):
 *   studio_projects/{projectId}            — small summary doc
 *   studio_projects/{projectId}/turns/{id} — one doc per turn (subcollection,
 *                                            so long threads never approach
 *                                            the 1 MiB document limit)
 *   studio_usage/{userId_day}              — per-user-per-day reserved cents
 *
 * The spend cap is enforced INSIDE a transaction: the usage counter read,
 * the counter increment, and the turn-record creation commit together or
 * not at all. Two simultaneous submits cannot both pass a nearly-exhausted
 * cap — Firestore retries one of them against the updated counter and it
 * fails the cap check (plan: "Spend cap (atomic, dollar-denominated)").
 */

import { getFirestore } from "@infrastructure/firebaseAdmin";
import type {
  StudioCallRecord,
  StudioProjectRecord,
  StudioTurnRecord,
} from "../types";
import type { StudioProjectStore } from "./StudioProjectStore";

/**
 * The ids of every image a turn's succeeded calls produced. Persisted as a
 * top-level array on the turn doc purely as a query index: Firestore cannot
 * filter on `calls[].image.id` (a sub-property of an object array), so
 * `findTurnByProducedImageId` reaches an image BY IDENTITY through an
 * `array-contains` on this field instead of walking a history page (#121).
 *
 * Derived, never authoritative — `calls` remains the source of truth, and
 * `fromStoredTurn` strips this field on the way out so it never reaches the
 * domain record or the wire.
 */
function producedImageIds(calls: readonly StudioCallRecord[]): string[] {
  const ids: string[] = [];
  for (const call of calls) {
    if (call.status === "succeeded" && call.image) ids.push(call.image.id);
  }
  return ids;
}

export class StudioCapExceededError extends Error {
  public readonly statusCode = 429;

  constructor(
    public readonly reservedCents: number,
    public readonly requestedCents: number,
    public readonly capCents: number,
  ) {
    super(
      `Daily studio limit reached (${reservedCents}¢ reserved + ${requestedCents}¢ requested > ${capCents}¢ cap)`,
    );
    this.name = "StudioCapExceededError";
  }
}

interface StoredUsage {
  userId: string;
  day: string;
  reservedCents: number;
}

/** UTC calendar day, e.g. "2026-07-24" — the cap's reset boundary. */
export function studioUsageDayKey(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** Under Firestore's 500-writes-per-batch limit with headroom. */
const DELETE_BATCH_SIZE = 400;

/**
 * Firestore's gRPC ALREADY_EXISTS status code. `DocumentReference.create()`
 * rejects with it when the document is already present — the signal that a
 * concurrent claim won the id (#127). The Admin SDK surfaces the raw gRPC
 * code, so this is a number rather than a named enum the SDK does not export.
 */
const FIRESTORE_ALREADY_EXISTS = 6;

/** Whether a rejected `create()` failed because the document already existed. */
function isAlreadyExistsError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === FIRESTORE_ALREADY_EXISTS
  );
}

export class FirestoreStudioProjectStore implements StudioProjectStore {
  private readonly db = getFirestore();
  private readonly projects = this.db.collection("studio_projects");
  private readonly usage = this.db.collection("studio_usage");

  private turnsOf(projectId: string) {
    return this.projects.doc(projectId).collection("turns");
  }

  /**
   * Atomically claim the project's document. `create()` (not `set()`) is what
   * makes this create-if-absent: it fails with ALREADY_EXISTS rather than
   * overwriting, so a second concurrent "Refine in the studio" press cannot
   * replace the winner's project (#127). A lost claim answers `false`; every
   * other failure propagates.
   */
  async createProject(record: StudioProjectRecord): Promise<boolean> {
    try {
      await this.projects.doc(record.id).create(this.stripUndefined(record));
      return true;
    } catch (error) {
      if (isAlreadyExistsError(error)) return false;
      throw error;
    }
  }

  async getProject(projectId: string): Promise<StudioProjectRecord | null> {
    const snapshot = await this.projects.doc(projectId).get();
    if (!snapshot.exists) return null;
    return snapshot.data() as StudioProjectRecord;
  }

  async listProjects(
    userId: string,
    limitCount = 50,
  ): Promise<StudioProjectRecord[]> {
    // Ordered server-side by updatedAtMs so the newest project is never
    // dropped when a user has more than one page of them (#121). The earlier
    // equality-only fetch capped at 500 BEFORE an in-memory recency sort, so
    // the newest could fall outside that arbitrary window and vanish from the
    // index. Ordering in the query needs a composite index on
    // (userId, updatedAtMs) — declared in firestore.indexes.json, the same
    // dependency the `sessions` collection already takes for `findByUser`.
    const snapshot = await this.projects
      .where("userId", "==", userId)
      .orderBy("updatedAtMs", "desc")
      .limit(limitCount)
      .get();
    if (snapshot.empty) return [];
    return snapshot.docs.map((doc) => doc.data() as StudioProjectRecord);
  }

  async updateProject(
    projectId: string,
    patch: Partial<StudioProjectRecord>,
  ): Promise<void> {
    await this.projects
      .doc(projectId)
      .set(this.stripUndefined(patch), { merge: true });
  }

  async listTurns(
    projectId: string,
    limitCount = 200,
  ): Promise<StudioTurnRecord[]> {
    const snapshot = await this.turnsOf(projectId)
      .orderBy("createdAtMs", "asc")
      .limit(limitCount)
      .get();
    if (snapshot.empty) return [];
    return snapshot.docs.map((doc) => this.fromStoredTurn(doc.data()));
  }

  async getTurn(
    projectId: string,
    turnId: string,
  ): Promise<StudioTurnRecord | null> {
    const snapshot = await this.turnsOf(projectId).doc(turnId).get();
    if (!snapshot.exists) return null;
    return this.fromStoredTurn(snapshot.data() ?? {});
  }

  /**
   * The turn that produced `imageId`, by identity — an `array-contains` on the
   * denormalized `imageIds` index, so retrieval never depends on where the
   * turn falls in the project's history (#121). Firestore serves this with an
   * automatic single-field index; no composite index is required.
   */
  async findTurnByProducedImageId(
    projectId: string,
    imageId: string,
  ): Promise<StudioTurnRecord | null> {
    const snapshot = await this.turnsOf(projectId)
      .where("imageIds", "array-contains", imageId)
      .limit(1)
      .get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return doc ? this.fromStoredTurn(doc.data()) : null;
  }

  /**
   * Atomically reserve the turn's estimated cost against the user's daily cap
   * and persist the turn record. Throws StudioCapExceededError (and writes
   * nothing) when the reservation would exceed the cap.
   */
  async reserveTurn(params: {
    turn: StudioTurnRecord;
    day: string;
    capCents: number;
  }): Promise<void> {
    const { turn, day, capCents } = params;
    const usageRef = this.usage.doc(`${turn.userId}_${day}`);
    const turnRef = this.turnsOf(turn.projectId).doc(turn.id);

    await this.db.runTransaction(async (transaction) => {
      const usageSnapshot = await transaction.get(usageRef);
      const reservedCents = usageSnapshot.exists
        ? ((usageSnapshot.data() as StoredUsage).reservedCents ?? 0)
        : 0;

      if (reservedCents + turn.reservedCents > capCents) {
        throw new StudioCapExceededError(
          reservedCents,
          turn.reservedCents,
          capCents,
        );
      }

      const usagePayload: StoredUsage = {
        userId: turn.userId,
        day,
        reservedCents: reservedCents + turn.reservedCents,
      };
      transaction.set(usageRef, usagePayload);
      transaction.set(turnRef, this.toStoredTurn(turn));
    });
  }

  /**
   * Persist an already-terminal turn without touching the usage counter.
   * For conversational turns (clarify/diagnose/negotiate): reserveTurn's
   * cap check would wrongly block them on an over-cap day, and they spend
   * nothing, so they bypass the reservation transaction entirely.
   */
  async saveTurn(turn: StudioTurnRecord): Promise<void> {
    await this.turnsOf(turn.projectId)
      .doc(turn.id)
      .set(this.toStoredTurn(turn));
  }

  /**
   * Return refunded cents to the day's counter (failed calls never consume
   * cap). Floors at zero so refunds can never go negative.
   */
  async refundCents(userId: string, day: string, cents: number): Promise<void> {
    if (cents <= 0) return;
    const usageRef = this.usage.doc(`${userId}_${day}`);

    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(usageRef);
      const reservedCents = snapshot.exists
        ? ((snapshot.data() as StoredUsage).reservedCents ?? 0)
        : 0;
      transaction.set(
        usageRef,
        {
          userId,
          day,
          reservedCents: Math.max(0, reservedCents - cents),
        },
        { merge: true },
      );
    });
  }

  async getReservedCents(userId: string, day: string): Promise<number> {
    const snapshot = await this.usage.doc(`${userId}_${day}`).get();
    if (!snapshot.exists) return 0;
    return (snapshot.data() as StoredUsage).reservedCents ?? 0;
  }

  /**
   * Single terminal write after every call settles — no per-call write races.
   * (Progressive per-call updates are an M2 polish option.)
   */
  async finalizeTurn(
    projectId: string,
    turnId: string,
    patch: Pick<
      StudioTurnRecord,
      "status" | "calls" | "refundedCents" | "updatedAtMs"
    >,
  ): Promise<void> {
    // The settle path is the only writer of succeeded images, so it is where
    // the produced-image index is (re)computed. Merge-written alongside the
    // terminal `calls` it is derived from, so the two never disagree (#121).
    await this.turnsOf(projectId)
      .doc(turnId)
      .set(
        this.stripUndefined({
          ...patch,
          imageIds: producedImageIds(patch.calls),
        }),
        { merge: true },
      );
  }

  /**
   * Delete a project and its turns subcollection (Firestore never cascades
   * into subcollections). Turn docs go in paged batches under the 500-write
   * limit; the project doc goes last so a partial failure leaves the
   * project visible rather than orphaning invisible turns. Stored images
   * in GCS are left for the (frozen) retention stack — deleting a project
   * is a Firestore-only operation in v1.
   */
  async deleteProject(projectId: string): Promise<void> {
    const turnsRef = this.turnsOf(projectId);
    for (;;) {
      const snapshot = await turnsRef.limit(DELETE_BATCH_SIZE).get();
      if (snapshot.empty) break;
      const batch = this.db.batch();
      for (const doc of snapshot.docs) {
        batch.delete(doc.ref);
      }
      await batch.commit();
      if (snapshot.size < DELETE_BATCH_SIZE) break;
    }
    await this.projects.doc(projectId).delete();
  }

  /** Firestore rejects undefined field values; optional fields are omitted. */
  private stripUndefined<T extends object>(value: T): T {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(
        ([, v]) => v !== undefined,
      ),
    ) as T;
  }

  /** A turn plus its derived produced-image index, undefined fields dropped. */
  private toStoredTurn(turn: StudioTurnRecord): Record<string, unknown> {
    return this.stripUndefined({
      ...turn,
      imageIds: producedImageIds(turn.calls),
    });
  }

  /**
   * The domain turn, with the persistence-only `imageIds` index removed. The
   * index is a query aid, not part of the record's contract, so no consumer —
   * the service, the turn view, the wire — ever sees it.
   */
  private fromStoredTurn(data: Record<string, unknown>): StudioTurnRecord {
    const turn = { ...data } as unknown as StudioTurnRecord & {
      imageIds?: string[];
    };
    delete turn.imageIds;
    return turn;
  }
}
