import type { Application } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { configureServices, initializeServices } from "@config/services.config";
import { createApp } from "@server/app";

const TEST_API_KEY = "runtime-flags-test-key";

const ENV_KEYS = [
  "ENABLE_CONVERGENCE",
  "PROCESS_ROLE",
  "ALLOWED_API_KEYS",
  "PORT",
  "NODE_ENV",
] as const;

type ManagedEnvKey = (typeof ENV_KEYS)[number];

async function withApp(
  overrides: Partial<Record<ManagedEnvKey, string>>,
  run: (app: Application) => Promise<void>,
): Promise<void> {
  const previous = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  ) as Record<ManagedEnvKey, string | undefined>;

  try {
    process.env.NODE_ENV = "test";
    process.env.ALLOWED_API_KEYS = TEST_API_KEY;
    process.env.PORT = "0";

    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) {
        delete process.env[key as ManagedEnvKey];
      } else {
        process.env[key as ManagedEnvKey] = value;
      }
    }

    const container = await configureServices();
    await initializeServices(container);
    const app = createApp(container);
    await run(app);
  } finally {
    for (const key of ENV_KEYS) {
      const prior = previous[key];
      if (prior === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = prior;
      }
    }
  }
}

describe("Runtime flag matrix contracts (integration)", () => {
  it("keeps health and optimization stable while disabling continuity when ENABLE_CONVERGENCE=false", async () => {
    await withApp({ ENABLE_CONVERGENCE: "false" }, async (app) => {
      const health = await request(app).get("/health");
      expect(health.status).toBe(200);
      expect(health.body.status).toBe("healthy");

      const sessionsRoute = await request(app)
        .patch("/api/sessions/session-1")
        .set("x-api-key", TEST_API_KEY)
        .send({ status: "not-a-valid-status" });
      expect(sessionsRoute.status).toBe(400);
      expect(sessionsRoute.body.success).toBe(false);
      expect(sessionsRoute.body.error).toBe("Invalid request");

      const continuityRoute = await request(app)
        .get("/api/continuity/sessions")
        .set("x-api-key", TEST_API_KEY);
      expect(continuityRoute.status).toBe(404);

      const sessionsContinuitySubroute = await request(app)
        .get("/api/sessions/session-1/shots/shot-1/status")
        .set("x-api-key", TEST_API_KEY);
      expect(sessionsContinuitySubroute.status).toBe(404);

      const optimizeRoute = await request(app)
        .post("/api/optimize")
        .set("x-api-key", TEST_API_KEY)
        .send({});
      expect(optimizeRoute.status).toBe(400);
    });
  });

  it("keeps health stable across PROCESS_ROLE api/worker runtime modes", async () => {
    await withApp(
      {
        PROCESS_ROLE: "api",
      },
      async (app) => {
        const health = await request(app).get("/health");
        expect(health.status).toBe(200);
        expect(health.body.status).toBe("healthy");
      },
    );

    await withApp(
      {
        PROCESS_ROLE: "worker",
      },
      async (app) => {
        const health = await request(app).get("/health");
        expect(health.status).toBe(200);
        expect(health.body.status).toBe("healthy");
      },
    );
  });
});
