import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { apiAuthMiddleware } from "@middleware/apiAuth";
import { createOptimizeRoutes } from "@routes/optimize.routes";

import { useTestApiKey } from "../helpers/apiRouteHarness";

const TEST_API_KEY = "integration-optimize-key";

describe("Optimization Flow (integration)", () => {
  useTestApiKey(TEST_API_KEY);

  it("POST /api/optimize returns the final optimized prompt payload", async () => {
    const promptOptimizationService = {
      optimize: vi.fn(async () => ({
        prompt: "A cinematic runner with atmosphere",
        inputMode: "t2v" as const,
        metadata: {
          provider: "test",
          genericPrompt: "A generic runner prompt",
          normalizedModelId: "kling-v1",
        },
      })),
      compilePrompt: vi.fn(),
    };

    const app = express();
    app.use(express.json());
    app.use(
      "/api",
      apiAuthMiddleware,
      createOptimizeRoutes({
        promptOptimizationService: promptOptimizationService as never,
      }),
    );

    const response = await request(app)
      .post("/api/optimize")
      .set("x-api-key", TEST_API_KEY)
      .send({
        prompt: "person walking on beach",
        mode: "video",
        targetModel: "kling-v1",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    // The flat top-level `prompt`/`optimizedPrompt` assertions that used to sit
    // here were left over from before response envelope v3. The `data`
    // assertion below already covers both fields at their real location.
    expect(response.body.data).toEqual(
      expect.objectContaining({
        prompt: "A cinematic runner with atmosphere",
        optimizedPrompt: "A cinematic runner with atmosphere",
        // `inputMode` is deliberately absent: 02c123558 dropped the i2v field
        // from this response. It survives only in preview.schemas.ts, a
        // different contract.
        metadata: expect.objectContaining({
          provider: "test",
          genericPrompt: "A generic runner prompt",
          normalizedModelId: "kling-v1",
        }),
      }),
    );
    expect(promptOptimizationService.optimize).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "person walking on beach",
        mode: "video",
        targetModel: "kling-v1",
      }),
    );
  });
});
