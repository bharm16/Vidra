import {
  ApiErrorResponseSchema,
  ApiResponseSchema,
} from "@shared/schemas/api.schemas";
import {
  CompileDataSchema,
  OptimizeDataSchema,
} from "@shared/schemas/optimization.schemas";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createOptimizeRoutes } from "../optimize.routes";
import type { PromptOptimizationServiceContract } from "../optimize/types";

const buildService = (): PromptOptimizationServiceContract =>
  ({
    optimize: vi.fn(async () => ({
      prompt: "an optimized prompt",
      metadata: { cached: false },
    })),
    compilePrompt: vi.fn(async () => ({
      compiledPrompt: "a compiled prompt",
      targetModel: "sora-2",
      metadata: {},
    })),
  }) as unknown as PromptOptimizationServiceContract;

const buildApp = (): express.Express => {
  const app = express();
  app.use(express.json());
  app.use(createOptimizeRoutes({ promptOptimizationService: buildService() }));
  return app;
};

describe("optimize routes — canonical envelope contract", () => {
  it("POST /optimize returns data-only success envelope (no top-level spread)", async () => {
    const response = await request(buildApp())
      .post("/optimize")
      .send({ prompt: "a runner in rain", mode: "video" });

    expect(response.status).toBe(200);
    const parsed = ApiResponseSchema(OptimizeDataSchema).parse(response.body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.prompt).toBe("an optimized prompt");
    }
    // Guards the dual-emit removal: the payload lives only under `data`.
    expect(response.body).not.toHaveProperty("prompt");
    expect(response.body).not.toHaveProperty("optimizedPrompt");
    expect(response.headers["x-response-version"]).toBe("3");
  });

  it("POST /optimize-compile returns data-only success envelope", async () => {
    const response = await request(buildApp())
      .post("/optimize-compile")
      .send({ prompt: "an optimized prompt", targetModel: "sora-2" });

    expect(response.status).toBe(200);
    const parsed = ApiResponseSchema(CompileDataSchema).parse(response.body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.compiledPrompt).toBe("a compiled prompt");
    }
    expect(response.body).not.toHaveProperty("compiledPrompt");
  });

  it("POST /optimize with an invalid body returns the canonical error shape", async () => {
    const response = await request(buildApp()).post("/optimize").send({});

    expect(response.status).toBe(400);
    const parsed = ApiErrorResponseSchema.parse(response.body);
    expect(typeof parsed.error).toBe("string");
    if (parsed.details !== undefined) {
      expect(typeof parsed.details).toBe("string");
    }
  });
});
