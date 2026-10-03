import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import {
  createFalI2iRouter,
  FAL_I2I_MODEL_ENDPOINT,
} from "../../../server/src/routes/fal-i2i.routes";
import { SketchBudgetService } from "../../../server/src/services/sketch-budget/SketchBudgetService";
import { QUALITY_PROMPT, QUALITY_SOURCE } from "./fixtures";
import type { OfflineProviderTransport } from "./transport";
import type { QualityPathResult } from "./types";

/** Real relay on an ephemeral local socket; identity/persistence are controlled boundaries. */
export async function evaluateSketchRelay(
  transport: OfflineProviderTransport,
): Promise<QualityPathResult> {
  transport.received.length = 0;
  transport.unexpected.length = 0;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next): void => {
    (req as express.Request & { user: { uid: string } }).user = {
      uid: "quality-fixture",
    };
    next();
  });
  app.use(
    "/api/fal",
    createFalI2iRouter({
      falKey: "offline-quality-fixture-token",
      budget: new SketchBudgetService({
        store: { reserve: async (): Promise<void> => {} },
        dailyCapCents: 1000,
        frameCostMillicents: 1,
        now: () => new Date("2026-10-03T00:00:00Z"),
      }),
      fetchFn: transport.fetch,
    }),
  );
  const input = {
    prompt: QUALITY_PROMPT,
    image_url: QUALITY_SOURCE,
    strength: 0.6,
    num_inference_steps: 8,
    seed: 20261003,
  };
  let reason: string | undefined;
  try {
    const response = await request(app).post("/api/fal/i2i").send(input);
    assert.equal(response.status, 200);
    assert.equal(transport.unexpected.length, 0);
    assert.deepEqual(transport.received, [
      {
        model: FAL_I2I_MODEL_ENDPOINT,
        input: { ...input, sync_mode: true, output_format: "webp" },
      },
    ]);
  } catch (error) {
    reason = error instanceof Error ? error.message : String(error);
  }
  return {
    id: "sketch/fal-i2i",
    operation: "sketch",
    model: FAL_I2I_MODEL_ENDPOINT,
    configuration: {
      route: "/api/fal/i2i",
      upstreamTimeoutMs: 10_000,
      creatorIdentity: "controlled",
      ...input,
    },
    contract: reason ? "failed" : "passed",
    assertions: [
      "actual relay submits exact motion/prompt words, source, strength, steps and seed",
      "sync and webp flags reach fal transport",
      "response contract mirrors controlled provider",
    ],
    submitted: structuredClone(transport.received),
    ...(reason ? { reason } : {}),
    live: "not-verified",
    quality: "awaiting-owner-review",
  };
}
