import { describe, expect, it } from "vitest";

import { median, updatesPerSecond } from "../hudMath";

describe("hudMath", () => {
  it("median: null when empty, middle value when odd, mean of middles when even", () => {
    expect(median([])).toBeNull();
    expect(median([400])).toBe(400);
    expect(median([300, 400, 900])).toBe(400);
    expect(median([300, 400, 500, 900])).toBe(450);
  });

  it("updatesPerSecond: null until two results, then the inverse EMA of gaps", () => {
    expect(updatesPerSecond([])).toBeNull();
    expect(updatesPerSecond([1_000])).toBeNull();
    // Uniform 500ms gaps → exactly 2 updates/sec regardless of smoothing.
    expect(updatesPerSecond([1_000, 1_500, 2_000, 2_500])).toBeCloseTo(2, 5);
  });

  it("updatesPerSecond: weights recent gaps more than old ones", () => {
    // Slow start (1000ms gaps), fast finish (250ms gaps).
    const speedingUp = updatesPerSecond([0, 1_000, 2_000, 2_250, 2_500]);
    // Simple mean of gaps would give 1000/625 = 1.6/s; EMA must sit above it.
    expect(speedingUp).not.toBeNull();
    expect(speedingUp ?? 0).toBeGreaterThan(1.6);
  });
});
