import { describe, it, expect, vi, beforeEach } from "vitest";
import { runWithRequestContext } from "@infrastructure/requestContext";
import { LlmCallTelemetryService } from "../LlmCallTelemetryService";
import type {
  CaptureArgs,
  IPostHogClient,
} from "@infrastructure/PostHogClient";
import type { LlmCallSummary } from "../types";

const baseSummary: LlmCallSummary = {
  executionType: "image_observation",
  durationMs: 420,
  provider: "openai",
  model: "gpt-4o-mini-2024-07-18",
  promptTokens: 100,
  completionTokens: 200,
  totalTokens: 300,
  finishReason: "stop",
  outcome: "success",
};

const makeMockClient = () => {
  const captures: CaptureArgs[] = [];
  const client: IPostHogClient = {
    capture: vi.fn((args: CaptureArgs) => {
      captures.push(args);
    }),
    shutdown: vi.fn(async () => {}),
  };
  return { client, captures };
};

describe("LlmCallTelemetryService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("populates all token + provider fields in event properties", () => {
    const { client, captures } = makeMockClient();
    const service = new LlmCallTelemetryService(client);

    service.record(baseSummary);

    expect(captures[0]?.properties).toMatchObject({
      executionType: "image_observation",
      provider: "openai",
      model: "gpt-4o-mini-2024-07-18",
      durationMs: 420,
      promptTokens: 100,
      completionTokens: 200,
      totalTokens: 300,
      finishReason: "stop",
      outcome: "success",
      userId: null,
    });
  });

  it("includes errorMessage and outcome=error on failed calls", () => {
    const { client, captures } = makeMockClient();
    const service = new LlmCallTelemetryService(client);

    service.record({
      ...baseSummary,
      outcome: "error",
      errorMessage: "rate limit exceeded",
      provider: null,
      model: null,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      finishReason: null,
    });

    expect(captures[0]?.properties).toMatchObject({
      outcome: "error",
      errorMessage: "rate limit exceeded",
      provider: null,
      model: null,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      finishReason: null,
    });
  });

  it("uses userId as distinctId when provided", () => {
    const { client, captures } = makeMockClient();
    const service = new LlmCallTelemetryService(client);

    service.record({ ...baseSummary, userId: "user-42" });

    expect(captures[0]?.distinctId).toBe("user-42");
    expect(captures[0]?.properties?.userId).toBe("user-42");
  });

  it("reads requestId from the AsyncLocalStorage request context when present", () => {
    const { client, captures } = makeMockClient();
    const service = new LlmCallTelemetryService(client);

    runWithRequestContext({ requestId: "req-abc" }, () => {
      service.record(baseSummary);
    });

    expect(captures[0]?.properties?.requestId).toBe("req-abc");
  });

  it("does not throw when the underlying client.capture throws", () => {
    const client: IPostHogClient = {
      capture: vi.fn(() => {
        throw new Error("posthog down");
      }),
      shutdown: vi.fn(async () => {}),
    };
    const service = new LlmCallTelemetryService(client);

    expect(() => service.record(baseSummary)).not.toThrow();
  });
});
