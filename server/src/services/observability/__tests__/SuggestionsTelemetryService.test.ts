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
