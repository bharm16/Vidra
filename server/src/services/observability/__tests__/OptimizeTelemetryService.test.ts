import { describe, it, expect, vi, beforeEach } from "vitest";
import { OptimizeTelemetryService } from "../OptimizeTelemetryService";
import type {
  IPostHogClient,
  CaptureArgs,
} from "@infrastructure/PostHogClient";

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

describe("OptimizeTelemetryService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits one optimize.completed event on complete()", () => {
    const { client, captures } = makeMockClient();
    const service = new OptimizeTelemetryService(client);
    const trace = service.startOptimizeTrace("req-1", "user-1");

    trace.recordStage("shot_interpreter", 480);
    trace.recordStage("strategy", 2200);
    trace.recordLlmCall();
    trace.recordLlmCall();

    trace.complete({
      outcome: "success",
      promptLength: 50,
      outputLength: 100,
      lockedSpanCount: 0,
      targetModel: "kling-2.5",
      mode: "video",
      hasContext: false,
      hasBrainstormContext: false,
      hasShotPlan: false,
      useConstitutionalAI: false,
      inputPrompt: "test input prompt",
      outputPrompt: "test output prompt",
    });

    expect(captures).toHaveLength(1);
    expect(captures[0]!.event).toBe("optimize.completed");
    expect(captures[0]!.distinctId).toBe("user-1");
    expect(captures[0]!.properties).toMatchObject({
      requestId: "req-1",
      userId: "user-1",
      outcome: "success",
      llmCallCount: 2,
      cacheHit: false,
      targetModel: "kling-2.5",
      stages: expect.objectContaining({
        shotInterpreterMs: 480,
        strategyOptimizeMs: 2200,
        constitutionalMs: null,
        intentLockMs: null,
        compilationMs: null,
        promptLintMs: null,
      }),
    });
  });

  it("uses anon-<uuid> distinctId when userId is null", () => {
    const { client, captures } = makeMockClient();
    const service = new OptimizeTelemetryService(client);
    const trace = service.startOptimizeTrace("req-1", null);

    trace.complete({
      outcome: "success",
      promptLength: 0,
      outputLength: 0,
      lockedSpanCount: 0,
      targetModel: null,
      mode: "video",
      hasContext: false,
      hasBrainstormContext: false,
      hasShotPlan: false,
      useConstitutionalAI: false,
      inputPrompt: "test input prompt",
      outputPrompt: "test output prompt",
    });

    expect(captures[0]!.distinctId).toMatch(/^anon-/);
    expect(captures[0]!.properties).toMatchObject({ userId: null });
  });

  it("populates errorStage and errorMessage on recordError", () => {
    const { client, captures } = makeMockClient();
    const service = new OptimizeTelemetryService(client);
    const trace = service.startOptimizeTrace("req-1", "user-1");

    trace.recordError("compilation", new Error("boom"));
    trace.complete({
      outcome: "error",
      promptLength: 50,
      outputLength: 0,
      lockedSpanCount: 0,
      targetModel: "kling-2.5",
      mode: "video",
      hasContext: false,
      hasBrainstormContext: false,
      hasShotPlan: false,
      useConstitutionalAI: false,
      inputPrompt: "test input prompt",
      outputPrompt: "test output prompt",
    });

    expect(captures[0]!.properties).toMatchObject({
      outcome: "error",
      errorStage: "compilation",
      errorMessage: "boom",
    });
  });

  it("sets cacheHit=true and leaves stages null when recordCacheHit is called", () => {
    const { client, captures } = makeMockClient();
    const service = new OptimizeTelemetryService(client);
    const trace = service.startOptimizeTrace("req-1", "user-1");

    trace.recordCacheHit();
    trace.complete({
      outcome: "success",
      promptLength: 50,
      outputLength: 100,
      lockedSpanCount: 0,
      targetModel: null,
      mode: "video",
      hasContext: false,
      hasBrainstormContext: false,
      hasShotPlan: false,
      useConstitutionalAI: false,
      inputPrompt: "test input prompt",
      outputPrompt: "test output prompt",
    });

    expect(captures[0]!.properties).toMatchObject({
      cacheHit: true,
      stages: {
        shotInterpreterMs: null,
        strategyOptimizeMs: null,
        constitutionalMs: null,
        intentLockMs: null,
        compilationMs: null,
        promptLintMs: null,
      },
    });
  });

  it("durationMs is computed from startedAt to complete()", async () => {
    const { client, captures } = makeMockClient();
    const service = new OptimizeTelemetryService(client);
    const trace = service.startOptimizeTrace("req-1", "user-1");

    // Sleep well above the assertion floor: setTimeout(10) + a >=10 assertion
    // has zero margin, so timer coalescing/rounding under full-suite load can
    // measure 9ms and flake. 25ms keeps the elapsed comfortably above 10.
    await new Promise((resolve) => setTimeout(resolve, 25));

    trace.complete({
      outcome: "success",
      promptLength: 0,
      outputLength: 0,
      lockedSpanCount: 0,
      targetModel: null,
      mode: "video",
      hasContext: false,
      hasBrainstormContext: false,
      hasShotPlan: false,
      useConstitutionalAI: false,
      inputPrompt: "test input prompt",
      outputPrompt: "test output prompt",
    });

    expect(captures[0]!.properties?.durationMs).toBeGreaterThanOrEqual(10);
  });

  it("does not throw if the underlying client.capture throws", () => {
    const client: IPostHogClient = {
      capture: vi.fn(() => {
        throw new Error("posthog down");
      }),
      shutdown: vi.fn(async () => {}),
    };
    const service = new OptimizeTelemetryService(client);
    const trace = service.startOptimizeTrace("req-1", "user-1");

    expect(() =>
      trace.complete({
        outcome: "success",
        promptLength: 0,
        outputLength: 0,
        lockedSpanCount: 0,
        targetModel: null,
        mode: "video",
        hasContext: false,
        hasBrainstormContext: false,
        hasShotPlan: false,
        useConstitutionalAI: false,
        inputPrompt: "test input prompt",
        outputPrompt: "test output prompt",
      }),
    ).not.toThrow();
  });
});
