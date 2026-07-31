import { describe, it, expect } from "vitest";
import { calculateLLMCost } from "@config/llmCosts";
import { DEFAULT_QWEN_MODEL } from "@config/modelConfig";

describe("calculateLLMCost", () => {
  it("calculates cost for exact model match", () => {
    // gpt-4o-mini: input $0.00015/1K, output $0.0006/1K
    const cost = calculateLLMCost("gpt-4o-mini", 1000, 500);
    expect(cost).toBeCloseTo(0.00015 + 0.0003, 8);
  });

  it("calculates cost for prefix model match (versioned model ID)", () => {
    // gpt-4o-2024-08-06 should match gpt-4o prefix
    const cost = calculateLLMCost("gpt-4o-2024-08-06", 2000, 1000);
    // gpt-4o: input $0.0025/1K, output $0.01/1K
    expect(cost).toBeCloseTo(0.005 + 0.01, 8);
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

  it("handles Gemini model cost", () => {
    const cost = calculateLLMCost("gemini-2.5-flash", 10000, 2000);
    // input: 10 * 0.00015 = 0.0015, output: 2 * 0.0006 = 0.0012
    expect(cost).toBeCloseTo(0.0015 + 0.0012, 8);
  });

  it("handles Qwen model cost", () => {
    // Keyed by DEFAULT_QWEN_MODEL so the next Groq model retirement moves
    // this test with the constant instead of stranding it on a dead id.
    const cost = calculateLLMCost(DEFAULT_QWEN_MODEL, 5000, 1000);
    // input: 5 * 0.0006 = 0.003, output: 1 * 0.003 = 0.003
    expect(cost).toBeCloseTo(0.003 + 0.003, 8);
  });

  it("handles Claude model cost", () => {
    const cost = calculateLLMCost("claude-sonnet-4", 1000, 500);
    // input: 1 * 0.003 = 0.003, output: 0.5 * 0.015 = 0.0075
    expect(cost).toBeCloseTo(0.003 + 0.0075, 8);
  });
});
