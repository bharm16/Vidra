import { describe, expect, it } from "vitest";

import { SketchBudgetService } from "../SketchBudgetService";
import {
  SketchAllowanceExceededError,
  type SketchBudgetStore,
  type SketchReservation,
} from "../storage/SketchBudgetStore";

/**
 * In-memory adapter of the SketchBudgetStore port — the test-side
 * implementation of the same compare-and-increment contract Firestore
 * provides. (The Firestore adapter's own guarantees are exercised against a
 * contention-modelling fake in storage/__tests__.)
 */
class FakeSketchBudgetStore implements SketchBudgetStore {
  readonly reservedByDay = new Map<string, number>();
  readonly calls: SketchReservation[] = [];

  async reserve(reservation: SketchReservation): Promise<void> {
    this.calls.push(reservation);
    const key = `${reservation.userId}_${reservation.day}`;
    const reserved = this.reservedByDay.get(key) ?? 0;
    if (reserved + reservation.millicents > reservation.capMillicents) {
      throw new SketchAllowanceExceededError(
        reserved,
        reservation.millicents,
        reservation.capMillicents,
      );
    }
    this.reservedByDay.set(key, reserved + reservation.millicents);
  }
}

/** A store that cannot answer at all — Firestore down, credentials expired. */
class UnavailableStore implements SketchBudgetStore {
  calls = 0;
  async reserve(): Promise<void> {
    this.calls += 1;
    throw new Error("5 NOT_FOUND: no such document collection");
  }
}

function serviceWith(
  store: SketchBudgetStore,
  now: () => Date,
  dailyCapCents = 1,
): SketchBudgetService {
  // 1¢/day at 400 millicents a frame = exactly two frames, so the cap edge
  // lands inside the test instead of ten thousand frames away.
  return new SketchBudgetService({
    store,
    dailyCapCents,
    frameCostMillicents: 400,
    now,
  });
}

describe("SketchBudgetService", () => {
  it("admits a frame under the cap and reserves its estimated cost", async () => {
    const store = new FakeSketchBudgetStore();
    const service = serviceWith(
      store,
      () => new Date("2026-09-17T09:30:00.000Z"),
    );

    const admission = await service.admit("creator-1");

    expect(admission).toEqual({ outcome: "admitted" });
    expect(store.reservedByDay.get("creator-1_2026-09-17")).toBe(400);
    // One store call: the compare-and-increment belongs to the store, so the
    // service can never read a balance and write it back.
    expect(store.calls).toEqual([
      {
        userId: "creator-1",
        day: "2026-09-17",
        millicents: 400,
        capMillicents: 1000,
      },
    ]);
  });

  it("refuses once the day's allowance is spent, and says when it returns", async () => {
    const store = new FakeSketchBudgetStore();
    const service = serviceWith(
      store,
      () => new Date("2026-09-17T23:59:00.000Z"),
    );

    expect(await service.admit("creator-1")).toEqual({ outcome: "admitted" });
    expect(await service.admit("creator-1")).toEqual({ outcome: "admitted" });
    const refused = await service.admit("creator-1");

    expect(refused).toEqual({
      outcome: "allowance-reached",
      resetAtMs: Date.UTC(2026, 8, 18),
    });
    // The refused frame reserved nothing — the counter is untouched.
    expect(store.reservedByDay.get("creator-1_2026-09-17")).toBe(800);
  });

  it("caps each creator independently", async () => {
    const store = new FakeSketchBudgetStore();
    const service = serviceWith(
      store,
      () => new Date("2026-09-17T09:30:00.000Z"),
    );

    await service.admit("creator-1");
    await service.admit("creator-1");

    expect(await service.admit("creator-1")).toMatchObject({
      outcome: "allowance-reached",
    });
    expect(await service.admit("creator-2")).toEqual({ outcome: "admitted" });
  });

  it("restores the allowance at the UTC day boundary", async () => {
    const store = new FakeSketchBudgetStore();
    let at = new Date("2026-09-17T23:59:59.000Z");
    const service = serviceWith(store, () => at);

    await service.admit("creator-1");
    await service.admit("creator-1");
    expect(await service.admit("creator-1")).toMatchObject({
      outcome: "allowance-reached",
    });

    // One second later — a new UTC calendar day, the studio cap's boundary.
    at = new Date("2026-09-18T00:00:00.000Z");
    expect(await service.admit("creator-1")).toEqual({ outcome: "admitted" });
    expect(store.reservedByDay.get("creator-1_2026-09-18")).toBe(400);
  });

  it("fails closed when the budget store cannot answer", async () => {
    const store = new UnavailableStore();
    const service = serviceWith(
      store,
      () => new Date("2026-09-17T09:30:00.000Z"),
    );

    expect(await service.admit("creator-1")).toEqual({
      outcome: "budget-unavailable",
    });
    expect(store.calls).toBe(1);
  });
});
