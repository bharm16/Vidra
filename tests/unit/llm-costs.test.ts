import { describe, it, expect } from "vitest";
import { calculateLLMCost } from "@config/llmCosts";

describe("calculateLLMCost", () => {
  it("calculates cost for exact model match", () => {
    // gpt-4o-mini: input $0.00015/1K, output $0.0006/1K
    const cost = calculateLLMCost("gpt-4o-mini", 1000, 500);
    expect(cost).toBeCloseTo(0.00015 + 0.0003, 8);
  });

  it("prefers longer prefix match over shorter", () => {
    // gpt-4o-mini-2024-07-18 should match gpt-4o-mini (not gpt-4o)
    const cost = calculateLLMCost("gpt-4o-mini-2024-07-18", 1000, 1000);
    expect(cost).toBeCloseTo(0.00015 + 0.0006, 8);
  });

  it("uses fallback rate for unknown models", () => {
    // Fallback: input $0.001/1K, output $0.002/1K
    const cost = calculateLLMCost("unknown-model-xyz", 1000, 1000);
    expect(cost).toBeCloseTo(0.001 + 0.002, 8);
  });

  it("returns zero cost for zero tokens", () => {
    expect(calculateLLMCost("gpt-4o", 0, 0)).toBe(0);
  });
});
