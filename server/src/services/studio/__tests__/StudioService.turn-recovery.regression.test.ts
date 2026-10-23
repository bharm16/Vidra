import { describe, it, expect, vi } from "vitest";
import { StudioService, type StudioImageStorage } from "../StudioService";
import { StudioSpendLedger } from "../StudioSpendLedger";
import type { StudioProjectStore } from "../storage/StudioProjectStore";
import type {
  StudioCallRecord,
  StudioDecision,
  StudioProjectRecord,
  StudioTurnRecord,
} from "../types";

/**
 * #126 — an interrupted turn is recovered and its allowance settled exactly
 * once, after Studio retired into /app (ADR-0027).
 *
 * No new turn can start, but a turn a dead process left `status: "running"`
 * still holds reserved cents against the daily cap. Reading the project is
 * where it is next observed, so a read settles it from its own checkpointed
 * records: siblings that succeeded are kept, only unspent cents are released,
 * and a provider that already did billable work keeps its cents.
 */

const DAY = "2026-07-24";
const NOON_MS = new Date(`${DAY}T12:00:00Z`).getTime();
const GRACE_MS = 60_000;

const GENERATE_DECISION: StudioDecision = {
  action: "generate",
  basePrompt: "a minimal fox logo",
  variants: ["v0", "v1", "v2", "v3"],
  capability: "design",
  suggestions: ["s1", "s2", "s3"],
  title: "Fox Logo",
};

/** In-memory store honoring the settlement contract, counting applied settlements. */
class FakeStore {
  projects = new Map<string, StudioProjectRecord>();
  turns = new Map<string, StudioTurnRecord>();
  reserved = new Map<string, number>();
  settleApplications = 0;

  async getProject(id: string): Promise<StudioProjectRecord | null> {
    return this.projects.get(id) ?? null;
  }
  async listProjects(userId: string): Promise<StudioProjectRecord[]> {
    return [...this.projects.values()].filter((p) => p.userId === userId);
  }
  async listTurns(projectId: string): Promise<StudioTurnRecord[]> {
    return [...this.turns.values()]
      .filter((turn) => turn.projectId === projectId)
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
  }
  async getTurn(
    _projectId: string,
    turnId: string,
  ): Promise<StudioTurnRecord | null> {
    const turn = this.turns.get(turnId);
    return turn ? { ...turn, calls: turn.calls.map((c) => ({ ...c })) } : null;
  }
  async settleTurn(params: {
    turnId: string;
    userId: string;
    day: string;
    refundCents: number;
    status: StudioTurnRecord["status"];
    calls: readonly StudioCallRecord[];
    updatedAtMs: number;
  }): Promise<{ applied: boolean }> {
    const current = this.turns.get(params.turnId);
    // The running→terminal guard is the whole idempotency story.
    if (!current || current.status !== "running") return { applied: false };
    this.settleApplications += 1;
    const key = `${params.userId}_${params.day}`;
    this.reserved.set(
      key,
      Math.max(0, (this.reserved.get(key) ?? 0) - params.refundCents),
    );
    this.turns.set(params.turnId, {
      ...current,
      status: params.status,
      calls: params.calls.map((c) => ({ ...c })),
      refundedCents: params.refundCents,
      updatedAtMs: params.updatedAtMs,
    });
    return { applied: true };
  }
  async deleteProject(id: string): Promise<void> {
    this.projects.delete(id);
  }
}

const storage = (): StudioImageStorage => ({
  getViewUrl: vi.fn().mockResolvedValue({
    viewUrl: "https://signed.example.com/x",
    expiresAt: "2026-07-25T00:00:00Z",
    storagePath: "users/u1/x.webp",
  }),
});

function service(store: FakeStore, nowMs: number): StudioService {
  return new StudioService({
    store: store as unknown as StudioProjectStore,
    storage: storage(),
    dailyCapCents: 500,
    interruptedTurnGraceMs: GRACE_MS,
    now: () => new Date(nowMs),
  });
}

const succeeded = (index: number): StudioCallRecord => ({
  index,
  status: "succeeded",
  image: {
    id: `img-${index}`,
    storagePath: `users/u1/${index}.webp`,
    sourcePrompt: `v${index}`,
    model: "recraft-v4.1",
  },
});

