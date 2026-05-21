import { describe, it, expect, vi } from "vitest";
import { SuggestionsTelemetryService } from "../SuggestionsTelemetryService";
import type {
  IPostHogClient,
  CaptureArgs,
} from "@infrastructure/PostHogClient";

describe("suggestions.completed event schema (contract)", () => {
  it("emits a stable shape — change requires explicit review", () => {
    const captures: CaptureArgs[] = [];
    const client: IPostHogClient = {
      capture: vi.fn((args: CaptureArgs) => {
        captures.push(args);
      }),
      shutdown: vi.fn(async () => {}),
    };
    const service = new SuggestionsTelemetryService(client);
    const trace = service.startSuggestionsTrace("req-fixture", "user-fixture");

    trace.recordStage("video_context", 12);
    trace.recordStage("span_context", 8);
    trace.recordStage("cache", 3);
    trace.recordStage("v2_engine", 1500);
    trace.recordStage("post_processing", 5);

    trace.complete({
      outcome: "success",
      promptLength: 120,
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
      suggestions: ["soft lighting", "warm tungsten", "moody candlelight"],
    });

    expect(captures).toHaveLength(1);
    const capture = captures[0]!;

    const normalized = {
      distinctId: capture.distinctId,
      event: capture.event,
      propertyKeys: Object.keys(capture.properties || {}).sort(),
      stageKeys: Object.keys(
        (capture.properties as { stages?: object })?.stages || {},
      ).sort(),
      sampleValues: {
        outcome: (capture.properties as { outcome?: string })?.outcome,
        cacheHit: (capture.properties as { cacheHit?: boolean })?.cacheHit,
        suggestionCount: (capture.properties as { suggestionCount?: number })
          ?.suggestionCount,
        modelCallCount: (capture.properties as { modelCallCount?: number })
          ?.modelCallCount,
        engineMode: (capture.properties as { engineMode?: string })?.engineMode,
      },
    };

    expect(normalized).toMatchInlineSnapshot(`
      {
        "distinctId": "user-fixture",
        "event": "suggestions.completed",
        "propertyKeys": [
          "cacheHit",
          "categoryId",
          "debug",
          "durationMs",
          "engineMode",
          "fallbackApplied",
          "fullPrompt",
          "highlightedCategory",
          "highlightedText",
          "isPlaceholder",
          "isVideoPrompt",
          "modelCallCount",
          "modelTarget",
          "modelVariant",
          "outcome",
          "phraseRole",
          "policyVersion",
          "promptLength",
          "promptSection",
          "requestId",
          "sceneSummary",
          "stages",
          "suggestionCount",
          "suggestions",
          "userId",
        ],
        "sampleValues": {
          "cacheHit": false,
          "engineMode": "guided_llm",
          "modelCallCount": 1,
          "outcome": "success",
          "suggestionCount": 5,
        },
        "stageKeys": [
          "cacheCheckMs",
          "postProcessingMs",
          "spanContextMs",
          "v2EngineMs",
          "videoContextMs",
        ],
      }
    `);
  });
});
