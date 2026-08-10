import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { applyRateLimitingMiddleware } from "../middleware.config";
import { closeLoopbackServers, listenOnLoopback } from "./loopbackTestServer";

afterEach(closeLoopbackServers);

/**
 * Two rate-limit lanes named paths this server does not have.
 *
 * The /api limiter is mounted `app.use("/api/", …)`, so inside `skip()` the
 * mount prefix is already stripped: GET /api/sessions/<id> arrives as req.path
 * "/sessions/<id>". `isSessionHydrationRoute` was written against
 * "/v2/sessions/<id>" — correct for the mount of the day — and commit 68a35b685
 * renamed the route to /sessions across 14 files without touching the
 * predicate. Session hydration silently stopped being exempt and began burning
 * the shared API budget, which is the exact 429 the exemption exists to
 * prevent. It fires on every page load and workspace transition.
 *
 * Same failure mode, other half: burst lanes stayed mounted on
 * /api/video/validate and /api/video/suggestions after commit 3b6448786 removed
 * the /api/video mount. `app.use` matches by prefix whether or not a route
 * exists, so a request to a path this server does not route spent tokens and
 * was answered with a rate-limit refusal instead of a 404.
 *
 * Both halves are the same bug: a limiter path that no longer names a route.
 */

const HYDRATION_PATH = "/api/sessions/session-abc";
const UNEXEMPT_API_PATH = "/api/optimize";

/** Comfortably past the smallest budget any env/Redis combination produces. */
const BURST = 120;

/**
 * The removed lanes allowed 3 requests / 2s (validate) and 2 / 3s
 * (suggestions), so a handful of requests is all it takes to trip them —
 * well under the shared API budget, which legitimately applies to these paths.
 */
const DEAD_LANE_PROBE = 6;

function buildApp(): express.Express {
  const app = express();
  applyRateLimitingMiddleware(app);

  app.get(HYDRATION_PATH, (_req, res) => {
    res.status(200).json({ id: "session-abc" });
  });
  app.post(UNEXEMPT_API_PATH, (_req, res) => {
    res.status(200).json({ ok: true });
  });

  return app;
}

async function statusesFor(
  server: Awaited<ReturnType<typeof listenOnLoopback>>,
  send: (agent: ReturnType<typeof request>) => request.Test,
  count: number = BURST,
): Promise<number[]> {
  const responses = [];
  for (let i = 0; i < count; i += 1) {
    responses.push(await send(request(server)));
  }
  return responses.map((response) => response.status);
}

describe("regression: rate-limit lanes name routes that exist", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalWorkerId = process.env.VITEST_WORKER_ID;
  const originalVitest = process.env.VITEST;

  const enterServerLikeEnv = (): void => {
    process.env.NODE_ENV = "development";
    delete process.env.VITEST_WORKER_ID;
    delete process.env.VITEST;
  };

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;

    if (originalWorkerId === undefined) delete process.env.VITEST_WORKER_ID;
    else process.env.VITEST_WORKER_ID = originalWorkerId;

    if (originalVitest === undefined) delete process.env.VITEST;
    else process.env.VITEST = originalVitest;
  });

  it("exhausts the shared API budget for a route that is not exempt", async () => {
    // Guards every assertion below: if the limiter is not armed in this
    // configuration, "never 429" is true for uninteresting reasons.
    enterServerLikeEnv();
    const server = await listenOnLoopback(buildApp());

    const statuses = await statusesFor(server, (agent) =>
      agent.post(UNEXEMPT_API_PATH),
    );

    expect(statuses).toContain(429);
  });

  it("never answers a session-hydration read with a rate-limit refusal", async () => {
    enterServerLikeEnv();
    const server = await listenOnLoopback(buildApp());

    const statuses = await statusesFor(server, (agent) =>
      agent.get(HYDRATION_PATH),
    );

    expect(statuses.filter((status) => status === 429)).toEqual([]);
    expect(new Set(statuses)).toEqual(new Set([200]));
  });

  it.each(["/api/video/validate", "/api/video/suggestions"])(
    "answers %s with a not-found, never a rate-limit refusal",
    async (deadPath) => {
      enterServerLikeEnv();
      const server = await listenOnLoopback(buildApp());

      const statuses = await statusesFor(
        server,
        (agent) => agent.post(deadPath),
        DEAD_LANE_PROBE,
      );

      expect(statuses.filter((status) => status === 429)).toEqual([]);
      expect(new Set(statuses)).toEqual(new Set([404]));
    },
  );
});
