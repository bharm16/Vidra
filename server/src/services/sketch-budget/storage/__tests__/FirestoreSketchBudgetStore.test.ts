import { beforeEach, describe, expect, it, vi } from "vitest";

import { SketchBudgetService } from "@services/sketch-budget/SketchBudgetService";

type StoreRecord = Record<string, unknown>;

/**
 * Firestore fake that models the one property this store depends on:
 * a transaction sees a consistent snapshot and is retried when a document it
 * READ changed before it committed.
 *
 * The naive fake (buffer the writes, commit unconditionally) would let every
 * concurrent reservation through and prove nothing. Here `tx.get` yields to
 * the microtask queue before answering, so two transactions in flight really
 * do interleave their reads the way two browser tabs hitting two server
 * instances do, and the loser is re-run against the committed counter.
 */
const mocks = vi.hoisted(() => ({
  records: new Map<
    string,
    { data: Record<string, unknown>; version: number }
  >(),
  commits: 0,
  attempts: 0,
}));

type FakeDocRef = { path: string };

const MAX_TRANSACTION_ATTEMPTS = 25;

vi.mock("@infrastructure/firebaseAdmin", () => ({
  getFirestore: () => ({
    collection: (name: string) => ({
      doc: (id: string): FakeDocRef => ({ path: `${name}/${id}` }),
    }),
    runTransaction: async (
      fn: (tx: {
        get: (
          ref: FakeDocRef,
        ) => Promise<{ exists: boolean; data: () => StoreRecord | undefined }>;
        set: (ref: FakeDocRef, data: StoreRecord) => void;
      }) => Promise<unknown>,
    ): Promise<unknown> => {
      for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
        mocks.attempts += 1;
        const readVersions = new Map<string, number>();
        const writes: Array<{ path: string; data: StoreRecord }> = [];
        const result = await fn({
          get: async (ref) => {
            await Promise.resolve();
            const entry = mocks.records.get(ref.path);
            readVersions.set(ref.path, entry?.version ?? 0);
            return {
              exists: entry !== undefined,
              data: () => (entry ? { ...entry.data } : undefined),
            };
          },
          set: (ref, data) => {
            writes.push({ path: ref.path, data: { ...data } });
          },
        });
        // Commit point. Nothing awaits between the staleness check and the
        // writes, so this is the serialization the real service relies on.
        const stale = [...readVersions].some(
          ([path, version]) =>
            (mocks.records.get(path)?.version ?? 0) !== version,
        );
        if (stale) continue;
        for (const write of writes) {
          const current = mocks.records.get(write.path);
          mocks.records.set(write.path, {
            data: write.data,
            version: (current?.version ?? 0) + 1,
          });
        }
        mocks.commits += 1;
        return result;
      }
      throw new Error("Transaction failed: too much contention");
    },
  }),
}));

import { FirestoreSketchBudgetStore } from "../FirestoreSketchBudgetStore";
import { SketchAllowanceExceededError } from "../SketchBudgetStore";

const DAY = "2026-09-17";
const NOW = new Date(`${DAY}T10:00:00.000Z`);

function reservedMillicents(userId: string): number {
  const entry = mocks.records.get(`sketch_usage/${userId}_${DAY}`);
  return entry === undefined
    ? 0
    : ((entry.data as { reservedMillicents?: number }).reservedMillicents ?? 0);
}

/** One "server instance": its own store object over the shared Firestore. */
function serverInstance(): SketchBudgetService {
  return new SketchBudgetService({
    store: new FirestoreSketchBudgetStore(),
    // 5¢/day at 1000 millicents (1¢) a frame — exactly five frames.
    dailyCapCents: 5,
    frameCostMillicents: 1000,
    now: () => NOW,
  });
}

describe("FirestoreSketchBudgetStore", () => {
  beforeEach(() => {
    mocks.records.clear();
    mocks.commits = 0;
    mocks.attempts = 0;
  });

  it("accumulates a creator's day counter under one userId_day document", async () => {
    const store = new FirestoreSketchBudgetStore();

    await store.reserve({
      userId: "creator-1",
      day: DAY,
      millicents: 400,
      capMillicents: 1000,
    });
    await store.reserve({
      userId: "creator-1",
      day: DAY,
      millicents: 400,
      capMillicents: 1000,
    });

    expect(reservedMillicents("creator-1")).toBe(800);
    expect(mocks.records.get(`sketch_usage/creator-1_${DAY}`)?.data).toEqual({
      userId: "creator-1",
      day: DAY,
      reservedMillicents: 800,
    });
  });

  it("writes nothing when the reservation would exceed the cap", async () => {
    const store = new FirestoreSketchBudgetStore();
    await store.reserve({
      userId: "creator-1",
      day: DAY,
      millicents: 800,
      capMillicents: 1000,
    });

    await expect(
      store.reserve({
        userId: "creator-1",
        day: DAY,
        millicents: 400,
        capMillicents: 1000,
      }),
    ).rejects.toBeInstanceOf(SketchAllowanceExceededError);

    expect(reservedMillicents("creator-1")).toBe(800);
  });

  /**
   * The shared-cap guarantee (issue #84): concurrent tabs, and concurrent
   * server instances, may not together admit more than the cap allows.
   */
  it("two server instances racing the same creator cannot exceed the cap", async () => {
    const instanceA = serverInstance();
    const instanceB = serverInstance();

    const outcomes = await Promise.all(
      Array.from({ length: 12 }, (_unused, index) =>
        (index % 2 === 0 ? instanceA : instanceB).admit("creator-1"),
      ),
    );

    const admitted = outcomes.filter(
      (outcome) => outcome.outcome === "admitted",
    );
    const refused = outcomes.filter(
      (outcome) => outcome.outcome === "allowance-reached",
    );

    expect(admitted).toHaveLength(5);
    expect(refused).toHaveLength(7);
    expect(reservedMillicents("creator-1")).toBe(5000);
    // Nothing failed closed by accident: every outcome is one of the two.
    expect(admitted.length + refused.length).toBe(12);
    // And the reservations really did contend rather than running serially.
    expect(mocks.attempts).toBeGreaterThan(mocks.commits);
  });

  it("racing creators do not spend each other's allowance", async () => {
    const instance = serverInstance();

    const outcomes = await Promise.all([
      ...Array.from({ length: 6 }, () => instance.admit("creator-1")),
      ...Array.from({ length: 3 }, () => instance.admit("creator-2")),
    ]);

    expect(
      outcomes.filter((outcome) => outcome.outcome === "admitted"),
    ).toHaveLength(8);
    expect(reservedMillicents("creator-1")).toBe(5000);
    expect(reservedMillicents("creator-2")).toBe(3000);
  });
});
