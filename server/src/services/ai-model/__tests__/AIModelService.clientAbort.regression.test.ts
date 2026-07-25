import { beforeEach, describe, expect, it, vi } from "vitest";

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@infrastructure/Logger", () => ({
  logger: loggerMock,
}));

import { AIModelService } from "../AIModelService";
import { ModelConfig } from "@config/modelConfig";

// Real routing against the real ModelConfig: optimize_standard declares its
// primary client (env-overridable) and pins its fallback via fallbackTo, so
// the test reads both from the config instead of inventing a plan. Only the
// process boundary — the injected client instances — is stubbed.
const optimizeStandard = ModelConfig.optimize_standard;
if (!optimizeStandard?.fallbackTo) {
  throw new Error(
    "optimize_standard lost its fallbackTo — this regression test exercises " +
      "the primary→fallback path and needs an operation that declares one.",
  );
}
const primaryName = optimizeStandard.client;
const fallbackName = optimizeStandard.fallbackTo;

describe("AIModelService client-abort regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("for any client-aborted primary request, fallback must not execute", async () => {
    const clientAbortError = new Error(
      `${primaryName} API request aborted by client`,
    );
    clientAbortError.name = "ClientAbortError";

    const primaryComplete = vi.fn().mockRejectedValue(clientAbortError);
    const fallbackComplete = vi
      .fn()
      .mockResolvedValue({ text: "fallback", metadata: {} });

    const service = new AIModelService({
      clients: {
        [primaryName]: { complete: primaryComplete },
        [fallbackName]: { complete: fallbackComplete },
      } as never,
    });

    await expect(
      service.execute("optimize_standard", { systemPrompt: "prompt" }),
    ).rejects.toBe(clientAbortError);

    expect(primaryComplete).toHaveBeenCalledTimes(1);
    expect(fallbackComplete).not.toHaveBeenCalled();
  });

  it("for retryable non-abort errors, fallback still executes", async () => {
    const retryableError = new Error(`${primaryName} 503`);
    (retryableError as Error & { isRetryable?: boolean }).isRetryable = true;

    const primaryComplete = vi.fn().mockRejectedValue(retryableError);
    const fallbackComplete = vi
      .fn()
      .mockResolvedValue({ text: "fallback-ok", metadata: {} });

    const service = new AIModelService({
      clients: {
        [primaryName]: { complete: primaryComplete },
        [fallbackName]: { complete: fallbackComplete },
      } as never,
    });

    const response = await service.execute("optimize_standard", {
      systemPrompt: "prompt",
    });

    expect(response.text).toBe("fallback-ok");
    expect(fallbackComplete).toHaveBeenCalledTimes(1);
  });
});
