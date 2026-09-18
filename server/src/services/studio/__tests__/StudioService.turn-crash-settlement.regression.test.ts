import { describe, it, expect, vi } from "vitest";
import { StudioService } from "../StudioService";
import { StudioSpendLedger } from "../StudioSpendLedger";
import { StudioModelRegistry } from "../StudioModelRegistry";
import type { StudioProjectStore } from "../storage/StudioProjectStore";
import type {
  StudioCallRecord,
  StudioDecision,
  StudioProjectRecord,
  StudioTurnRecord,
  StudioTurnStatus,
} from "../types";

/**
 * Regression: reserving a turn's cents and releasing them were separate
 * calls joined by convention, with the turn's real work (signed-URL
 * minting, registry lookups, provider-input shaping) sitting between them
 * outside any protection. A throw there was caught by a background handler
 * that only logged: the day's cents stayed reserved forever and the turn
 * stayed `status: "running"` — which the client polls every second with no
 * terminal condition.
 *
 * Invariant: however a turn's work ends WHILE THE PROCESS LIVES, no cents stay
 * reserved for a turn that produced nothing, and the turn reaches a terminal
 * status — settled from the turn's own records so any sibling that already
 * checkpointed a success is kept (#126). Process DEATH is covered by the
 * turn-recovery regression; this pins the in-process `finally`.
 */

const DAY = "2026-07-24";
const NOW = new Date(`${DAY}T12:00:00Z`);

const EDIT_DECISION: StudioDecision = {
  action: "edit",
  instruction: "clean up this sketch",
  sourceImageIds: ["att-1"],
  suggestions: ["s1", "s2", "s3"],
};

/** In-memory stand-in for Firestore: cap accounting + turn records. */
class FakeStore {
  projects = new Map<string, StudioProjectRecord>();
  turns = new Map<string, StudioTurnRecord>();
  reserved = new Map<string, number>();

  async getProject(id: string): Promise<StudioProjectRecord | null> {
    return this.projects.get(id) ?? null;
  }

  async updateProject(
    id: string,
    patch: Partial<StudioProjectRecord>,
  ): Promise<void> {
    const current = this.projects.get(id);
    if (current) this.projects.set(id, { ...current, ...patch });
  }

  async listTurns(projectId: string): Promise<StudioTurnRecord[]> {
    return [...this.turns.values()].filter(
      (turn) => turn.projectId === projectId,
    );
  }

  async getTurn(
    _projectId: string,
    turnId: string,
  ): Promise<StudioTurnRecord | null> {
    return this.turns.get(turnId) ?? null;
  }

  async reserveTurn(params: {
    turn: StudioTurnRecord;
    day: string;
  }): Promise<void> {
    const key = `${params.turn.userId}_${params.day}`;
    this.reserved.set(
      key,
      (this.reserved.get(key) ?? 0) + params.turn.reservedCents,
    );
    this.turns.set(params.turn.id, { ...params.turn });
  }

  async checkpointCall(
    _projectId: string,
    turnId: string,
    call: StudioCallRecord,
    updatedAtMs: number,
  ): Promise<void> {
    const current = this.turns.get(turnId);
    if (!current || current.status !== "running") return;
    const calls = [...current.calls];
    calls[call.index] = call;
    this.turns.set(turnId, { ...current, calls, updatedAtMs });
  }

  async settleTurn(params: {
    projectId: string;
    turnId: string;
    userId: string;
    day: string;
    refundCents: number;
    status: StudioTurnStatus;
    calls: readonly StudioCallRecord[];
    updatedAtMs: number;
  }): Promise<{ applied: boolean }> {
    const current = this.turns.get(params.turnId);
    if (!current || current.status !== "running") return { applied: false };
    if (params.refundCents > 0) {
      const key = `${params.userId}_${params.day}`;
      this.reserved.set(
        key,
        Math.max(0, (this.reserved.get(key) ?? 0) - params.refundCents),
      );
    }
    this.turns.set(params.turnId, {
      ...current,
      status: params.status,
      calls: [...params.calls],
      refundedCents: params.refundCents,
      updatedAtMs: params.updatedAtMs,
    });
    return { applied: true };
  }

  async getReservedCents(userId: string, day: string): Promise<number> {
    return this.reserved.get(`${userId}_${day}`) ?? 0;
  }

  async saveTurn(turn: StudioTurnRecord): Promise<void> {
    this.turns.set(turn.id, { ...turn });
  }
}

describe("regression: a crashed turn never strands reserved cents", () => {
  it("refunds and finalizes when the work throws mid-turn", async () => {
    const store = new FakeStore();
    // An attachment is a free edit source, so the edit below is the first
    // and only spend-bearing turn on the day.
    store.projects.set("p1", {
      id: "p1",
      userId: "u1",
      title: "Sketch cleanup",
      createdAtMs: 1,
      updatedAtMs: 1,
      attachments: [
        {
          id: "att-1",
          storagePath: "users/u1/previews/images/sketch.png",
          filename: "sketch.png",
          createdAtMs: 1,
        },
      ],
    });

    const run = vi.fn();
    let idCounter = 0;
    const service = new StudioService({
      store: store as unknown as StudioProjectStore,
      registry: new StudioModelRegistry(),
      runner: { run },
      storage: {
        saveFromUrl: vi.fn(),
        // The unprotected step: minting the source image's signed URL
        // happens after the reservation and before any settlement.
        getViewUrl: vi.fn().mockRejectedValue(new Error("GCS unavailable")),
      },
      policy: { decideTurn: vi.fn().mockResolvedValue(EDIT_DECISION) },
      dailyCapCents: 500,
      now: () => NOW,
      idFactory: () => `id-${++idCounter}`,
    });

    const result = await service.runTurn("u1", "p1", "clean this up");
    await result.completion;

    expect(await store.getReservedCents("u1", DAY)).toBe(0);

    const turn = await service.getTurn("u1", "p1", result.turnId);
    expect(turn.status).not.toBe("running");
    expect(turn.status).toBe("failed");
    expect(turn.refundedCents).toBe(turn.reservedCents);
    expect(turn.calls[0]?.error).toContain("GCS unavailable");
    // The crash happened before the provider was ever asked to do work.
    expect(run).not.toHaveBeenCalled();
  });

  it("refunds every reserved call, not just one, on a multi-call turn", async () => {
    const store = new FakeStore();
    const ledger = new StudioSpendLedger({
      store: store as unknown as StudioProjectStore,
      dailyCapCents: 500,
      now: () => NOW,
    });
    const turn: StudioTurnRecord = {
      id: "t1",
      projectId: "p1",
      userId: "u1",
      status: "running",
      userMessage: "a fox logo",
      decision: EDIT_DECISION,
      calls: [0, 1, 2, 3].map((index) => ({ index, status: "running" })),
      reservedCents: 16,
      refundedCents: 0,
      // The reservation day is derived from the turn's own creation instant,
      // so this must sit on the settlement day the assertions read.
      createdAtMs: NOW.getTime(),
      updatedAtMs: NOW.getTime(),
    };

    const { completion } = await ledger.reserve(turn, async () => {
      throw new Error("input shaping failed");
    });
    await completion;

    expect(await store.getReservedCents("u1", DAY)).toBe(0);
    const settled = store.turns.get("t1");
    expect(settled?.status).toBe("failed");
    expect(settled?.refundedCents).toBe(16);
    expect(settled?.calls).toHaveLength(4);
  });
});
