import { describe, it, expect, vi } from "vitest";
import { SpanLabelingTelemetryService } from "../SpanLabelingTelemetryService";
import type {
  IPostHogClient,
  CaptureArgs,
} from "@infrastructure/PostHogClient";

describe("label-spans.completed event schema (contract)", () => {
  it("emits a stable shape — change requires explicit review", () => {
    const captures: CaptureArgs[] = [];
    const client: IPostHogClient = {
      capture: vi.fn((args: CaptureArgs) => {
        captures.push(args);
      }),
      shutdown: vi.fn(async () => {}),
    };
    const service = new SpanLabelingTelemetryService(client);
    const trace = service.startSpanLabelingTrace("req-fixture", "user-fixture");

    trace.recordCacheHit();
    trace.complete({
      outcome: "success",
      promptLength: 120,
      spanCount: 8,
      // Real production routing: span_labeling → gemini / gemini-2.5-flash
      // per server/src/config/modelConfig.ts.
      provider: "gemini",
      model: "gemini-2.5-flash",
      inputText: "fixture input text for snapshot",
      spans: [
        { text: "fixture", category: "subject" },
        { text: "input text", category: "setting" },
      ],
    });

    expect(captures).toHaveLength(1);
    const capture = captures[0]!;
    const normalized = {
      distinctId: capture.distinctId,
      event: capture.event,
      propertyKeys: Object.keys(capture.properties || {}).sort(),
      sampleValues: {
        outcome: (capture.properties as { outcome?: string })?.outcome,
        cacheHit: (capture.properties as { cacheHit?: boolean })?.cacheHit,
        spanCount: (capture.properties as { spanCount?: number })?.spanCount,
        provider: (capture.properties as { provider?: string })?.provider,
      },
    };

    expect(normalized).toMatchInlineSnapshot(`
      {
        "distinctId": "user-fixture",
        "event": "label-spans.completed",
        "propertyKeys": [
          "cacheHit",
          "durationMs",
          "inputText",
          "model",
          "modelVariant",
          "outcome",
          "promptLength",
          "provider",
          "requestId",
          "spanCount",
          "spans",
          "userId",
        ],
        "sampleValues": {
          "cacheHit": true,
          "outcome": "success",
          "provider": "gemini",
          "spanCount": 8,
        },
      }
    `);
  });
});
