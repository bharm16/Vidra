import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PollingWorkerBase } from "../PollingWorkerBase";

vi.mock("@infrastructure/Logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

interface RunOnceController {
  runOnce: ReturnType<typeof vi.fn>;
  runs: number;
}

class TestWorker extends PollingWorkerBase {
  public readonly controller: RunOnceController;

  constructor(opts: {
    workerId: string;
    basePollIntervalMs: number;
    maxPollIntervalMs?: number;
    backoffFactor?: number;
    initialJitter?: boolean;
    runOnceImpl: () => Promise<boolean>;
    metrics?: {
      recordAlert: (name: string, meta?: Record<string, unknown>) => void;
    };
  }) {
    super({
      workerId: opts.workerId,
      basePollIntervalMs: opts.basePollIntervalMs,
      ...(opts.maxPollIntervalMs !== undefined
        ? { maxPollIntervalMs: opts.maxPollIntervalMs }
        : {}),
      ...(opts.backoffFactor !== undefined
        ? { backoffFactor: opts.backoffFactor }
        : {}),
      ...(opts.initialJitter !== undefined
        ? { initialJitter: opts.initialJitter }
        : {}),
      ...(opts.metrics ? { metrics: opts.metrics } : {}),
    });
    this.controller = { runOnce: vi.fn(opts.runOnceImpl), runs: 0 };
  }

  protected async runOnce(): Promise<boolean> {
    this.controller.runs += 1;
    const result = await this.controller.runOnce();
    if (result) {
      this.markRunSuccess();
    } else {
      this.markRunFailure();
    }
    return result;
  }

  // Expose protected helpers for assertions.
  public currentInterval(): number {
    return this.getCurrentPollIntervalMs();
  }
}

describe("PollingWorkerBase", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("jitters the first tick within [0, basePollIntervalMs) when enabled", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const worker = new TestWorker({
      workerId: "jittered",
      basePollIntervalMs: 1_000,
      initialJitter: true,
      runOnceImpl: async () => true,
    });

    worker.start();
    const firstCall = setTimeoutSpy.mock.calls[0];
    expect(firstCall).toBeDefined();
    expect(firstCall![1]).toBe(500);

    worker.stop();
  });

  it("applies exponential backoff when runOnce throws", async () => {
    const recordAlert = vi.fn();
    const worker = new TestWorker({
      workerId: "throws",
      basePollIntervalMs: 1_000,
      maxPollIntervalMs: 16_000,
      backoffFactor: 2,
      runOnceImpl: async () => {
        throw new Error("boom");
      },
      metrics: { recordAlert },
    });

    worker.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(worker.currentInterval()).toBe(2_000); // 1000 * 2

    await vi.advanceTimersByTimeAsync(2_000);
    expect(worker.currentInterval()).toBe(4_000);

    await vi.advanceTimersByTimeAsync(4_000);
    expect(worker.currentInterval()).toBe(8_000);

    expect(recordAlert).toHaveBeenCalledWith("worker_loop_crash", {
      worker: "throws",
    });

    worker.stop();
  });

  it("caps backoff at maxPollIntervalMs", async () => {
    const worker = new TestWorker({
      workerId: "capped",
      basePollIntervalMs: 1_000,
      maxPollIntervalMs: 3_000,
      backoffFactor: 2,
      runOnceImpl: async () => false,
    });

    worker.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(worker.currentInterval()).toBe(2_000);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(worker.currentInterval()).toBe(3_000); // capped

    await vi.advanceTimersByTimeAsync(3_000);
    expect(worker.currentInterval()).toBe(3_000); // still capped

    worker.stop();
  });

  it("resets backoff to base interval when runOnce returns true", async () => {
    let nextResult = false;
    const worker = new TestWorker({
      workerId: "recover",
      basePollIntervalMs: 1_000,
      maxPollIntervalMs: 16_000,
      backoffFactor: 2,
      runOnceImpl: async () => nextResult,
    });

    worker.start();
    // First tick: failure -> backoff to 2000
    await vi.advanceTimersByTimeAsync(1);
    expect(worker.currentInterval()).toBe(2_000);

    // Switch to success on next tick
    nextResult = true;
    await vi.advanceTimersByTimeAsync(2_000);
    expect(worker.currentInterval()).toBe(1_000); // reset

    worker.stop();
  });

  it("stop() halts the timer and prevents further ticks", async () => {
    const worker = new TestWorker({
      workerId: "stoppable",
      basePollIntervalMs: 1_000,
      runOnceImpl: async () => true,
    });

    worker.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(worker.controller.runs).toBe(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(worker.controller.runs).toBe(2);

    worker.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(worker.controller.runs).toBe(2); // no further ticks
  });

  it("start() is idempotent — second call is a no-op", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const worker = new TestWorker({
      workerId: "idempotent",
      basePollIntervalMs: 1_000,
      runOnceImpl: async () => true,
    });

    worker.start();
    const callsAfterFirstStart = setTimeoutSpy.mock.calls.length;
    worker.start();
    expect(setTimeoutSpy.mock.calls.length).toBe(callsAfterFirstStart);

    worker.stop();
  });

  it("getStatus reflects the state machine across success and failure", async () => {
    let nextResult = true;
    const worker = new TestWorker({
      workerId: "status",
      basePollIntervalMs: 1_000,
      runOnceImpl: async () => nextResult,
    });

    expect(worker.getStatus()).toEqual({
      running: false,
      lastRunAt: null,
      lastSuccessfulRunAt: null,
      consecutiveFailures: 0,
    });

    worker.start();
    expect(worker.getStatus().running).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    const afterSuccess = worker.getStatus();
    expect(afterSuccess.consecutiveFailures).toBe(0);
    expect(afterSuccess.lastRunAt).toBeInstanceOf(Date);
    expect(afterSuccess.lastSuccessfulRunAt).toBeInstanceOf(Date);

    nextResult = false;
    await vi.advanceTimersByTimeAsync(1_000);
    const afterFailure = worker.getStatus();
    expect(afterFailure.consecutiveFailures).toBe(1);
    expect(afterFailure.lastSuccessfulRunAt).toEqual(
      afterSuccess.lastSuccessfulRunAt,
    );

    nextResult = true;
    // Backoff is now 2000ms after one failure
    await vi.advanceTimersByTimeAsync(2_000);
    expect(worker.getStatus().consecutiveFailures).toBe(0);

    worker.stop();
  });

  it("consecutiveFailures increments on throw and resets on success", async () => {
    let shouldThrow = true;
    const worker = new TestWorker({
      workerId: "throw-then-recover",
      basePollIntervalMs: 1_000,
      runOnceImpl: async () => {
        if (shouldThrow) {
          throw new Error("transient");
        }
        return true;
      },
    });

    worker.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(worker.getStatus().consecutiveFailures).toBe(1);

    // Backoff now 2000ms
    await vi.advanceTimersByTimeAsync(2_000);
    expect(worker.getStatus().consecutiveFailures).toBe(2);

    shouldThrow = false;
    // Backoff now 4000ms
    await vi.advanceTimersByTimeAsync(4_000);
    expect(worker.getStatus().consecutiveFailures).toBe(0);

    worker.stop();
  });
});
