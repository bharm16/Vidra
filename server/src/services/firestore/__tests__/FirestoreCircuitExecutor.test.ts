import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { FakeBreaker, breakerState, loggerMocks } = vi.hoisted(() => {
  class FakeBreaker {
    public opened = false;
    public halfOpen = false;
    public stats: Record<string, unknown> = {};
    public readonly options: Record<string, unknown>;
    private readonly action: (
      operation: () => Promise<unknown>,
    ) => Promise<unknown>;
    private readonly handlers = new Map<string, () => void>();

    constructor(
      action: (operation: () => Promise<unknown>) => Promise<unknown>,
      options: Record<string, unknown>,
    ) {
      this.action = action;
      this.options = options;
      breakerState.instances.push(this);
    }

    fire(operation: () => Promise<unknown>): Promise<unknown> {
      return this.action(operation);
    }

    on(event: string, handler: () => void): this {
      this.handlers.set(event, handler);
      return this;
    }

    emit(event: string): void {
      this.handlers.get(event)?.();
    }
  }

  const breakerState = {
    instances: [] as FakeBreaker[],
  };

  const loggerMocks = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  };

  return { FakeBreaker, breakerState, loggerMocks };
});

vi.mock("opossum", () => ({
  default: FakeBreaker,
}));

vi.mock("@infrastructure/Logger", () => ({
  logger: {
    child: vi.fn(() => loggerMocks),
  },
}));

import {
  FirestoreCircuitExecutor,
  getFirestoreCircuitExecutor,
  setFirestoreCircuitExecutor,
} from "../FirestoreCircuitExecutor";

const getLatestBreaker = (): InstanceType<typeof FakeBreaker> => {
  const breaker = breakerState.instances.at(-1);
  if (!breaker) {
    throw new Error("Expected a breaker instance");
  }
  return breaker;
};

describe("FirestoreCircuitExecutor", () => {
  beforeEach(() => {
    breakerState.instances.length = 0;
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    setFirestoreCircuitExecutor(new FirestoreCircuitExecutor());
  });

  it("retries transient failures and eventually succeeds", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const executor = new FirestoreCircuitExecutor({
      retryBaseDelayMs: 120,
      retryJitterMs: 80,
      maxRetries: 2,
    });

    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(
        Object.assign(new Error("service unavailable"), {
          code: "unavailable",
        }),
      )
      .mockResolvedValueOnce("ok");

    const resultPromise = executor.executeWrite("write-op", operation);

    expect(operation).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(120);

    await expect(resultPromise).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      "Retrying Firestore operation after transient failure",
      expect.objectContaining({
        operation: "write-op",
        kind: "write",
        attempt: 1,
        maxAttempts: 3,
      }),
    );
  });

  it("stops retrying after the configured max attempts", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const executor = new FirestoreCircuitExecutor({
      retryBaseDelayMs: 100,
      retryJitterMs: 0,
      maxRetries: 1,
    });

    const operation = vi.fn<() => Promise<never>>().mockRejectedValue(
      Object.assign(new Error("temporarily unavailable"), {
        code: "unavailable",
      }),
    );

    const resultPromise = executor.executeRead("read-op", operation);
    const rejectionExpectation = expect(resultPromise).rejects.toThrow(
      "temporarily unavailable",
    );

    await vi.advanceTimersByTimeAsync(100);

    await rejectionExpectation;
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("propagates non-transient failures without retrying", async () => {
    const executor = new FirestoreCircuitExecutor({
      maxRetries: 3,
    });
    const operation = vi.fn<() => Promise<never>>().mockRejectedValue(
      Object.assign(new Error("permission denied"), {
        code: "permission-denied",
      }),
    );

    await expect(executor.executeRead("read-op", operation)).rejects.toThrow(
      "permission denied",
    );
    expect(operation).toHaveBeenCalledTimes(1);
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      "Firestore circuit execution failed",
      expect.objectContaining({
        operation: "read-op",
        kind: "read",
        error: "permission denied",
        circuitState: "closed",
      }),
    );
  });

  it.each([
    {
      label: "open circuit state",
      setup: (breaker: InstanceType<typeof FakeBreaker>) => {
        breaker.opened = true;
      },
      expected: {
        state: "open",
        degraded: true,
        open: true,
      },
    },
    {
      label: "excessive failure rate",
      setup: (breaker: InstanceType<typeof FakeBreaker>) => {
        breaker.stats = {
          fires: 10,
          failures: 6,
          timeouts: 0,
          rejects: 0,
          successes: 4,
          latencyMean: 100,
        };
      },
      expected: {
        state: "closed",
        degraded: true,
        open: false,
      },
    },
    {
      label: "excessive latency",
      setup: (breaker: InstanceType<typeof FakeBreaker>) => {
        breaker.stats = {
          fires: 10,
          failures: 0,
          timeouts: 0,
          rejects: 0,
          successes: 10,
          latencyMean: 1600,
        };
      },
      expected: {
        state: "closed",
        degraded: true,
        open: false,
      },
    },
  ])("marks readiness degraded for $label", ({ setup, expected }) => {
    const executor = new FirestoreCircuitExecutor();
    const breaker = getLatestBreaker();

    setup(breaker);

    const snapshot = executor.getReadinessSnapshot();

    expect(snapshot).toMatchObject(expected);
    if (expected.state === "closed") {
      expect(snapshot.thresholds).toEqual({
        failureRate: 0.5,
        latencyMs: 1500,
      });
    }
  });
});
