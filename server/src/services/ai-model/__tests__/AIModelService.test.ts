import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  loggerMock,
  hashStringMock,
  capabilitiesForMock,
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
  hashStringMock: vi.fn(),
  capabilitiesForMock: vi.fn(),
  buildRequestOptionsMock: vi.fn(),
  buildResponseFormatMock: vi.fn(),
  resolvePlanMock: vi.fn(),
  getConfigMock: vi.fn(),
}));

vi.mock("@infrastructure/Logger", () => ({
  logger: loggerMock,
}));

vi.mock("@utils/hash", () => ({
  hashString: hashStringMock,
}));

vi.mock("@utils/provider/ProviderDetector", () => ({
  capabilitiesFor: capabilitiesForMock,
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
    hashStringMock.mockReturnValue(12345);
    capabilitiesForMock.mockReturnValue({
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

  it("throws when no AI providers are configured", async () => {
    const service = new AIModelService({
      clients: { openai: null },
    });

    await expect(
      service.execute("optimize_standard", { systemPrompt: "prompt" }),
    ).rejects.toThrow("No AI providers configured");
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

    const response = await service.execute("optimize_standard", {
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
      service.execute("optimize_standard", { systemPrompt: "prompt" }),
    ).rejects.toBeDefined();

    expect(complete).toHaveBeenCalledTimes(1);
  });

  // span_labeling declares useSeed in the real config, which is what makes the
  // stream path derive a seed here.
});