/** A four-call turn a dead process left running with 16¢ reserved. */
function seed(calls: StudioCallRecord[]): FakeStore {
  const store = new FakeStore();
  store.projects.set("p1", {
    id: "p1",
    userId: "u1",
    title: "Fox",
    createdAtMs: NOON_MS,
    updatedAtMs: NOON_MS,
  });
  store.turns.set("t1", {
    id: "t1",
    projectId: "p1",
    userId: "u1",
    status: "running",
    userMessage: "a fox logo",
    decision: GENERATE_DECISION,
    resolvedModel: "recraft-v4.1",
    calls,
    reservedCents: 16,
    refundedCents: 0,
    createdAtMs: NOON_MS,
    updatedAtMs: NOON_MS,
  });
  store.reserved.set(`u1_${DAY}`, 16);
  return store;
}

describe("#126 recovery on read: an interrupted turn settles from its records", () => {
  it("keeps the siblings that checkpointed a success, terminates the rest, and releases only their cents", async () => {
    const store = seed([
      succeeded(0),
      succeeded(1),
      { index: 2, status: "running" },
      { index: 3, status: "running" },
    ]);

    const [view] = await service(
      store,
      NOON_MS + GRACE_MS + 1,
    ).listTurnsWithFreshUrls("u1", "p1");

    expect(view?.status).toBe("partial");
    const kept = view?.calls.filter((c) => c.status === "succeeded") ?? [];
    expect(kept).toHaveLength(2);
    expect(kept.every((c) => c.image?.viewUrl)).toBe(true);
    const failed = view?.calls.filter((c) => c.status === "failed") ?? [];
    expect(failed.every((c) => /interrupt/i.test(c.error ?? ""))).toBe(true);
    expect(view?.refundedCents).toBe(8);
    expect(store.reserved.get(`u1_${DAY}`)).toBe(8);
  });

  it("keeps the cents of a call whose provider already did billable work", async () => {
    const store = seed([
      succeeded(0),
      { index: 1, status: "failed", error: "storage", providerSpent: true },
      { index: 2, status: "failed", error: "provider" },
      { index: 3, status: "running" },
    ]);

    const view = await service(
      store,
      NOON_MS + GRACE_MS + 1,
    ).getTurnWithFreshUrls("u1", "p1", "t1");

    // Calls 2 and 3 spent nothing (8¢ back); call 1's provider was paid.
    expect(view.refundedCents).toBe(8);
    expect(store.reserved.get(`u1_${DAY}`)).toBe(8);
  });

  it("leaves a still-fresh running turn untouched", async () => {
    const store = seed([0, 1, 2, 3].map((index) => ({ index, status: "running" })));

    const view = await service(
      store,
      NOON_MS + GRACE_MS - 1,
    ).getTurnWithFreshUrls("u1", "p1", "t1");

    expect(view.status).toBe("running");
    expect(store.settleApplications).toBe(0);
    expect(store.reserved.get(`u1_${DAY}`)).toBe(16);
  });

  it("reads another owner's project and turns as absent, and settles nothing", async () => {
    const store = seed([{ index: 0, status: "running" }]);
    const reader = service(store, NOON_MS + GRACE_MS + 1);

    await expect(reader.listTurnsWithFreshUrls("u2", "p1")).rejects.toMatchObject({ statusCode: 404 });
    await expect(reader.getTurnWithFreshUrls("u2", "p1", "t1")).rejects.toMatchObject({ statusCode: 404 });
    await expect(reader.deleteProject("u2", "p1")).rejects.toMatchObject({ statusCode: 404 });
    expect(await reader.listProjects("u2")).toEqual([]);
    expect(store.settleApplications).toBe(0);
    expect(store.projects.has("p1")).toBe(true);
  });
});

describe("#126 idempotency: settlement replayed twice refunds and finalizes once", () => {
  it("a recovery replayed twice produces ONE refund and ONE finalization", async () => {
    const store = seed([
      succeeded(0),
      succeeded(1),
      { index: 2, status: "running" },
      { index: 3, status: "running" },
    ]);
    const ledger = new StudioSpendLedger({
      store: store as unknown as StudioProjectStore,
      dailyCapCents: 500,
      now: () => new Date(NOON_MS + GRACE_MS + 1),
    });
    const interrupted = store.turns.get("t1")!;

    const first = await ledger.recoverTurn(interrupted);
    const second = await ledger.recoverTurn(interrupted);

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    expect(store.settleApplications).toBe(1);
    expect(store.reserved.get(`u1_${DAY}`)).toBe(8);
    expect(store.turns.get("t1")?.status).toBe("partial");
  });
});
