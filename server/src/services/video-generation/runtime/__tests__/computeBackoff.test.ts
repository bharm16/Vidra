import { describe, expect, it } from "vitest";
import {
  computeBackoffMs,
  DLQ_JITTER_RATIO,
  RETRY_JITTER_RATIO,
} from "../computeBackoff";

describe("computeBackoffMs (retry profile, ±10% jitter)", () => {
  const retry = (attempt: number, now: number) =>
    computeBackoffMs(attempt, { jitterRatio: RETRY_JITTER_RATIO, now });

  it("returns at least the base delay for the first retry", () => {
    expect(retry(0, 1000)).toBeGreaterThanOrEqual(30_000);
  });

  it("grows exponentially up to the ceiling (5 minutes), strictly enforced", () => {
    const attempt1 = retry(1, 1000);
    const attempt3 = retry(3, 1000);

    expect(attempt3).toBeGreaterThan(attempt1);
    // The 5-minute ceiling must hold for every possible `now` (jitter source).
    for (let now = 0; now < 1000; now += 1) {
      expect(retry(10, now)).toBeLessThanOrEqual(5 * 60_000);
    }
  });

  it("applies deterministic jitter based on the `now` argument", () => {
    const a = retry(2, 100);
    const b = retry(2, 900);
    expect(a).not.toBe(b);
  });

  it("treats a negative/non-integer attempt count as zero", () => {
    expect(retry(-5, 1000)).toBeGreaterThanOrEqual(30_000);
    expect(retry(Number.NaN, 1000)).toBeGreaterThanOrEqual(30_000);
  });
});

describe("computeBackoffMs (DLQ profile, ±20% jitter)", () => {
  const dlq = (attempt: number, now: number) =>
    computeBackoffMs(attempt, { jitterRatio: DLQ_JITTER_RATIO, now });

  it("returns at least the 30s base delay for attempt 0", () => {
    expect(dlq(0, 1000)).toBeGreaterThanOrEqual(30_000);
  });

  it("grows exponentially toward the 5-minute ceiling", () => {
    const a1 = dlq(1, 1000);
    const a3 = dlq(3, 1000);
    const a10 = dlq(10, 1000);

    expect(a3).toBeGreaterThan(a1);
    for (let now = 0; now < 1000; now += 1) {
      expect(dlq(10, now)).toBeLessThanOrEqual(5 * 60_000);
    }
    expect(a10).toBeLessThanOrEqual(5 * 60_000);
  });

  it("regression: applies jitter so N entries do not retry in lockstep", () => {
    // Two DLQ entries at the same attempt count but different `now` values
    // (as happens when the reprocessor iterates over a batch) must produce
    // different backoffs, preventing provider-outage thundering-herd.
    const a = dlq(3, 100);
    const b = dlq(3, 900);
    expect(a).not.toBe(b);

    // And the spread is meaningful — at least 10% of the uncapped delay.
    const delta = Math.abs(a - b);
    expect(delta).toBeGreaterThan(10_000);
  });

  it("treats a negative or non-integer attempt as zero", () => {
    expect(dlq(-5, 1000)).toBeGreaterThanOrEqual(30_000);
    expect(dlq(Number.NaN, 1000)).toBeGreaterThanOrEqual(30_000);
  });
});
