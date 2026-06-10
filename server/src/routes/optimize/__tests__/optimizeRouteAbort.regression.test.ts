/**
 * Regression: every POST /api/optimize returned 500 ("openai API request
 * aborted by client"). Root cause: the handler wired its in-flight abort to
 * `req.once("close", ...)` — but in Node >= 16 an IncomingMessage emits
 * "close" when the request has been fully consumed (express.json() reads the
 * body before the handler runs), not when the client disconnects. The abort
 * signal therefore fired milliseconds into every request, killing the LLM
 * call while the client connection was still open and healthy.
 *
 * Invariant: for any optimize request whose client connection stays open,
 * normal request completion must not abort the in-flight optimization — the
 * handler-provided signal stays live and the route succeeds.
 *
 * Boundary: real express.json, real apiAuthMiddleware, real route factory,
 * real abort wiring. Fake only the optimization service (the LLM boundary),
 * which mirrors the real adapter: it fails if the signal aborts mid-flight.
 */
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiAuthMiddleware } from "@middleware/apiAuth";
import { createOptimizeRoutes } from "@routes/optimize.routes";
import type { OptimizeServices } from "@routes/optimize/types";

const TEST_API_KEY = "integration-optimize-key";

const LLM_LATENCY_MS = 30;

function createApp() {
  const observedSignalStates: boolean[] = [];

  const promptOptimizationService: OptimizeServices["promptOptimizationService"] =
    {
      optimize: vi.fn(async (req: { signal?: AbortSignal; prompt: string }) => {
        // Simulate the real LLM round-trip: time passes, then the adapter
        // checks the abort signal exactly like the provider clients do.
        await new Promise((resolve) => setTimeout(resolve, LLM_LATENCY_MS));
        observedSignalStates.push(req.signal?.aborted ?? false);
        if (req.signal?.aborted) {
          throw new Error("openai API request aborted by client");
        }
        return {
          prompt: `expanded: ${req.prompt}`,
          score: 90,
          metadata: {},
        };
      }) as OptimizeServices["promptOptimizationService"]["optimize"],
      compilePrompt: vi.fn(),
    } as unknown as OptimizeServices["promptOptimizationService"];

  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    apiAuthMiddleware,
    createOptimizeRoutes({ promptOptimizationService }),
  );

  return { app, observedSignalStates };
}

describe("regression: optimize route abort wiring", () => {
  let previousAllowedApiKeys: string | undefined;

  beforeEach(() => {
    previousAllowedApiKeys = process.env.ALLOWED_API_KEYS;
    process.env.ALLOWED_API_KEYS = TEST_API_KEY;
  });

  afterEach(() => {
    if (previousAllowedApiKeys === undefined) {
      delete process.env.ALLOWED_API_KEYS;
      return;
    }
    process.env.ALLOWED_API_KEYS = previousAllowedApiKeys;
  });

  it("a completed-but-connected request does not abort the in-flight optimization", async () => {
    const { app, observedSignalStates } = createApp();

    const response = await request(app)
      .post("/api/optimize")
      .set("x-api-key", TEST_API_KEY)
      .send({
        prompt: "my golden retriever catching a frisbee at the park",
        mode: "video",
      });

    expect(observedSignalStates).toEqual([false]);
    expect(response.status).toBe(200);
  });
});
