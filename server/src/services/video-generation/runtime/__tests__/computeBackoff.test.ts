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
