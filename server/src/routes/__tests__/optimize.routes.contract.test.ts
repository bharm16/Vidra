import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createOptimizeRoutes } from "../optimize.routes";
import {
  ApiErrorResponseSchema,
  ApiResponseSchema,
} from "@shared/schemas/api.schemas";
import {
  CompileDataSchema,
  OptimizeDataSchema,
} from "@shared/schemas/optimization.schemas";
import type { PromptOptimizationServiceContract } from "../optimize/types";

/**
 * Contract test for the optimize route response envelopes.
 *
 * Pins the canonical ApiResponse union from shared/types/api.ts. Guards the
 * removal of the deprecated dual-emit shape (payload duplicated at the top
 * level next to `data`) and the flattening of validation `details` to the
 * canonical string. Invalid bodies are rejected by the validateRequest
 * middleware, whose 400 uses the canonical ApiErrorResponse shape.
 */

interface ErrorWithCode {
  code?: string;
  message?: string;
}

const isSocketPermissionError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as ErrorWithCode;
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message =
    typeof candidate.message === "string" ? candidate.message : "";
  if (code === "EPERM" || code === "EACCES") {
    return true;
  }
  return (
    message.includes("listen EPERM") ||
    message.includes("listen EACCES") ||
    message.includes("operation not permitted") ||
    message.includes("Cannot read properties of null (reading 'port')")
  );
};

const runSupertestOrSkip = async <T>(
  execute: () => Promise<T>,
): Promise<T | null> => {
  if (process.env.CODEX_SANDBOX === "seatbelt") {
    return null;
  }
  try {
    return await execute();
  } catch (error) {
    if (isSocketPermissionError(error)) {
      return null;
    }
    throw error;
  }
};

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
    const response = await runSupertestOrSkip(() =>
      request(buildApp())
        .post("/optimize")
        .send({ prompt: "a runner in rain", mode: "video" }),
    );
    if (!response) return;

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
    const response = await runSupertestOrSkip(() =>
      request(buildApp())
        .post("/optimize-compile")
        .send({ prompt: "an optimized prompt", targetModel: "sora-2" }),
    );
    if (!response) return;

    expect(response.status).toBe(200);
    const parsed = ApiResponseSchema(CompileDataSchema).parse(response.body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.compiledPrompt).toBe("a compiled prompt");
    }
    expect(response.body).not.toHaveProperty("compiledPrompt");
  });

  it("POST /optimize with an invalid body returns the canonical error shape", async () => {
    const response = await runSupertestOrSkip(() =>
      request(buildApp()).post("/optimize").send({}),
    );
    if (!response) return;

    expect(response.status).toBe(400);
    const parsed = ApiErrorResponseSchema.parse(response.body);
    expect(typeof parsed.error).toBe("string");
    if (parsed.details !== undefined) {
      expect(typeof parsed.details).toBe("string");
    }
  });
});
