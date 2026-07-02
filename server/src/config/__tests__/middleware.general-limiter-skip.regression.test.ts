import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { applyRateLimitingMiddleware } from "../middleware.config";
import { closeLoopbackServers, listenOnLoopback } from "./loopbackTestServer";

afterEach(closeLoopbackServers);

/**
 * Regression: general limiter must not double-count routes with dedicated limiters.
 *
 * Previously, every /api/ request counted against both the general
 * limiter (15-min window, 100 req in prod / 25 without Redis) and its dedicated
 * limiter. During longer QA runs or normal usage without Redis, the general
 * budget was exhausted by API traffic, which then blocked ALL routes including
 * unrelated pages, /assets, and session history.
 *
 * Invariant: For any request to /api/* or /health, the general limiter
 * must be skipped. These routes are protected by their own dedicated limiters.
 * LLM routes (/api/llm/*) are covered by the /api/* invariant.
 */

describe("regression: general limiter skips routes with dedicated limiters", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalVitestWorkerId = process.env.VITEST_WORKER_ID;
  const originalVitest = process.env.VITEST;

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalVitestWorkerId === undefined) {
      delete process.env.VITEST_WORKER_ID;
    } else {
      process.env.VITEST_WORKER_ID = originalVitestWorkerId;
    }

    if (originalVitest === undefined) {
      delete process.env.VITEST;
    } else {
      process.env.VITEST = originalVitest;
    }
  });

  it("API requests do not exhaust the general limiter budget", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.VITEST_WORKER_ID;
    delete process.env.VITEST;

    const app = express();
    applyRateLimitingMiddleware(app);

    app.get("/api/sessions/list", (_req, res) => {
      res.status(200).json({ sessions: [] });
    });
    app.get("/api/payment/status", (_req, res) => {
      res.status(200).json({ status: "active" });
    });
    app.get("/static/page", (_req, res) => {
      res.status(200).send("OK");
    });

    const server = await listenOnLoopback(app);

    // Fire enough API requests to exhaust the old general budget (dev: 500).
    // Under the old regime, the next non-API request would get 429.
    const apiRequests = Array.from({ length: 250 }, (_, i) =>
      i % 2 === 0
        ? request(server).get("/api/sessions/list")
        : request(server).get("/api/payment/status"),
    );
    await Promise.all(apiRequests);

    // A non-API request must still succeed because the general budget
    // was NOT consumed by the /api/ traffic above.
    const staticResponse = await request(server).get("/static/page");
    expect(staticResponse.status).toBe(200);
  });

  it("/api/llm/ requests do not count against the general limiter", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.VITEST_WORKER_ID;
    delete process.env.VITEST;

    const app = express();
    applyRateLimitingMiddleware(app);

    app.post("/api/llm/label-spans", (_req, res) => {
      res.status(200).json({ spans: [] });
    });
    app.get("/static/page", (_req, res) => {
      res.status(200).send("OK");
    });

    const server = await listenOnLoopback(app);

    // Fire LLM requests
    await Promise.all(
      Array.from({ length: 100 }, () =>
        request(server).post("/api/llm/label-spans"),
      ),
    );

    // Non-API request must still work
    const staticResponse = await request(server).get("/static/page");
    expect(staticResponse.status).toBe(200);
  });
});
