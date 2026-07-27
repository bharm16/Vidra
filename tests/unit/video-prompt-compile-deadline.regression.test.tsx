/**
 * Regression: a compile that misses its deadline must be observable.
 *
 * The client deadline was 4s while one compile runs two sequential Gemini
 * calls server-side whose own budgets total 75s. Every miss landed in an empty
 * catch, so the motion step returned the raw prompt with no signal at all — a
 * dead step was indistinguishable from a successful no-op.
 *
 * jsdom (.tsx) is required: compileWanPrompt schedules its deadline on
 * `window.setTimeout`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { errorSpy, debugSpy, warnSpy, infoSpy } = vi.hoisted(() => ({
  errorSpy: vi.fn(),
  debugSpy: vi.fn(),
  warnSpy: vi.fn(),
  infoSpy: vi.fn(),
}));

vi.mock("@/services", () => ({
  promptOptimizationApiV2: { compilePrompt: vi.fn() },
}));

vi.mock("@/services/LoggingService", () => ({
  logger: {
    child: () => ({
      error: errorSpy,
      debug: debugSpy,
      warn: warnSpy,
      info: infoSpy,
    }),
  },
}));

const { compileWanPrompt, COMPILE_TIMEOUT_MS } = await import(
  "@/features/generations/api/compilePrompt"
);
const { promptOptimizationApiV2 } = await import("@/services");

/** Never settles on its own; rejects only when its signal aborts. */
const neverResolvingCompile = () =>
  vi.mocked(promptOptimizationApiV2.compilePrompt).mockImplementation(
    ({ signal }) =>
      new Promise((_, reject) => {
        signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      }),
  );

describe("compileWanPrompt deadline observability (regression)", () => {
  let abortController: AbortController;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    abortController = new AbortController();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the full server-side compile budget", () => {
    // Two sequential LLM calls: 30_000ms IR extraction + 45_000ms rewrite.
    expect(COMPILE_TIMEOUT_MS).toBeGreaterThanOrEqual(75_000);
  });

  it("surfaces a deadline miss instead of returning the raw prompt silently", async () => {
    neverResolvingCompile();

    const resultPromise = compileWanPrompt(
      "original prompt",
      abortController.signal,
    );
    await vi.advanceTimersByTimeAsync(COMPILE_TIMEOUT_MS + 1);

    await expect(resultPromise).resolves.toBe("original prompt");
    expect(errorSpy).toHaveBeenCalledTimes(1);

    const [message, error, meta] = errorSpy.mock.calls[0] as [
      string,
      Error,
      Record<string, unknown>,
    ];
    expect(message).toContain("deadline");
    expect(error).toBeInstanceOf(Error);
    expect(meta).toMatchObject({
      operation: "compileWanPrompt",
      deadlineMs: COMPILE_TIMEOUT_MS,
    });
  });

  it("surfaces a request failure instead of swallowing it", async () => {
    vi.mocked(promptOptimizationApiV2.compilePrompt).mockRejectedValue(
      new Error("compile exploded"),
    );

    const result = await compileWanPrompt(
      "  original prompt  ",
      abortController.signal,
    );

    expect(result).toBe("original prompt");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[1]).toMatchObject({
      message: "compile exploded",
    });
  });

  it("does not report a caller-initiated cancel as a failure", async () => {
    neverResolvingCompile();

    const resultPromise = compileWanPrompt(
      "original prompt",
      abortController.signal,
    );
    abortController.abort();
    await vi.advanceTimersByTimeAsync(1);

    await expect(resultPromise).resolves.toBe("original prompt");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(debugSpy).toHaveBeenCalledTimes(1);
  });
});
