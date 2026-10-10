import { afterEach, describe, expect, it, vi } from "vitest";
import { ConcurrencyLimiter } from "../ConcurrencyLimiter";

vi.mock("@infrastructure/Logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("ConcurrencyLimiter", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("queues overflow requests and processes them when slots free up", async () => {
    const limiter = new ConcurrencyLimiter({
      maxConcurrent: 1,
      queueTimeout: 1000,
    });
    const first = deferred<string>();

    const firstRun = limiter.execute(async () => first.promise);
    const secondRun = limiter.execute(async () => "second");
    expect(limiter.getQueueStatus().queuedRequests).toBe(1);

    first.resolve("first");
    await expect(firstRun).resolves.toBe("first");
    await expect(secondRun).resolves.toBe("second");
    expect(limiter.getStats().totalQueued).toBe(1);
  });

  it("cancels oldest queued request when priority request arrives", async () => {
    const limiter = new ConcurrencyLimiter({
      maxConcurrent: 1,
      queueTimeout: 1000,
      enableCancellation: true,
    });
    const first = deferred<string>();

    const firstRun = limiter.execute(async () => first.promise);
    const secondRun = limiter.execute(async () => "second");
    const thirdRun = limiter.execute(async () => "third", { priority: true });

    await expect(secondRun).rejects.toThrow(
      "Request cancelled by higher priority request",
    );

    first.resolve("first");
    await expect(firstRun).resolves.toBe("first");
    await expect(thirdRun).resolves.toBe("third");
    expect(limiter.getStats().totalCancelled).toBe(1);
  });

  it("times out queued requests and classifies timeout errors", async () => {
    vi.useFakeTimers();
    const limiter = new ConcurrencyLimiter({
      maxConcurrent: 1,
      queueTimeout: 20,
    });
    const first = deferred<string>();

    void limiter.execute(async () => first.promise);
    const queued = limiter.execute(async () => "later");
    const rejection = expect(queued).rejects.toMatchObject({
      code: "QUEUE_TIMEOUT",
    });

    await vi.advanceTimersByTimeAsync(25);
    await rejection;

    first.resolve("done");
  });

  it("cancels queued requests via AbortSignal", async () => {
    const limiter = new ConcurrencyLimiter({
      maxConcurrent: 1,
      queueTimeout: 1000,
    });
    const first = deferred<string>();

    void limiter.execute(async () => first.promise);
    const controller = new AbortController();
    const queued = limiter.execute(async () => "later", {
      signal: controller.signal,
    });
    controller.abort();

    await expect(queued).rejects.toMatchObject({ code: "CANCELLED" });
    first.resolve("done");
  });

  it("clearQueue rejects all pending requests", async () => {
    const limiter = new ConcurrencyLimiter({
      maxConcurrent: 1,
      queueTimeout: 1000,
    });
    const first = deferred<string>();

    void limiter.execute(async () => first.promise);
    const queued = limiter.execute(async () => "later");
    limiter.clearQueue();

    await expect(queued).rejects.toThrow("Queue cleared");
    first.resolve("done");
    expect(limiter.getQueueStatus().queuedRequests).toBe(0);
  });
});
