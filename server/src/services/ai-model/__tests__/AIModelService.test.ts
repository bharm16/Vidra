import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  loggerMock,
  shouldUseSeedMock,
  hashStringMock,
  detectAndGetCapabilitiesMock,
  buildRequestOptionsMock,
  buildResponseFormatMock,
  resolvePlanMock,
  getConfigMock,
} = vi.hoisted(() => ({
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  shouldUseSeedMock: vi.fn(),
  hashStringMock: vi.fn(),
  detectAndGetCapabilitiesMock: vi.fn(),
  buildRequestOptionsMock: vi.fn(),
  buildResponseFormatMock: vi.fn(),
  resolvePlanMock: vi.fn(),
  getConfigMock: vi.fn(),
}));

vi.mock("@infrastructure/Logger", () => ({
  logger: loggerMock,
}));

vi.mock("@config/modelConfig", () => ({
  ModelConfig: {
    test_operation: {},
    stream_operation: {},
  },
  shouldUseSeed: shouldUseSeedMock,
}));

vi.mock("@utils/hash", () => ({
  hashString: hashStringMock,
}));

vi.mock("@utils/provider/ProviderDetector", () => ({
  detectAndGetCapabilities: detectAndGetCapabilitiesMock,
}));

vi.mock("../request/RequestOptionsBuilder", () => ({
  buildRequestOptions: buildRequestOptionsMock,
}));

vi.mock("../request/ResponseFormatBuilder", () => ({
  buildResponseFormat: buildResponseFormatMock,
}));

