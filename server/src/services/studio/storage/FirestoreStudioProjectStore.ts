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
import type { StudioProjectRecord, StudioTurnRecord } from "../types";

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

export class FirestoreStudioProjectStore {
  private readonly db = getFirestore();
  private readonly projects = this.db.collection("studio_projects");
  private readonly usage = this.db.collection("studio_usage");

  private turnsOf(projectId: string) {
    return this.projects.doc(projectId).collection("turns");
  }

  async createProject(record: StudioProjectRecord): Promise<void> {
    await this.projects.doc(record.id).set(this.stripUndefined(record));
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
    // Equality-only query on purpose: adding orderBy(updatedAtMs) would
    // require a composite Firestore index (hit live 2026-07-24). A user's
    // project count is small, so sort in memory instead of taking an
    // infra dependency.
    const snapshot = await this.projects
      .where("userId", "==", userId)
      .limit(500)
      .get();
    if (snapshot.empty) return [];
    return snapshot.docs
      .map((doc) => doc.data() as StudioProjectRecord)
      .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
      .slice(0, limitCount);
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
    return snapshot.docs.map((doc) => doc.data() as StudioTurnRecord);
  }

  async getTurn(
    projectId: string,
    turnId: string,
  ): Promise<StudioTurnRecord | null> {
    const snapshot = await this.turnsOf(projectId).doc(turnId).get();
    if (!snapshot.exists) return null;
    return snapshot.data() as StudioTurnRecord;
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
      transaction.set(turnRef, this.stripUndefined(turn));
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
      .set(this.stripUndefined(turn));
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
    await this.turnsOf(projectId)
      .doc(turnId)
      .set(this.stripUndefined(patch), { merge: true });
  }

  /** Firestore rejects undefined field values; optional fields are omitted. */
  private stripUndefined<T extends object>(value: T): T {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(
        ([, v]) => v !== undefined,
      ),
    ) as T;
  }
}
