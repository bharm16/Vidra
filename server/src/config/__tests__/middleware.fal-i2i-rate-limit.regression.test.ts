import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { applyRateLimitingMiddleware } from "../middleware.config";
import { closeLoopbackServers, listenOnLoopback } from "./loopbackTestServer";

afterEach(closeLoopbackServers);

/**
 * Regression from the 2026-07-27 live-editor performance diagnosis: the
 * realtime sketch loop is completion-gated at ~1.2–1.6 frames/s (~70–100
 * frames/min sustained), but /api/fal/i2i sat under the general API budget
 * (60/min prod, 15/min without Redis) — a creator drawing continuously
 * started eating 429s mid-session in production while dev (300/min) never
 * showed it. The sketch lane gets its own burst limits instead, like the
 * other high-cadence routes (asset views, video validate).
 */
describe("regression: sketch frames are not starved by the general API budget", () => {
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

  function productionEnv(): void {
    process.env.NODE_ENV = "production";
    delete process.env.VITEST_WORKER_ID;
    delete process.env.VITEST;
  }

  function sketchApp(): express.Express {
    const app = express();
    applyRateLimitingMiddleware(app);
    app.post("/api/fal/i2i", (_req, res) => {
      res.status(200).json({ ok: true });
    });
    return app;
  }

  it("never answers a sketch frame with the general API budget's 429", async () => {
    productionEnv();
    const server = await listenOnLoopback(sketchApp());

    // 20 frames exceeds the Redis-less production API budget (60/4 = 15);
    // before the dedicated lane existed, frames 16+ died with the general
    // budget's message.
    const bodies: unknown[] = [];
    for (let i = 0; i < 20; i += 1) {
      const response = await request(server).post("/api/fal/i2i");
      bodies.push(response.body);
    }

    for (const body of bodies) {
      expect(body).not.toMatchObject({ error: "Global rate limit exceeded" });
    }
  });

  it("keeps its own spend guard: rapid frames beyond the burst cap 429 with the sketch-lane message", async () => {
    productionEnv();
    const server = await listenOnLoopback(sketchApp());

    const statuses: number[] = [];
    const errors: unknown[] = [];
    for (let i = 0; i < 10; i += 1) {
      const response = await request(server).post("/api/fal/i2i");
      statuses.push(response.status);
      errors.push(
        (response.body as { error?: unknown } | undefined)?.error ?? null,
      );
    }

    // The burst cap must clear the loop's physical maximum (~3 frames per 2s
    // with a retry) so legitimate drawing always passes...
    expect(statuses.slice(0, 6)).toEqual([200, 200, 200, 200, 200, 200]);
    // ...while hammering beyond it is refused by the sketch lane itself.
    expect(statuses.slice(6)).toContain(429);
    expect(errors).toContain("Too many sketch frames in a short time");
  });
});
