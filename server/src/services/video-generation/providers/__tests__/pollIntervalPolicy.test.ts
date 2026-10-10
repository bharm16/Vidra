import { describe, expect, it } from "vitest";
import { getSuggestedPollIntervalMs } from "../pollIntervalPolicy";

describe("getSuggestedPollIntervalMs", () => {
  it("returns slow cadence for replicate after the mid phase", () => {
    expect(getSuggestedPollIntervalMs("replicate", 5 * 60_000)).toBe(10_000);
  });

  it("falls back to the default cadence for an unknown provider", () => {
    expect(getSuggestedPollIntervalMs("never-heard-of-it", 30_000)).toBe(2_000);
    expect(getSuggestedPollIntervalMs(undefined, 30_000)).toBe(2_000);
    expect(getSuggestedPollIntervalMs(undefined, 90_000)).toBe(5_000);
    expect(getSuggestedPollIntervalMs(undefined, 10 * 60_000)).toBe(8_000);
  });
});
