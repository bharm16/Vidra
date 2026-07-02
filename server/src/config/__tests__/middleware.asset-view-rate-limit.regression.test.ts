import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { applyRateLimitingMiddleware } from "../middleware.config";
import { closeLoopbackServers, listenOnLoopback } from "./loopbackTestServer";

afterEach(closeLoopbackServers);

describe("regression: asset-view routes are exempt from the general rate limiter", () => {
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

  it("asset-view requests do not count against the general rate limiter budget", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.VITEST_WORKER_ID;
    delete process.env.VITEST;

    const app = express();
    applyRateLimitingMiddleware(app);

    // Mount dummy handlers — use a non-/api/ path for general-budget requests
    // to avoid also hitting the API-specific limiter (which has a lower cap).
    app.post("/api/preview/image/view-batch", (_req, res) => {
      res.status(200).json({ ok: true });
    });
    app.get("/api/preview/image/view", (_req, res) => {
      res.status(200).json({ ok: true });
    });
    app.get("/general-test", (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const server = await listenOnLoopback(app);

    // Without Redis the general limit is 500/4 = 125.
    // Fire 124 requests to a non-/api/ route to nearly exhaust the general budget.
    for (let i = 0; i < 124; i++) {
      const response = await request(server).get("/general-test");
      expect(response.status).toBe(200);
    }

    // Fire many asset-view requests — these must NOT exhaust the general limiter.
    for (let i = 0; i < 50; i++) {
      const batchRes = await request(server)
        .post("/api/preview/image/view-batch")
        .send({ assetIds: [] });
      expect(batchRes.status).toBe(200);
    }

    for (let i = 0; i < 50; i++) {
      const viewRes = await request(server).get("/api/preview/image/view");
      expect(viewRes.status).toBe(200);
    }

    // The general budget should still have 1 remaining — this must succeed.
    const finalRes = await request(server).get("/general-test");
    expect(finalRes.status).toBe(200);
  });
});

describe("regression: test server ports cannot be shadowed by foreign 127.0.0.1 listeners", () => {
  it("no other local socket can bind 127.0.0.1 on the test server's port, and requests reach the app under test", async () => {
    const app = express();
    app.get("/who", (_req, res) => {
      res.status(200).json({ app: "under-test" });
    });

    const server = await listenOnLoopback(app);
    const { port } = server.address() as AddressInfo;

    // A foreign process binding 127.0.0.1 on our port must be rejected by the
    // kernel — this is the property that keeps its responses out of this suite.
    const foreign = createServer((_req, res) => {
      res.statusCode = 404;
      res.end('{"error":"Not found"}');
    });
    const foreignBindError = await new Promise<NodeJS.ErrnoException | null>(
      (resolve) => {
        foreign.once("error", (err) => resolve(err as NodeJS.ErrnoException));
        foreign.listen(port, "127.0.0.1", () => resolve(null));
      },
    );
    if (foreignBindError === null) {
      await new Promise<void>((resolve) => {
        foreign.close(() => resolve());
      });
    }
    expect(foreignBindError?.code).toBe("EADDRINUSE");

    const response = await request(server).get("/who");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ app: "under-test" });
  });
});
