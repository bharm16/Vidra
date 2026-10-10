import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@infrastructure/Logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import {
  __resetRateLimitHealthForTest,
  createFailClosedLlmRateLimit,
  setRedisRateLimitHealth,
} from "../rateLimitHealth";

describe("rateLimitHealth", () => {
  beforeEach(() => {
    __resetRateLimitHealthForTest();
    vi.clearAllMocks();
  });

  describe("createFailClosedLlmRateLimit middleware", () => {
    const makeRes = (): Response => ({}) as Response;
    const makeReq = (): Request => ({}) as Request;

    it("calls next(err) with RATE_LIMIT_UNAVAILABLE when unhealthy", () => {
      setRedisRateLimitHealth(false);
      const middleware = createFailClosedLlmRateLimit();
      const next = vi.fn() as unknown as NextFunction;

      middleware(makeReq(), makeRes(), next);

      expect(next).toHaveBeenCalledTimes(1);
      const callArg = (next as unknown as { mock: { calls: unknown[][] } }).mock
        .calls[0]?.[0];
      expect(callArg).toBeInstanceOf(Error);
      expect(callArg).toMatchObject({
        code: "RATE_LIMIT_UNAVAILABLE",
        retryAfter: 5,
      });
    });

    it("uses a fresh middleware — state is read on each request, not at creation", () => {
      const middleware = createFailClosedLlmRateLimit();
      const next1 = vi.fn() as unknown as NextFunction;
      const next2 = vi.fn() as unknown as NextFunction;

      // First request: healthy, should pass through
      middleware(makeReq(), makeRes(), next1);
      expect(next1).toHaveBeenCalledWith();

      // Flip unhealthy mid-process
      setRedisRateLimitHealth(false);

      // Second request on the SAME middleware instance: should fail closed
      middleware(makeReq(), makeRes(), next2);
      const arg = (next2 as unknown as { mock: { calls: unknown[][] } }).mock
        .calls[0]?.[0];
      expect(arg).toMatchObject({ code: "RATE_LIMIT_UNAVAILABLE" });
    });
  });
});
