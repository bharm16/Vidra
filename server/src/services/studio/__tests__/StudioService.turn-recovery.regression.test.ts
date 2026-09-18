import { describe, it, expect, vi } from "vitest";
import { StudioService, type StudioImageStorage } from "../StudioService";
import { StudioSpendLedger } from "../StudioSpendLedger";
import { StudioModelRegistry } from "../StudioModelRegistry";
import type { StudioProjectStore } from "../storage/StudioProjectStore";
import type { StudioImageRunner } from "../providers/types";
import type {
  StudioCallRecord,
  StudioDecision,
  StudioProjectRecord,
  StudioTurnRecord,
} from "../types";

/**
 * #126 — an interrupted turn is recovered and its allowance settled exactly
 * once.
 *
 * The in-process `finally` that settles a crashed turn (pinned by
 * turn-crash-settlement) only runs while the PROCESS LIVES. A process DEATH
 * runs no `finally`, so its turn is left `status: "running"` with cents held.
 * This suite pins the three things that make that recoverable:
 *
 *  1. Durable per-call progress: each call's outcome is checkpointed as it
 *     lands, so a restart recovers a batch's finished siblings from the turn's
 *     own records instead of losing them with the process.
 *  2. Settlement is idempotent: recovering (or re-reading) a turn releases its
 *     unspent cents and finalizes it exactly once, however many times it runs.
 *  3. An explicit ambiguous-outcome policy: a provider failure and a
 *     provider-success-then-storage-failure settle DIFFERENTLY — only the
 *     first releases the call's cents — and both are recorded on the call.
 *
 * Boundary (ADR-0022 decision 8 / ADR-0002): the only allowance settled here
 * is the studio's OWN internal, server-side dollar allowance. No customer
 * credits, no payment/billing, no video-job resilience code is touched.
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

/**
 * In-memory store honoring the reservation + settlement contract, and counting
 * how many times a settlement actually APPLIED — the observable behind
 * "exactly once".
 */
class FakeStore {
  projects = new Map<string, StudioProjectRecord>();
  turns = new Map<string, StudioTurnRecord>();
  reserved = new Map<string, number>();
  settleApplications = 0;

