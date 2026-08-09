import { describe, it, expect, vi } from "vitest";
import {
  calculateMaxTokens,
  checkContextSize,
  estimateContextTokens,
} from "../contextBudget";
import type { ILogger } from "@interfaces/ILogger";

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

describe("estimateContextTokens", () => {
  it("counts the system prompt and every message at ~4 chars per token", () => {
    expect(
      estimateContextTokens("a".repeat(400), [
        { role: "user", content: "b".repeat(200) },
        { role: "assistant", content: "c".repeat(200) },
      ]),
    ).toBe(200);
  });

  it("rounds each part up independently", () => {
    // 1 char -> 1 token each, not 3 chars -> 1 token overall.
    expect(
      estimateContextTokens("a", [
        { role: "user", content: "b" },
        { role: "user", content: "c" },
      ]),
    ).toBe(3);
  });
});

describe("checkContextSize", () => {
  it("stays silent inside the optimal range", () => {
    const log = fakeLog();
    checkContextSize(8000, log);
    expect(log.info).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });

  it("escalates info -> warn -> error as the context grows", () => {
    const info = fakeLog();
    checkContextSize(40_000, info);
    expect(info.info).toHaveBeenCalledTimes(1);

    const warn = fakeLog();
    checkContextSize(70_000, warn);
    expect(warn.warn).toHaveBeenCalledTimes(1);

    const error = fakeLog();
    checkContextSize(200_000, error);
    expect(error.error).toHaveBeenCalledTimes(1);
  });
});

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
