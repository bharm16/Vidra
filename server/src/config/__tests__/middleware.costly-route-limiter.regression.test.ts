import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyRateLimitingMiddleware, COSTLY_ROUTE_LIMIT } from "../middleware.config";
import { closeLoopbackServers, listenOnLoopback } from "./loopbackTestServer";

/**
 * One in-memory limiter guards the routes that spend provider money without
 * a daily spend cap of their own. It replaced a Redis-backed stack whose
 * health flag started false in production when Redis was never configured,
 * so every /api/llm/* request returned a permanent 503.
 */

const restoreEnv = (key: string, value: string | undefined): void => {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
};

const ok = (_req: express.Request, res: express.Response): void => {
  res.status(200).json({ success: true, data: { ok: true } });
};

describe("regression: costly-route limiter", () => {
  const original = {
    NODE_ENV: process.env.NODE_ENV,
    VITEST: process.env.VITEST,
    VITEST_WORKER_ID: process.env.VITEST_WORKER_ID,
  };

  beforeEach(() => {
    process.env.NODE_ENV = "production";
    delete process.env.VITEST;
    delete process.env.VITEST_WORKER_ID;
  });

  afterEach(async () => {
    await closeLoopbackServers();
    for (const [key, value] of Object.entries(original)) {
      restoreEnv(key, value);
    }
  });

  const buildServer = async () => {
    const app = express();
    applyRateLimitingMiddleware(app);
    app.post("/api/llm/label-spans", ok);
    app.post("/api/optimize", ok);
    app.get("/api/projects", ok);
    return await listenOnLoopback(app);
  };

  it("serves /api/llm in production with no Redis configured", async () => {
    const server = await buildServer();

    const response = await request(server).post("/api/llm/label-spans");

    expect(response.status).toBe(200);
  });

  it("rejects a costly request past the shared per-IP budget with RATE_LIMITED", async () => {
    const server = await buildServer();

    for (let i = 0; i < COSTLY_ROUTE_LIMIT; i += 1) {
      const path = i % 2 === 0 ? "/api/llm/label-spans" : "/api/optimize";
      expect((await request(server).post(path)).status).toBe(200);
    }

    const limited = await request(server).post("/api/optimize");

    expect(limited.status).toBe(429);
    expect(limited.headers["retry-after"]).toBeDefined();
    expect(limited.body).toMatchObject({ success: false, code: "RATE_LIMITED" });
    expect(typeof limited.body.error).toBe("string");
  });

  it("does not count or block routes that cost nothing", async () => {
    const server = await buildServer();

    for (let i = 0; i < COSTLY_ROUTE_LIMIT; i += 1) {
      await request(server).post("/api/llm/label-spans");
    }

    expect((await request(server).post("/api/llm/label-spans")).status).toBe(429);
    expect((await request(server).get("/api/projects")).status).toBe(200);
  });
});
