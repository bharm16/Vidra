import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { errorHandler } from "@middleware/errorHandler";
import {
  __resetRateLimitHealthForTest,
  setRedisRateLimitHealth,
} from "@middleware/rateLimitHealth";
import {
  applyRateLimitingMiddleware,
  FALLBACK_LIMIT_DIVISOR,
} from "../middleware.config";
import { closeLoopbackServers, listenOnLoopback } from "./loopbackTestServer";

/**
 * `/api/llm/` mounts two rate-limit guards back to back:
 *
 *   1. `createFailClosedLlmRateLimit()` — throws into `errorHandler` when the
 *      Redis-backed store is unhealthy (503, RATE_LIMIT_UNAVAILABLE).
 *   2. the express-rate-limit limiter — answers directly through
 *      `mountedLimiterJSONHandler` when the budget is spent (429, RATE_LIMITED).
 *
 * They answer the same question — "you are being rate limited, come back
 * later" — but used to return differently SHAPED bodies: guard 1 emitted a
 * NESTED `error: { code, message, retryAfter }` object while guard 2 emitted a
 * FLAT `error` string. A client reading `body.error` as a message therefore got
 * a real string from one guard and `"[object Object]"` (or a thrown ZodError,
 * where the body is hard-`.parse()`d) from the other, depending only on which
 * guard fired.
 *
 * This locks both guards onto the one canonical envelope.
 */

const LLM_PATH = "/api/llm/label-spans";

/** Fields every canonical error body must carry, in agreed order. */
const CANONICAL_KEYS = ["success", "error", "code"] as const;

const canonicalShapeOf = (body: Record<string, unknown>): unknown =>
  Object.fromEntries(
    CANONICAL_KEYS.map((key) => [key, typeof body[key]] as const),
  );

afterEach(async () => {
  await closeLoopbackServers();
  __resetRateLimitHealthForTest();
});

describe("regression: both /api/llm/ rate-limit guards emit one envelope", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalVitestWorkerId = process.env.VITEST_WORKER_ID;
  const originalVitest = process.env.VITEST;

  const restoreEnv = (key: string, value: string | undefined): void => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  };

  afterEach(() => {
    restoreEnv("NODE_ENV", originalNodeEnv);
    restoreEnv("VITEST_WORKER_ID", originalVitestWorkerId);
    restoreEnv("VITEST", originalVitest);
  });

  it("returns the same canonical shape from the fail-closed guard and the limiter", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.VITEST_WORKER_ID;
    delete process.env.VITEST;

    const app = express();
    applyRateLimitingMiddleware(app);
    app.get(LLM_PATH, (_req, res) => {
      res.status(200).json({ success: true, data: { ok: true } });
    });
    app.use(errorHandler);

    const server = await listenOnLoopback(app);

    // Guard 1 — fail closed. Must run before the budget is spent, because the
    // /api/ limiter sits in front of the fail-closed guard in the chain.
    setRedisRateLimitHealth(false);
    const failClosed = await request(server).get(LLM_PATH);
    setRedisRateLimitHealth(true);

    expect(failClosed.status).toBe(503);
    expect(failClosed.body).toMatchObject({
      success: false,
      code: "RATE_LIMIT_UNAVAILABLE",
    });

    // Guard 2 — budget exhausted. Without Redis the limits are divided by
    // FALLBACK_LIMIT_DIVISOR; the /api/ limiter is the tightest on this path.
    const apiDevLimit = 300;
    const effectiveLimit = Math.max(
      1,
      Math.floor(apiDevLimit / FALLBACK_LIMIT_DIVISOR),
    );
    let limited = await request(server).get(LLM_PATH);
    for (let i = 0; i < effectiveLimit + 5 && limited.status !== 429; i += 1) {
      limited = await request(server).get(LLM_PATH);
    }

    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({
      success: false,
      code: "RATE_LIMITED",
    });

    // The invariant: identical envelope shape from both guards.
    expect(canonicalShapeOf(failClosed.body)).toEqual(
      canonicalShapeOf(limited.body),
    );

    // The specific regression: `error` is a STRING on both, never a nested
    // object. This is what a client reads to show the user a message.
    expect(typeof failClosed.body.error).toBe("string");
    expect(typeof limited.body.error).toBe("string");
    expect(failClosed.body.error.length).toBeGreaterThan(0);
    expect(limited.body.error.length).toBeGreaterThan(0);
  });
});
