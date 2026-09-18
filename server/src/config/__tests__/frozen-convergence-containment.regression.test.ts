import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DIContainer } from "@infrastructure/DIContainer";
import { getRuntimeFlags } from "../feature-flags";
import { registerCoreServices } from "../services/core.services";
import { registerMotionRoutes } from "../routes/motion.registration";

/**
 * ADR-0002 froze convergence — dormant, not load-bearing. Three ways it kept
 * charging the active product anyway:
 *
 *  1. `falWarmupEnabled` defaulted to `NODE_ENV !== "production"`, so every dev
 *     and test boot armed `setInterval(fal.subscribe, 120_000)` for the life of
 *     the process — on the same FAL_KEY the live editor spends. A silent fal
 *     balance lockout is a failure mode this repo has already been bitten by.
 *  2. `DEPTH_WARMUP_ON_STARTUP` defaulted true, warming the same frozen stack on
 *     every boot.
 *  3. ENABLE_CONVERGENCE gated `registerContinuityServices` only. /api/motion
 *     mounted unconditionally, so the flag did not mean what it said.
 *
 * Invariant: an operator who sets no convergence env vars pays nothing for the
 * frozen stack — no warmup armed, no convergence surface mounted.
 *
 * ADR-0022 decision 7 carves out exactly one exception, and it is deliberate:
 * POST /api/motion/depth backs the illustrative camera preview, which is
 * motion authoring for the ACTIVE loop, so it is reachable with the umbrella
 * off. It is one route moved out from under a frozen mount, not the frozen
 * stack switched on — the media proxy and every convergence service stay
 * behind the flag, and the flag's default is untouched.
 */

const CONVERGENCE_ENV = [
  "FAL_DEPTH_WARMUP_ENABLED",
  "DEPTH_WARMUP_ON_STARTUP",
  "ENABLE_CONVERGENCE",
] as const;

/** Absent is a distinct state from empty, so unset keys are recorded too. */
type EnvSnapshot = Map<string, string | undefined>;

function clearConvergenceEnv(): EnvSnapshot {
  const snapshot: EnvSnapshot = new Map();
  for (const key of CONVERGENCE_ENV) {
    snapshot.set(key, process.env[key]);
    delete process.env[key];
  }
  return snapshot;
}

function restoreEnv(snapshot: EnvSnapshot): void {
  for (const [key, value] of snapshot) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

let snapshot: EnvSnapshot = new Map();
afterEach(() => restoreEnv(snapshot));

describe("regression: frozen convergence costs an unconfigured boot nothing", () => {
  it("arms no fal warmup when no depth env var is set", () => {
    snapshot = clearConvergenceEnv();

    const container = new DIContainer();
    registerCoreServices(container);
    const config = container.resolve<{
      convergence: { depth: { falWarmupEnabled: boolean } };
    }>("config");

    expect(config.convergence.depth.falWarmupEnabled).toBe(false);
  });

  it("arms no fal warmup outside production either", () => {
    // The defect was expressed as `NODE_ENV !== "production"`, so production
    // was the one environment that did not pay for it.
    snapshot = clearConvergenceEnv();
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    try {
      const container = new DIContainer();
      registerCoreServices(container);
      const config = container.resolve<{
        convergence: { depth: { falWarmupEnabled: boolean } };
      }>("config");

      expect(config.convergence.depth.falWarmupEnabled).toBe(false);
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it("still honours an operator who explicitly opts in", () => {
    snapshot = clearConvergenceEnv();
    process.env.FAL_DEPTH_WARMUP_ENABLED = "true";

    const container = new DIContainer();
    registerCoreServices(container);
    const config = container.resolve<{
      convergence: { depth: { falWarmupEnabled: boolean } };
    }>("config");

    expect(config.convergence.depth.falWarmupEnabled).toBe(true);
  });

  it("mounts the depth route and nothing else when ENABLE_CONVERGENCE is off", () => {
    // Asserted on the mounts rather than on status codes: both the depth
    // route and the media proxy sit behind apiAuthMiddleware, so an
    // unauthenticated probe answers 401 either way and could not tell a
    // missing mount from a guarded one.
    snapshot = clearConvergenceEnv();
    process.env.ENABLE_CONVERGENCE = "false";
    expect(getRuntimeFlags().enableConvergence).toBe(false);

    const app = express();
    const mountedPaths: string[] = [];
    const use = app.use.bind(app) as (...args: never[]) => unknown;
    vi.spyOn(app, "use").mockImplementation(((...args: never[]) => {
      const [first] = args;
      if (typeof first === "string") mountedPaths.push(first);
      use(...args);
      return app;
    }) as typeof app.use);

    registerMotionRoutes(app, new DIContainer());

    expect(mountedPaths).toEqual(["/api/motion"]);
  });

  it("keeps the depth route reachable with ENABLE_CONVERGENCE off", async () => {
    // ADR-0022 decision 7: the depth estimate behind the illustrative camera
    // preview is motion authoring for the active loop, so it moves out from
    // under the frozen mount. One route, not the stack. 401 (not 404) is the
    // proof it is mounted: the request reached apiAuthMiddleware.
    snapshot = clearConvergenceEnv();
    process.env.ENABLE_CONVERGENCE = "false";
    expect(getRuntimeFlags().enableConvergence).toBe(false);

    const app = express();
    registerMotionRoutes(app, new DIContainer());

    const response = await request(app).post("/api/motion/depth").send({});
    expect(response.status).toBe(401);
  });

  it("mounts /api/motion when ENABLE_CONVERGENCE is on", async () => {
    // Guards the test above: a mount that never happens would pass it for free.
    snapshot = clearConvergenceEnv();
    process.env.ENABLE_CONVERGENCE = "true";

    const app = express();
    registerMotionRoutes(app, new DIContainer());

    const response = await request(app).post("/api/motion/depth").send({});
    expect(response.status).toBe(401);
  });
});
