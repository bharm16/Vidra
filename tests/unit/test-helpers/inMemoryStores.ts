import { createHash } from "node:crypto";
import type { SessionRecord } from "@server/domain/session/types";
import type { AdmissionIdempotencyClaim } from "@services/admission/admitPictureTake";

/**
 * The session store, in memory.
 *
 * `mutate` is the load-bearing method: Firestore re-runs its mutator against
 * fresh data under contention, which is what makes two concurrent appends both
 * survive. A per-session queue reproduces exactly that serialization, so the
 * integrity case tests the append rule rather than the absence of a race.
 */
export class InMemorySessionStore {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly queues = new Map<string, Promise<unknown>>();
  /**
   * Session ids whose appends fail. Persistent until the test clears it —
   * `attachCompletedJobToSession` retries twice, so a one-shot failure would
   * be swallowed by the retry and prove nothing.
   */
  readonly failAppendFor = new Set<string>();

  get(sessionId: string): Promise<SessionRecord | null> {
    const found = this.sessions.get(sessionId);
    return Promise.resolve(found ? structuredClone(found) : null);
  }

  save(session: SessionRecord): Promise<void> {
    this.sessions.set(session.id, structuredClone(session));
    return Promise.resolve();
  }

  async mutate(
    sessionId: string,
    mutator: (current: SessionRecord) => SessionRecord,
  ): Promise<SessionRecord | null> {
    const previous = this.queues.get(sessionId) ?? Promise.resolve();
    const next = previous.then(() => {
      if (this.failAppendFor.has(sessionId)) {
        throw new Error("session store is unavailable");
      }
      const current = this.sessions.get(sessionId);
      if (!current) return null;
      const mutated = mutator(structuredClone(current));
      this.sessions.set(sessionId, structuredClone(mutated));
      return structuredClone(mutated);
    });
    this.queues.set(
      sessionId,
      next.catch(() => undefined),
    );
    return next;
  }

  delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    return Promise.resolve();
  }

  findByUser(userId: string, limitCount = 50): Promise<SessionRecord[]> {
    return Promise.resolve(
      [...this.sessions.values()]
        .filter((session) => session.userId === userId)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, limitCount)
        .map((session) => structuredClone(session)),
    );
  }

  findByPromptUuid(
    userId: string,
    promptUuid: string,
  ): Promise<SessionRecord | null> {
    const found = [...this.sessions.values()].find(
      (session) =>
        session.userId === userId && session.promptUuid === promptUuid,
    );
    return Promise.resolve(found ? structuredClone(found) : null);
  }
}

interface IdempotencyRecord {
  userId: string;
  route: string;
  payloadHash: string;
  status: "pending" | "completed" | "failed";
  snapshot?: { statusCode: number; body: Record<string, unknown> };
}

/**
 * The per-admission idempotency record (ADR-0022 decision 6 permits exactly
 * this one), with the same four outcomes the Firestore service returns.
 */
export class InMemoryIdempotencyService {
  private readonly records = new Map<string, IdempotencyRecord>();

  claimRequest(input: {
    userId: string;
    route: string;
    key: string;
    payload: unknown;
  }): Promise<AdmissionIdempotencyClaim> {
    const recordId = createHash("sha256")
      .update(`${input.userId}|${input.route}|${input.key}`)
      .digest("hex");
    const payloadHash = createHash("sha256")
      .update(JSON.stringify(input.payload ?? null))
      .digest("hex");
    const existing = this.records.get(recordId);
    if (!existing) {
      this.records.set(recordId, {
        userId: input.userId,
        route: input.route,
        payloadHash,
        status: "pending",
      });
      return Promise.resolve({ state: "claimed", recordId });
    }
    if (existing.payloadHash !== payloadHash) {
      return Promise.resolve({ state: "conflict", recordId });
    }
    if (existing.status === "completed" && existing.snapshot) {
      return Promise.resolve({
        state: "replay",
        recordId,
        snapshot: structuredClone(existing.snapshot),
      });
    }
    if (existing.status === "pending") {
      return Promise.resolve({ state: "in_progress", recordId });
    }
    this.records.set(recordId, {
      userId: input.userId,
      route: input.route,
      payloadHash,
      status: "pending",
    });
    return Promise.resolve({ state: "claimed", recordId });
  }

  markCompleted(input: {
    recordId: string;
    jobId?: string;
    snapshot: { statusCode: number; body: Record<string, unknown> };
  }): Promise<void> {
    const existing = this.records.get(input.recordId);
    if (existing) {
      existing.status = "completed";
      existing.snapshot = structuredClone(input.snapshot);
    }
    return Promise.resolve();
  }

  markFailed(recordId: string): Promise<void> {
    const existing = this.records.get(recordId);
    if (existing) existing.status = "failed";
    return Promise.resolve();
  }

  getResponseSnapshot(input: {
    userId: string;
    route: string;
    key: string;
  }): Promise<{ statusCode: number; body: Record<string, unknown> } | null> {
    const id = createHash("sha256")
      .update(`${input.userId}|${input.route}|${input.key}`)
      .digest("hex");
    const record = this.records.get(id);
    return Promise.resolve(
      record?.status === "completed" && record.snapshot
        ? structuredClone(record.snapshot)
        : null,
    );
  }
}
