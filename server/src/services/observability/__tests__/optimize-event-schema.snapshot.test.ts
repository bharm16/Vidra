import { describe, it, expect, vi } from "vitest";
import { OptimizeTelemetryService } from "../OptimizeTelemetryService";
import type {
  IPostHogClient,
  CaptureArgs,
} from "@infrastructure/PostHogClient";

describe("optimize.completed event schema (contract)", () => {
  it("emits a stable shape — change requires explicit review", () => {
    const captures: CaptureArgs[] = [];
    const client: IPostHogClient = {
      capture: vi.fn((args: CaptureArgs) => {
        captures.push(args);
      }),
      shutdown: vi.fn(async () => {}),
    };
    const service = new OptimizeTelemetryService(client);
    const trace = service.startOptimizeTrace("req-fixture", "user-fixture");

    trace.recordStage("shot_interpreter", 100);
    trace.recordStage("strategy", 200);
    trace.recordStage("intent_lock", 5);
    trace.recordStage("compilation", 300);
    trace.recordStage("prompt_lint", 1);
    trace.recordLlmCall();
    trace.recordLlmCall();
    trace.recordLlmCall();

    trace.complete({
      outcome: "success",
      promptLength: 120,
      outputLength: 250,
      lockedSpanCount: 2,
      targetModel: "kling-2.5",
      mode: "video",
      hasContext: true,
      hasBrainstormContext: false,
      hasShotPlan: false,
      useConstitutionalAI: false,
      inputPrompt: "snapshot fixture input prompt",
      outputPrompt: "snapshot fixture optimized output",
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
        llmCallCount: (capture.properties as { llmCallCount?: number })
          ?.llmCallCount,
        mode: (capture.properties as { mode?: string })?.mode,
      },
    };

    expect(normalized).toMatchInlineSnapshot(`
      {
        "distinctId": "user-fixture",
        "event": "optimize.completed",
        "propertyKeys": [
          "cacheHit",
          "durationMs",
          "hasBrainstormContext",
          "hasContext",
          "hasShotPlan",
          "inputPrompt",
          "llmCallCount",
          "lockedSpanCount",
          "mode",
          "modelVariant",
          "outcome",
          "outputLength",
          "outputPrompt",
          "previewPrompt",
          "promptLength",
          "requestId",
          "stages",
          "targetModel",
          "useConstitutionalAI",
          "userId",
        ],
        "sampleValues": {
          "cacheHit": false,
          "llmCallCount": 3,
          "mode": "video",
          "outcome": "success",
        },
        "stageKeys": [
          "compilationMs",
          "constitutionalMs",
          "intentLockMs",
          "promptLintMs",
          "shotInterpreterMs",
          "strategyOptimizeMs",
        ],
      }
    `);
  });
});
