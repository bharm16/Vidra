import { describe, expect, it, vi } from "vitest";

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: {
    warn: vi.fn(),
  },
}));

vi.mock("@infrastructure/Logger", () => ({
  logger: loggerMock,
}));

vi.mock("@interfaces/IAIClient", () => ({
  AIClientError: class AIClientError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.name = "AIClientError";
      this.statusCode = statusCode;
    }
  },
}));

import { DEFAULT_CONFIG, ModelConfig } from "@config/modelConfig";
import { ExecutionPlanResolver } from "../ExecutionPlan";

// Real config, no module mock. `span_labeling` declares a qwen fallback with
// an explicit fallbackConfig; `video_prompt_ir_extraction` declares an openai
// fallback with none, so it exercises the provider-default path.

function createResolver(
  overrides: Partial<{
    hasClient: (name: string) => boolean;
    hasAnyClient: () => boolean;
    getAvailableClients: () => string[];
  }> = {},
) {
  const clientResolver = {
    hasClient: (name: string) => name === "gemini" || name === "qwen",
    hasAnyClient: () => true,
    getAvailableClients: () => ["gemini", "qwen"],
    ...overrides,
  };
  return new ExecutionPlanResolver(clientResolver as never);
}

describe("ExecutionPlanResolver", () => {
  it("returns configured operation config", () => {
    const resolver = createResolver();

    const config = resolver.getConfig("span_labeling");

    expect(config).toBe(ModelConfig.span_labeling);
  });

  it("uses primary config and fallback when primary client is available", () => {
    const resolver = createResolver();

    const plan = resolver.resolve("span_labeling");

    expect(plan.primaryConfig.client).toBe(ModelConfig.span_labeling.client);
    expect(plan.fallback).toEqual({
      client: "qwen",
      model: ModelConfig.span_labeling.fallbackConfig?.model,
      timeout: ModelConfig.span_labeling.fallbackConfig?.timeout,
    });
  });

  it("remaps operation to available fallback client when primary is missing", () => {
    const resolver = createResolver({
      hasClient: (name: string) => name === "openai",
      getAvailableClients: () => ["openai"],
    });

    const plan = resolver.resolve("video_prompt_ir_extraction");

    expect(plan.primaryConfig.client).toBe("openai");
    expect(plan.primaryConfig.model).toBe(DEFAULT_CONFIG.model);
    expect(loggerMock.warn).toHaveBeenCalled();
  });

  it("throws when no AI providers are configured", () => {
    const resolver = createResolver({
      hasClient: () => false,
      hasAnyClient: () => false,
      getAvailableClients: () => [],
    });

    expect(() => resolver.resolve("span_labeling")).toThrow(
      "No AI providers configured",
    );
  });
});
