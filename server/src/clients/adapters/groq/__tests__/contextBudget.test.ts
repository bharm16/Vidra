import type { ILogger } from "@interfaces/ILogger";
import { describe, expect, it, vi } from "vitest";
import { calculateMaxTokens } from "../contextBudget";

/**
 * This arithmetic had no direct coverage while it was private to a
 * 1,046-line adapter — which was the reason to extract it, not the line
 * count. Getting `calculateMaxTokens` wrong either truncates JSON responses
 * or lets a Llama 3 generation loop run away, and neither shows up as a type
 * error.
 */

const fakeLog = (): ILogger =>
  ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }) as unknown as ILogger;

describe("calculateMaxTokens", () => {
  it("caps an explicit request for structured output, but not for prose", () => {
    // Llama 3's common failure mode is runaway generation on JSON.
    expect(calculateMaxTokens(true, 8000)).toBe(2048);
    expect(calculateMaxTokens(false, 8000)).toBe(8000);
  });

  it("honors an explicit request below the structured cap", () => {
    expect(calculateMaxTokens(true, 1000)).toBe(1000);
  });

  it("defaults structured output tighter than prose at every size", () => {
    for (const size of ["small", "medium", "large"] as const) {
      expect(calculateMaxTokens(true, undefined, size)).toBeLessThan(
        calculateMaxTokens(false, undefined, size),
      );
    }
  });

  it("falls back to conservative defaults with no size hint", () => {
    expect(calculateMaxTokens(true)).toBe(512);
    expect(calculateMaxTokens(false)).toBe(1024);
  });
});
