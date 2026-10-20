import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loggerMocks } = vi.hoisted(() => ({
  loggerMocks: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@infrastructure/Logger", () => ({
  logger: {
    child: vi.fn(() => loggerMocks),
  },
}));

import {
  FirestoreCircuitExecutor,
  setFirestoreCircuitExecutor,
} from "../FirestoreCircuitExecutor";

describe("FirestoreCircuitExecutor", () => {
  beforeEach(() => {
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
      "Firestore operation failed",
      expect.objectContaining({
        operation: "read-op",
        kind: "read",
        error: "permission denied",
      }),
    );
  });
});