  async createProject(record: StudioProjectRecord): Promise<boolean> {
    if (this.projects.has(record.id)) return false;
    this.projects.set(record.id, { ...record });
    return true;
  }
  async getProject(id: string): Promise<StudioProjectRecord | null> {
    return this.projects.get(id) ?? null;
  }
  async listProjects(userId: string): Promise<StudioProjectRecord[]> {
    return [...this.projects.values()].filter((p) => p.userId === userId);
  }
  async updateProject(
    id: string,
    patch: Partial<StudioProjectRecord>,
  ): Promise<void> {
    const current = this.projects.get(id);
    if (current) this.projects.set(id, { ...current, ...patch });
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
  async findTurnByProducedImageId(): Promise<StudioTurnRecord | null> {
    return null;
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
    status: StudioTurnRecord["status"];
    calls: readonly StudioCallRecord[];
    updatedAtMs: number;
  }): Promise<{ applied: boolean }> {
    const current = this.turns.get(params.turnId);
    // The running→terminal guard is the whole idempotency story.
    if (!current || current.status !== "running") return { applied: false };
    this.settleApplications += 1;
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
      calls: params.calls.map((c) => ({ ...c })),
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
  async deleteProject(): Promise<void> {}
}

const storageOk = (): StudioImageStorage => ({
  saveFromUrl: vi.fn().mockImplementation(async (_u: string, url: string) => ({
    storagePath: `users/u1/${encodeURIComponent(url)}.webp`,
  })),
  getViewUrl: vi.fn().mockResolvedValue({
    viewUrl: "https://signed.example.com/x",
    expiresAt: "2026-07-25T00:00:00Z",
    storagePath: "users/u1/x.webp",
  }),
});

function makeService(overrides: {
  store?: FakeStore;
  runner?: StudioImageRunner;
  storage?: StudioImageStorage;
  now?: () => Date;
}) {
  const store = overrides.store ?? new FakeStore();
  let idCounter = 0;
  const service = new StudioService({
    store: store as unknown as StudioProjectStore,
    registry: new StudioModelRegistry(),
    runner: overrides.runner ?? {
      run: vi.fn().mockResolvedValue({
        imageUrl: "https://r.dev/out.webp",
        durationMs: 1,
      }),
    },
    storage: overrides.storage ?? storageOk(),
    policy: { decideTurn: vi.fn().mockResolvedValue(GENERATE_DECISION) },
    dailyCapCents: 500,
    interruptedTurnGraceMs: GRACE_MS,
    now: overrides.now ?? (() => new Date(NOON_MS)),
    idFactory: () => `id-${++idCounter}`,
  });
  return { service, store };
}

describe("#126 recovery: a process death mid-batch is recovered on restart", () => {
  it("keeps the siblings that checkpointed a success, terminates the rest, and releases only their cents", async () => {
    const store = new FakeStore();

    // Calls 0 and 1 succeed (image saved → checkpointed); calls 2 and 3 hang
    // forever — the process dies mid-batch with two siblings still in flight.
    let started = 0;
    const runner: StudioImageRunner = {
      run: vi.fn().mockImplementation(() => {
        started += 1;
        return started <= 2
          ? Promise.resolve({
              imageUrl: `https://r.dev/${started}.webp`,
              durationMs: 1,
            })
          : new Promise(() => {});
      }),
    };

    const producer = makeService({ store, runner });
    const project = await producer.service.createProject("u1");

    // Fire the turn but NEVER await completion: the two hanging calls mean the
    // reservation's work never returns, so the crash `finally` never runs —
    // exactly the process-death shape (#126).
    void producer.service.runTurn("u1", project.id, "a fox logo");

    // The two finished calls are durably checkpointed while the turn is still
    // running — the durable per-call progress a restart recovers from.
    const turnId = await vi.waitFor(() => {
      const seeded = [...store.turns.values()][0];
      expect(seeded).toBeDefined();
      expect(
        seeded?.calls.filter((c) => c.status === "succeeded"),
      ).toHaveLength(2);
      return seeded!.id;
    });
    expect(store.turns.get(turnId)?.status).toBe("running");
    expect(await store.getReservedCents("u1", DAY)).toBe(16);

    // RESTART: a fresh service over the SAME store, well past the grace window,
    // observes the turn on a poll and recovers it from its records.
    const restarted = makeService({
      store,
      now: () => new Date(NOON_MS + GRACE_MS + 1),
    });
    const view = await restarted.service.getTurnWithFreshUrls(
      "u1",
      project.id,
      turnId,
    );

    expect(view.status).toBe("partial");
    const succeeded = view.calls.filter((c) => c.status === "succeeded");
    const failed = view.calls.filter((c) => c.status === "failed");
    expect(succeeded).toHaveLength(2); // siblings retained, with their images
    expect(succeeded.every((c) => Boolean(c.image))).toBe(true);
    expect(failed).toHaveLength(2);
    expect(failed.every((c) => /interrupt/i.test(c.error ?? ""))).toBe(true);
    // Only the two never-finished calls were unspent: 2 × 4¢ released, leaving
    // the two that produced an image consumed.
    expect(view.refundedCents).toBe(8);
    expect(await store.getReservedCents("u1", DAY)).toBe(8);
  });

  it("leaves a still-fresh running turn untouched (a live batch is never recovered out from under its process)", async () => {
    const store = new FakeStore();
    store.projects.set("p1", {
      id: "p1",
      userId: "u1",
      title: "t",
      createdAtMs: NOON_MS,
      updatedAtMs: NOON_MS,
    });
    // A running turn touched just now — inside the grace window.
    store.turns.set("t1", {
      id: "t1",
      projectId: "p1",
      userId: "u1",
      status: "running",
      userMessage: "m",
      decision: GENERATE_DECISION,
      resolvedModel: "recraft-v4.1",
      calls: [0, 1, 2, 3].map((index) => ({ index, status: "running" })),
      reservedCents: 16,
      refundedCents: 0,
      createdAtMs: NOON_MS,
      updatedAtMs: NOON_MS,
    });
    store.reserved.set(`u1_${DAY}`, 16);

    const { service } = makeService({
      store,
      now: () => new Date(NOON_MS + GRACE_MS - 1),
    });
    const view = await service.getTurnWithFreshUrls("u1", "p1", "t1");

    expect(view.status).toBe("running");
    expect(store.settleApplications).toBe(0);
    expect(await store.getReservedCents("u1", DAY)).toBe(16);
  });
});

describe("#126 idempotency: settlement replayed twice refunds and finalizes once", () => {
  it("a recovery replayed twice produces ONE refund and ONE finalization", async () => {
    const store = new FakeStore();
    const ledger = new StudioSpendLedger({
      store: store as unknown as StudioProjectStore,
      dailyCapCents: 500,
      now: () => new Date(NOON_MS + GRACE_MS + 1),
    });
    // A turn a dead process left half-done: two siblings succeeded, two never
    // reported. Reserved holds the full 16¢.
    const interrupted: StudioTurnRecord = {
      id: "t1",
      projectId: "p1",
      userId: "u1",
      status: "running",
      userMessage: "m",
      decision: GENERATE_DECISION,
      resolvedModel: "recraft-v4.1",
      calls: [
        {
          index: 0,
          status: "succeeded",
          image: {
            id: "img-0",
            storagePath: "p0",
            sourcePrompt: "v0",
            model: "recraft-v4.1",
          },
        },
        {
          index: 1,
          status: "succeeded",
          image: {
            id: "img-1",
            storagePath: "p1",
            sourcePrompt: "v1",
            model: "recraft-v4.1",
          },
        },
        { index: 2, status: "running" },
        { index: 3, status: "running" },
      ],
      reservedCents: 16,
      refundedCents: 0,
      createdAtMs: NOON_MS,
      updatedAtMs: NOON_MS,
    };
    store.turns.set("t1", interrupted);
    store.reserved.set(`u1_${DAY}`, 16);

    const first = await ledger.recoverTurn(interrupted);
    const second = await ledger.recoverTurn(interrupted);

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    // Applied exactly once — not twice, and never floored-to-zero by a double
    // full refund: the two unspent calls released 8¢, leaving 8¢ consumed.
    expect(store.settleApplications).toBe(1);
    expect(await store.getReservedCents("u1", DAY)).toBe(8);
    const settled = store.turns.get("t1");
    expect(settled?.status).toBe("partial");
    expect(settled?.refundedCents).toBe(8);
    // The finalization did not change on the second call.
    expect(settled?.calls.filter((c) => c.status === "succeeded")).toHaveLength(
      2,
    );
  });
});

describe("#126 ambiguous outcome: provider failure vs provider-success-then-storage-failure", () => {
  it("a provider failure releases the call's cents; a storage failure after a provider success does NOT — and both are visible", async () => {
    const store = new FakeStore();

    // A generate batch: call 0 succeeds; call 1's PROVIDER fails; call 2's
    // provider SUCCEEDS but STORING it fails; call 3 succeeds.
    let started = 0;
    const runner: StudioImageRunner = {
      run: vi.fn().mockImplementation(() => {
        started += 1;
        if (started === 2) {
          return Promise.reject(new Error("NSFW content detected"));
        }
        return Promise.resolve({
          imageUrl: `https://r.dev/${started}.webp`,
          durationMs: 1,
        });
      }),
    };
    let saved = 0;
    const storage: StudioImageStorage = {
      saveFromUrl: vi.fn().mockImplementation(async () => {
        saved += 1;
        // The 2nd successful provider result (call index 2) fails to store.
        if (saved === 2) throw new Error("GCS write failed");
        return { storagePath: `users/u1/${saved}.webp` };
      }),
      getViewUrl: vi.fn().mockResolvedValue({
        viewUrl: "https://signed.example.com/x",
        expiresAt: "2026-07-25T00:00:00Z",
        storagePath: "users/u1/x.webp",
      }),
    };

    const { service } = makeService({ store, runner, storage });
    const project = await service.createProject("u1");
    const result = await service.runTurn("u1", project.id, "a fox logo");
    await result.completion;

    const turn = await service.getTurn("u1", project.id, result.turnId);
    const providerFailure = turn.calls[1];
    const storageFailure = turn.calls[2];

    // Same studio-state decision: neither slot has a usable image.
    expect(providerFailure?.status).toBe("failed");
    expect(storageFailure?.status).toBe("failed");

    // DIFFERENT allowance decision, both recorded on the call:
    expect(providerFailure?.providerSpent).toBeUndefined();
    expect(providerFailure?.error).toContain("NSFW");
    expect(storageFailure?.providerSpent).toBe(true);
    expect(storageFailure?.error).toMatch(/generated but could not be saved/i);

    // Only the provider failure is refunded (1 × 4¢). The storage failure kept
    // its cents because the provider already did billable work.
    expect(turn.refundedCents).toBe(4);
    expect(await store.getReservedCents("u1", DAY)).toBe(12);
  });

  it("an all-provider-failure turn and an all-storage-failure turn are both 'failed' but settle visibly differently", async () => {
    // All providers fail → nothing billable ran → full release.
    const providerFail = makeService({
      runner: { run: vi.fn().mockRejectedValue(new Error("provider down")) },
    });
    const p = await providerFail.service.createProject("u1");
    const a = await providerFail.service.runTurn("u1", p.id, "x");
    await a.completion;
    const turnA = await providerFail.service.getTurn("u1", p.id, a.turnId);

    expect(turnA.status).toBe("failed");
    expect(turnA.refundedCents).toBe(16); // every call released
    expect(await providerFail.store.getReservedCents("u1", DAY)).toBe(0);
    expect(turnA.calls.every((c) => c.providerSpent === undefined)).toBe(true);

    // Every provider SUCCEEDS but every store FAILS → billable work happened →
    // nothing released, though the turn still produced no usable image.
    const storageFail = makeService({
      storage: {
        saveFromUrl: vi.fn().mockRejectedValue(new Error("GCS down")),
        getViewUrl: vi.fn().mockResolvedValue({
          viewUrl: "https://signed.example.com/x",
          expiresAt: "2026-07-25T00:00:00Z",
          storagePath: "users/u1/x.webp",
        }),
      },
    });
    const q = await storageFail.service.createProject("u1");
    const b = await storageFail.service.runTurn("u1", q.id, "y");
    await b.completion;
    const turnB = await storageFail.service.getTurn("u1", q.id, b.turnId);

    expect(turnB.status).toBe("failed");
    expect(turnB.refundedCents).toBe(0); // provider spent on every call
    expect(await storageFail.store.getReservedCents("u1", DAY)).toBe(16);
    expect(turnB.calls.every((c) => c.providerSpent === true)).toBe(true);
  });
});
