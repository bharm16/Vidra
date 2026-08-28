import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@infrastructure/Logger", () => ({
  logger: {
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
}));

import { CreditRefundSweeper } from "@services/credits/CreditRefundSweeper";

function createMockDeps() {
  return {
    failureStore: {
      claimNextPending: vi.fn().mockResolvedValue(null),
      markResolved: vi.fn().mockResolvedValue(undefined),
      markEscalated: vi.fn().mockResolvedValue(undefined),
      releaseForRetry: vi.fn().mockResolvedValue(undefined),
    },
    userCreditService: {
      refundCredits: vi.fn().mockResolvedValue(true),
    },
    metrics: {
      recordAlert: vi.fn(),
    },
  };
}

describe("Worker crash recovery (runLoop supervision)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reschedules the worker after runOnce throws an uncaught error", async () => {
    const deps = createMockDeps();

    const sweeper = new CreditRefundSweeper(
      deps.failureStore as never,
      deps.userCreditService as never,
      {
        sweepIntervalMs: 1_000,
        maxPerRun: 5,
        maxAttempts: 3,
      },
      deps.metrics,
    );

    // Make runOnce throw an error that escapes its internal try/catch.
    // We spy on the private method and force it to reject.
    let callCount = 0;
    vi.spyOn(sweeper as never, "runOnce").mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) {
        throw new Error("Catastrophic failure in finally block");
      }
      // Second call succeeds normally
      return true;
    });

    sweeper.start();

    // First tick: triggers runLoop → runOnce throws → catch reschedules
    await vi.advanceTimersByTimeAsync(10);

    // The worker should still be running despite the crash
    expect(sweeper.getStatus().running).toBe(true);
    expect(sweeper.getStatus().consecutiveFailures).toBe(1);

    // Advance past the backoff interval to trigger the second run
    await vi.advanceTimersByTimeAsync(2_100);

    // Second call should succeed — worker recovered
    expect(callCount).toBe(2);

    sweeper.stop();
  });

  it("fires worker_loop_crash alert when runOnce throws unexpectedly", async () => {
    const deps = createMockDeps();

    const sweeper = new CreditRefundSweeper(
      deps.failureStore as never,
      deps.userCreditService as never,
      {
        sweepIntervalMs: 1_000,
        maxPerRun: 5,
        maxAttempts: 3,
      },
      deps.metrics,
    );

    vi.spyOn(sweeper as never, "runOnce").mockRejectedValueOnce(
      new Error("Unexpected throw from runOnce"),
    );

    sweeper.start();
    await vi.advanceTimersByTimeAsync(10);
    sweeper.stop();

    expect(deps.metrics.recordAlert).toHaveBeenCalledWith(
      "worker_loop_crash",
      expect.objectContaining({ worker: "CreditRefundSweeper" }),
    );
  });

  it("increments consecutiveFailures on loop crash", async () => {
    const deps = createMockDeps();

    const sweeper = new CreditRefundSweeper(
      deps.failureStore as never,
      deps.userCreditService as never,
      {
        sweepIntervalMs: 1_000,
        maxPerRun: 5,
        maxAttempts: 3,
      },
      deps.metrics,
    );

    // Both calls throw
    vi.spyOn(sweeper as never, "runOnce")
      .mockRejectedValueOnce(new Error("crash 1"))
      .mockRejectedValueOnce(new Error("crash 2"));

    sweeper.start();

    // First crash
    await vi.advanceTimersByTimeAsync(10);
    expect(sweeper.getStatus().consecutiveFailures).toBe(1);

    // Advance past the backoff to trigger second run
    await vi.advanceTimersByTimeAsync(2_100);
    expect(sweeper.getStatus().consecutiveFailures).toBe(2);

    sweeper.stop();
  });

  it("applies backoff after loop crash", async () => {
    const deps = createMockDeps();

    const sweeper = new CreditRefundSweeper(
      deps.failureStore as never,
      deps.userCreditService as never,
      {
        sweepIntervalMs: 1_000,
        maxSweepIntervalMs: 16_000,
        backoffFactor: 2,
        maxPerRun: 5,
        maxAttempts: 3,
      },
      deps.metrics,
    );

    let runOnceCallCount = 0;
    vi.spyOn(sweeper as never, "runOnce").mockImplementation(async () => {
      runOnceCallCount += 1;
      throw new Error(`crash ${runOnceCallCount}`);
    });

    sweeper.start();

    // Initial run (delay 0) — crash → backoff to 2s (1000 * 2)
    await vi.advanceTimersByTimeAsync(10);
    expect(runOnceCallCount).toBe(1);

    // Advance 1.5s — should NOT have run again yet (backoff is 2s)
    await vi.advanceTimersByTimeAsync(1_500);
    expect(runOnceCallCount).toBe(1);

    // Advance another 600ms (total 2.1s) — should trigger second run
    await vi.advanceTimersByTimeAsync(600);
    expect(runOnceCallCount).toBe(2);

    sweeper.stop();
  });
});
