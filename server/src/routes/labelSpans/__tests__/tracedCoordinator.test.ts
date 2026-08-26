import { describe, it, expect, vi } from "vitest";
import { createTracedLabelSpansCoordinator } from "../tracedCoordinator";
import type {
  LabelSpansCoordinatorInput,
  LabelSpansCoordinatorResult,
} from "../coordinator";
import type { SpanLabelingTelemetryService } from "@services/observability/SpanLabelingTelemetryService";

function makeTelemetry() {
  const trace = {
    recordCacheHit: vi.fn(),
    recordError: vi.fn(),
    complete: vi.fn(),
  };
  const startSpanLabelingTrace = vi.fn(() => trace);
  const telemetry = {
    startSpanLabelingTrace,
  } as unknown as SpanLabelingTelemetryService;
  return { telemetry, trace, startSpanLabelingTrace };
}

const INPUT: LabelSpansCoordinatorInput = {
  payload: {} as never,
  text: "hello world",
  policy: null,
  templateVersion: null,
  requestId: "req-1",
  userId: "user-1",
  startTimeMs: 0,
};

function makeInner(value: LabelSpansCoordinatorResult | Error) {
  return {
    resolve: vi.fn(
      async (
        _input: LabelSpansCoordinatorInput,
      ): Promise<LabelSpansCoordinatorResult> => {
        if (value instanceof Error) throw value;
        return value;
      },
    ),
  };
}

describe("createTracedLabelSpansCoordinator", () => {
  it("returns the inner coordinator untouched when telemetry is null", async () => {
    const value = {
      result: { spans: [], meta: {} },
      headers: {},
    } as unknown as LabelSpansCoordinatorResult;
    const inner = makeInner(value);
    const coordinator = createTracedLabelSpansCoordinator(inner, null);

    await expect(coordinator.resolve(INPUT)).resolves.toBe(value);
    expect(inner.resolve).toHaveBeenCalledWith(INPUT);
  });

  it("starts a trace and completes with success on a successful resolve", async () => {
    const { telemetry, trace, startSpanLabelingTrace } = makeTelemetry();
    const inner = makeInner({
      result: {
        spans: [
          {
            text: "hello",
            role: "subject.identity",
            confidence: 0.9,
            start: 0,
            end: 5,
          },
        ],
        meta: { provider: "openai", model: "gpt-4o" },
      },
      headers: { "X-Cache": "MISS" },
    } as unknown as LabelSpansCoordinatorResult);
    const coordinator = createTracedLabelSpansCoordinator(inner, telemetry);

    await coordinator.resolve(INPUT);

    expect(startSpanLabelingTrace).toHaveBeenCalledWith("req-1", "user-1");
    expect(trace.recordCacheHit).not.toHaveBeenCalled();
    expect(trace.complete).toHaveBeenCalledTimes(1);
    const summary = trace.complete.mock.calls[0]![0];
    expect(summary.outcome).toBe("success");
    expect(summary.spanCount).toBe(1);
    expect(summary.provider).toBe("openai");
    expect(summary.model).toBe("gpt-4o");
    expect(summary.promptLength).toBe(INPUT.text.length);
    expect(summary.spans).toEqual([
      { text: "hello", category: "subject.identity" },
    ]);
  });

  it("records a cache hit only when X-Cache is HIT", async () => {
    const { telemetry, trace } = makeTelemetry();
    const inner = makeInner({
      result: { spans: [], meta: {} },
      headers: { "X-Cache": "HIT" },
    } as unknown as LabelSpansCoordinatorResult);
    const coordinator = createTracedLabelSpansCoordinator(inner, telemetry);

    await coordinator.resolve(INPUT);

    expect(trace.recordCacheHit).toHaveBeenCalledTimes(1);
  });

  it("records an error and completes with error when there is no result", async () => {
    const { telemetry, trace } = makeTelemetry();
    const inner = makeInner({ result: null, headers: {} });
    const coordinator = createTracedLabelSpansCoordinator(inner, telemetry);

    const out = await coordinator.resolve(INPUT);

    expect(out.result).toBeNull();
    expect(trace.recordError).toHaveBeenCalledWith(
      "post_processing",
      expect.any(Error),
    );
    expect(trace.complete).toHaveBeenCalledTimes(1);
    expect(trace.complete.mock.calls[0]![0].outcome).toBe("error");
  });

  it("records the error and rethrows when the inner coordinator throws", async () => {
    const { telemetry, trace } = makeTelemetry();
    const boom = new Error("llm exploded");
    const inner = makeInner(boom);
    const coordinator = createTracedLabelSpansCoordinator(inner, telemetry);

    await expect(coordinator.resolve(INPUT)).rejects.toBe(boom);
    expect(trace.recordError).toHaveBeenCalledWith("llm_call", boom);
    expect(trace.complete.mock.calls[0]![0].outcome).toBe("error");
  });
});