vi.mock("../routing/ExecutionPlan", () => ({
  ExecutionPlanResolver: class {
    resolve(operation: string) {
      return resolvePlanMock(operation);
    }
    getConfig(operation: string) {
      return getConfigMock(operation);
    }
  },
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

import { AIModelService } from "../AIModelService";

function baseConfig(client = "openai") {
  return {
    client,
    model: "gpt-4o",
    temperature: 0.2,
    maxTokens: 1000,
    timeout: 20000,
  };
}

describe("AIModelService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseSeedMock.mockReturnValue(false);
    hashStringMock.mockReturnValue(12345);
    detectAndGetCapabilitiesMock.mockReturnValue({
      provider: "openai",
      capabilities: {
        strictJsonSchema: true,
        developerRole: true,
        bookending: true,
      },
    });
    buildResponseFormatMock.mockReturnValue({ jsonMode: false });
    buildRequestOptionsMock.mockReturnValue({
      model: "gpt-4o",
      temperature: 0.2,
      maxTokens: 1000,
      timeout: 20000,
      jsonMode: false,
    });
    resolvePlanMock.mockReturnValue({
      primaryConfig: baseConfig("openai"),
      fallback: null,
    });
    getConfigMock.mockReturnValue(baseConfig("openai"));
  });

  it("requires clients object in constructor", () => {
    expect(() => new AIModelService({ clients: null as never })).toThrow(
      "AIModelService requires clients object",
    );
  });

  it("rejects execute when systemPrompt is missing", async () => {
    const service = new AIModelService({
      clients: { openai: { complete: vi.fn() } as never },
    });

    await expect(
      service.execute("test_operation", {} as never),
    ).rejects.toThrow("systemPrompt is required");
  });

  it("throws when no AI providers are configured", async () => {
    const service = new AIModelService({
      clients: { openai: null },
    });

    await expect(
      service.execute("test_operation", { systemPrompt: "prompt" }),
    ).rejects.toThrow("No AI providers configured");
  });

  it("routes execute to primary client with built request options", async () => {
    const complete = vi.fn().mockResolvedValue({ text: "ok", metadata: {} });
    const service = new AIModelService({
      clients: { openai: { complete } as never },
    });

    const response = await service.execute("test_operation", {
      systemPrompt: "prompt",
    });

    expect(buildResponseFormatMock).toHaveBeenCalledTimes(1);
    expect(buildRequestOptionsMock).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(response.text).toBe("ok");
  });

  it("falls back when primary client is unavailable", async () => {
    resolvePlanMock.mockReturnValue({
      primaryConfig: baseConfig("groq"),
      fallback: { client: "openai", model: "gpt-4o-mini", timeout: 10000 },
    });
    const complete = vi
      .fn()
      .mockResolvedValue({ text: "fallback-ok", metadata: {} });
    const service = new AIModelService({
      clients: { openai: { complete } as never, groq: null },
    });

    const response = await service.execute("test_operation", {
      systemPrompt: "prompt",
    });

    expect(complete).toHaveBeenCalledTimes(1);
    expect(response.text).toBe("fallback-ok");
  });

  it("does not retry logprobs itself — the adapter seam owns that quirk", async () => {
    // The logprobs-strip retry was relocated into OpenAICompatibleAdapter.
    // AIModelService must NOT re-grow it: a logprobs rejection surfaces after a
    // single client call, with no service-level second attempt.
    buildRequestOptionsMock.mockReturnValue({
      model: "gpt-4o",
      temperature: 0.2,
      maxTokens: 1000,
      timeout: 20000,
      jsonMode: false,
      logprobs: true,
      topLogprobs: 3,
    });
    const complete = vi
      .fn()
      .mockRejectedValue(new Error("logprobs not supported by model"));
    const service = new AIModelService({
      clients: { openai: { complete } as never },
    });

    await expect(
      service.execute("test_operation", { systemPrompt: "prompt" }),
    ).rejects.toBeDefined();

    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("streams with onChunk callback and seed when configured", async () => {
    shouldUseSeedMock.mockReturnValue(true);
    resolvePlanMock.mockReturnValue({
      primaryConfig: baseConfig("openai"),
      fallback: null,
    });
    const streamComplete = vi.fn().mockResolvedValue("streamed-text");
    const service = new AIModelService({
      clients: { openai: { complete: vi.fn(), streamComplete } as never },
    });

    const onChunk = vi.fn();
    const text = await service.stream("stream_operation", {
      systemPrompt: "prompt",
      onChunk,
    });

    expect(text).toBe("streamed-text");
    const streamOptions = streamComplete.mock.calls[0]?.[1] as {
      seed?: number;
    };
    expect(streamOptions.seed).toBe(12345);
  });

  it("returns operation and client metadata helpers", () => {
    const service = new AIModelService({
      clients: { openai: { complete: vi.fn() } as never, gemini: null },
    });

    expect(service.listOperations()).toEqual(
      expect.arrayContaining(["test_operation"]),
    );
    expect(service.getOperationConfig("test_operation")).toEqual(
      baseConfig("openai"),
    );
    expect(service.hasOperation("test_operation")).toBe(true);
    expect(service.getAvailableClients()).toEqual(["openai"]);
  });

  it("emits llm.call.completed telemetry on successful execute", async () => {
    const record = vi.fn();
    const complete = vi.fn().mockResolvedValue({
      text: "ok",
      metadata: {
        provider: "openai",
        model: "gpt-4o-mini",
        finishReason: "stop",
        usage: {
          prompt_tokens: 50,
          completion_tokens: 80,
          total_tokens: 130,
        },
      },
    });
    const service = new AIModelService({
      clients: { openai: { complete } as never },
      llmCallTelemetry: { record } as never,
    });

    await service.execute("test_operation", { systemPrompt: "prompt" });

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        executionType: "test_operation",
        provider: "openai",
        model: "gpt-4o-mini",
        promptTokens: 50,
        completionTokens: 80,
        totalTokens: 130,
        finishReason: "stop",
        outcome: "success",
      }),
    );
    expect(record.mock.calls[0]?.[0].durationMs).toEqual(expect.any(Number));
  });

  it("emits llm.call.completed with outcome=error when execute fails", async () => {
    const record = vi.fn();
    const complete = vi.fn().mockRejectedValue(new Error("boom"));
    const service = new AIModelService({
      clients: { openai: { complete } as never },
      llmCallTelemetry: { record } as never,
    });

    await expect(
      service.execute("test_operation", { systemPrompt: "prompt" }),
    ).rejects.toThrow("boom");

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        executionType: "test_operation",
        outcome: "error",
        errorMessage: "boom",
      }),
    );
  });

  it("does not throw if llmCallTelemetry.record itself throws", async () => {
    const record = vi.fn(() => {
      throw new Error("posthog blew up");
    });
    const complete = vi.fn().mockResolvedValue({ text: "ok", metadata: {} });
    const service = new AIModelService({
      clients: { openai: { complete } as never },
      llmCallTelemetry: { record } as never,
    });

    await expect(
      service.execute("test_operation", { systemPrompt: "prompt" }),
    ).resolves.toMatchObject({ text: "ok" });
  });

  it("works without an injected llmCallTelemetry (optional dep)", async () => {
    const complete = vi.fn().mockResolvedValue({ text: "ok", metadata: {} });
    const service = new AIModelService({
      clients: { openai: { complete } as never },
    });

    await expect(
      service.execute("test_operation", { systemPrompt: "prompt" }),
    ).resolves.toMatchObject({ text: "ok" });
  });
});
