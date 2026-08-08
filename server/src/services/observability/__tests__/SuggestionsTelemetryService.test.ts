import { describe, it, expect, vi, beforeEach } from "vitest";
import { SuggestionsTelemetryService } from "../SuggestionsTelemetryService";
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

const baseSummary = {
  outcome: "success" as const,
  promptLength: 50,
  suggestionCount: 5,
  highlightedCategory: "lighting",
  isVideoPrompt: true,
  isPlaceholder: false,
  modelTarget: "kling-2.5",
  promptSection: null,
  phraseRole: null,
  policyVersion: "2026-03-v2a",
  categoryId: "lighting",
  engineMode: "guided_llm",
  modelCallCount: 1,
  fallbackApplied: false,
  debug: false,
  highlightedText: "dim lighting",
  fullPrompt: "A dim lighting jazz club with a saxophone player",
  suggestions: ["soft lighting", "warm lighting", "moody lighting"],
};

describe("SuggestionsTelemetryService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits one suggestions.completed event on complete()", () => {
    const { client, captures } = makeMockClient();
    const service = new SuggestionsTelemetryService(client);
    const trace = service.startSuggestionsTrace("req-1", "user-1");

    trace.recordStage("video_context", 12);
    trace.recordStage("span_context", 8);
    trace.recordStage("v2_engine", 1500);

    trace.complete(baseSummary);

    expect(captures).toHaveLength(1);
    expect(captures[0]!.event).toBe("suggestions.completed");
    expect(captures[0]!.distinctId).toBe("user-1");
    expect(captures[0]!.properties).toMatchObject({
      requestId: "req-1",
      userId: "user-1",
      outcome: "success",
      cacheHit: false,
      suggestionCount: 5,
      highlightedCategory: "lighting",
      categoryId: "lighting",
      engineMode: "guided_llm",
      modelCallCount: 1,
      stages: expect.objectContaining({
        videoContextMs: 12,
        spanContextMs: 8,
        cacheCheckMs: null,
        v2EngineMs: 1500,
        postProcessingMs: null,
      }),
    });
  });

  it("uses anon-<uuid> distinctId when userId is null", () => {
    const { client, captures } = makeMockClient();
    const service = new SuggestionsTelemetryService(client);
    const trace = service.startSuggestionsTrace("req-1", null);

    trace.complete({
      ...baseSummary,
      suggestionCount: 0,
      modelCallCount: 0,
    });

    expect(captures[0]!.distinctId).toMatch(/^anon-/);
    expect(captures[0]!.properties).toMatchObject({ userId: null });
  });

  it("populates errorStage and errorMessage on recordError", () => {
    const { client, captures } = makeMockClient();
    const service = new SuggestionsTelemetryService(client);
    const trace = service.startSuggestionsTrace("req-1", "user-1");

    trace.recordError("v2_engine", new Error("scoring failed"));
    trace.complete({ ...baseSummary, outcome: "error", suggestionCount: 0 });

    expect(captures[0]!.properties).toMatchObject({
      outcome: "error",
      errorStage: "v2_engine",
      errorMessage: "scoring failed",
    });
  });

  it("sets cacheHit=true and leaves stages null when recordCacheHit is called", () => {
    const { client, captures } = makeMockClient();
    const service = new SuggestionsTelemetryService(client);
    const trace = service.startSuggestionsTrace("req-1", "user-1");

    trace.recordCacheHit();
    trace.complete(baseSummary);

    expect(captures[0]!.properties).toMatchObject({
      cacheHit: true,
      stages: {
        videoContextMs: null,
        spanContextMs: null,
        cacheCheckMs: null,
        v2EngineMs: null,
        postProcessingMs: null,
      },
    });
  });

  it("durationMs is computed from startedAt to complete()", () => {
    // Fake `performance`, because that is the clock the service reads:
    // durationMs is Math.round(performance.now() - startedAt). Sleeping for
    // real and asserting >= 10 raced that rounding — setTimeout's delay is not
    // measured on the same clock, so a 10ms sleep could elapse as 9.4ms of
    // performance.now() and round DOWN to 9. That failed in CI at 9.
    //
    // Advancing a fake clock makes the elapsed time exact, which also lets the
    // assertion tighten from ">= 10" to "== 10" — it now pins the arithmetic
    // rather than a lower bound any slow machine would satisfy.
    vi.useFakeTimers({ toFake: ["performance", "Date", "setTimeout"] });
    try {
      const { client, captures } = makeMockClient();
      const service = new SuggestionsTelemetryService(client);
      const trace = service.startSuggestionsTrace("req-1", "user-1");

      vi.advanceTimersByTime(10);

      trace.complete(baseSummary);

      expect(captures[0]!.properties?.durationMs).toBe(10);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not throw if the underlying client.capture throws", () => {
    const client: IPostHogClient = {
      capture: vi.fn(() => {
        throw new Error("posthog down");
      }),
      shutdown: vi.fn(async () => {}),
    };
    const service = new SuggestionsTelemetryService(client);
    const trace = service.startSuggestionsTrace("req-1", "user-1");

    expect(() => trace.complete(baseSummary)).not.toThrow();
  });
});
