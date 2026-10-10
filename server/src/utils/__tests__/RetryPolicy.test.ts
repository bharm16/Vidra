import { beforeEach, describe, expect, it, vi } from "vitest";
import { RetryPolicy } from "../RetryPolicy";

const { sleepMock } = vi.hoisted(() => ({
  sleepMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../sleep", () => ({
  sleep: sleepMock,
}));

// Mock the logger
vi.mock("@infrastructure/Logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("RetryPolicy.execute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("error handling", () => {
    it("throws immediately when shouldRetry returns false", async () => {
      const error = new Error("Do not retry");
      const fn = vi.fn().mockRejectedValue(error);
      const shouldRetry = vi.fn().mockReturnValue(false);

      await expect(RetryPolicy.execute(fn, { shouldRetry })).rejects.toThrow(
        "Do not retry",
      );
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("throws last error after all retries exhausted", async () => {
      const error = new Error("Persistent failure");
      const fn = vi.fn().mockRejectedValue(error);

      await expect(RetryPolicy.execute(fn, { maxRetries: 2 })).rejects.toThrow(
        "Persistent failure",
      );
      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it("converts non-Error throws to Error objects", async () => {
      const fn = vi.fn().mockRejectedValue("string error");

      await expect(RetryPolicy.execute(fn, { maxRetries: 0 })).rejects.toThrow(
        "string error",
      );
    });
  });

  describe("edge cases", () => {
    it("handles maxRetries of 0 (no retries)", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("fail"));

      await expect(
        RetryPolicy.execute(fn, { maxRetries: 0 }),
      ).rejects.toThrow();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("respects shouldRetry on each attempt", async () => {
      const shouldRetry = vi
        .fn()
        .mockReturnValueOnce(true) // Retry after first failure
        .mockReturnValueOnce(false); // Don't retry after second

      const fn = vi.fn().mockRejectedValue(new Error("fail"));

      await expect(
        RetryPolicy.execute(fn, { shouldRetry, maxRetries: 5 }),
      ).rejects.toThrow();
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe("callbacks", () => {
    it("calls onRetry for each retry attempt", async () => {
      const onRetry = vi.fn();
      const fn = vi.fn().mockRejectedValue(new Error("fail"));

      await expect(
        RetryPolicy.execute(fn, { onRetry, maxRetries: 2 }),
      ).rejects.toThrow();

      // With maxRetries=2, there are 3 attempts total (initial + 2 retries)
      // onRetry is called after each failed attempt before the break
      expect(onRetry).toHaveBeenCalledTimes(3);
      expect(onRetry).toHaveBeenNthCalledWith(1, expect.any(Error), 1);
      expect(onRetry).toHaveBeenNthCalledWith(2, expect.any(Error), 2);
      expect(onRetry).toHaveBeenNthCalledWith(3, expect.any(Error), 3);
    });

    it("does not call onRetry on first attempt or on success", async () => {
      const onRetry = vi.fn();
      const fn = vi.fn().mockResolvedValue("success");

      await RetryPolicy.execute(fn, { onRetry });

      expect(onRetry).not.toHaveBeenCalled();
    });

    it("waits fixed delay between retries when delayMs is set", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("retry me"))
        .mockResolvedValueOnce("ok");

      const result = await RetryPolicy.execute(fn, {
        maxRetries: 1,
        delayMs: 250,
      });

      expect(result).toBe("ok");
      expect(sleepMock).toHaveBeenCalledWith(250);
    });

    it("uses dynamic delay function for exponential-style backoff", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("fail-1"))
        .mockRejectedValueOnce(new Error("fail-2"))
        .mockResolvedValueOnce("ok");
      const getDelayMs = vi.fn((attempt: number) => 100 * attempt);

      const result = await RetryPolicy.execute(fn, {
        maxRetries: 2,
        getDelayMs,
      });

      expect(result).toBe("ok");
      expect(getDelayMs).toHaveBeenNthCalledWith(1, 1);
      expect(getDelayMs).toHaveBeenNthCalledWith(2, 2);
      expect(sleepMock).toHaveBeenNthCalledWith(1, 100);
      expect(sleepMock).toHaveBeenNthCalledWith(2, 200);
    });
  });
});

describe("RetryPolicy.createApiErrorFilter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("core behavior", () => {
    it("returns false for errors with APIError name", () => {
      const filter = RetryPolicy.createApiErrorFilter();
      const error = Object.assign(new Error("API error"), { name: "APIError" });

      expect(filter(error, 0)).toBe(false);
    });

    it("returns false for errors with statusCode", () => {
      const filter = RetryPolicy.createApiErrorFilter();
      const error = Object.assign(new Error("HTTP error"), { statusCode: 429 });

      expect(filter(error, 0)).toBe(false);
    });

    it("returns true for regular errors without API markers", () => {
      const filter = RetryPolicy.createApiErrorFilter();
      const error = new Error("Network timeout");

      expect(filter(error, 0)).toBe(true);
    });
  });
});

describe("RetryPolicy.exponentialBackoff", () => {
  it("produces increasing delays for successive attempts", () => {
    // Use jitterMs=0 for deterministic testing
    const backoff = RetryPolicy.exponentialBackoff({
      baseDelayMs: 100,
      jitterMs: 0,
    });

    expect(backoff(1)).toBe(100); // 100 * 2^0
    expect(backoff(2)).toBe(200); // 100 * 2^1
    expect(backoff(3)).toBe(400); // 100 * 2^2
  });

  it("adds jitter within bounds", () => {
    const backoff = RetryPolicy.exponentialBackoff({
      baseDelayMs: 100,
      jitterMs: 50,
    });

    // Run several times to check bounds
    for (let i = 0; i < 20; i++) {
      const delay = backoff(1);
      expect(delay).toBeGreaterThanOrEqual(100);
      expect(delay).toBeLessThanOrEqual(150);
    }
  });
});
