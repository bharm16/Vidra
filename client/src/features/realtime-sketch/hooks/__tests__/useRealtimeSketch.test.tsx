import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useRealtimeSketch } from "../useRealtimeSketch";
import type {
  RealtimeSketchConnection,
  RealtimeSketchHandlers,
} from "../../api/falRealtime";

interface FakeWire {
  handlers: RealtimeSketchHandlers | null;
  sent: Array<Record<string, unknown>>;
  closed: number;
}

function fakeConnectFactory(): {
  wire: FakeWire;
  connectFn: (handlers: RealtimeSketchHandlers) => RealtimeSketchConnection;
} {
  const wire: FakeWire = { handlers: null, sent: [], closed: 0 };
  const connectFn = (
    handlers: RealtimeSketchHandlers,
  ): RealtimeSketchConnection => {
    wire.handlers = handlers;
    return {
      send: (payload: Record<string, unknown>) => {
        wire.sent.push(payload);
      },
      close: () => {
        wire.closed += 1;
      },
    };
  };
  return { wire, connectFn };
}

describe("useRealtimeSketch", () => {
  it("sends a captured snapshot once, with the generation settings and a request id", () => {
    const { wire, connectFn } = fakeConnectFactory();
    const { result } = renderHook(() => useRealtimeSketch({ connectFn }));

    act(() => {
      result.current.captureSnapshot("data:image/jpeg;base64,frame1", 3);
    });

    expect(wire.sent).toHaveLength(1);
    expect(wire.sent[0]).toMatchObject({
      image_url: "data:image/jpeg;base64,frame1",
      strength: 0.75,
      num_inference_steps: 4,
      image_size: { width: 768, height: 768 },
      sync_mode: true,
      request_id: "0-1",
    });
  });

  it("holds the newest snapshot while busy and sends it when the result lands", () => {
    const { wire, connectFn } = fakeConnectFactory();
    const { result } = renderHook(() => useRealtimeSketch({ connectFn }));

    act(() => {
      result.current.captureSnapshot("data:image/jpeg;base64,frame1", 3);
      result.current.captureSnapshot("data:image/jpeg;base64,frame2", 3);
    });
    expect(wire.sent).toHaveLength(1);

    act(() => {
      wire.handlers?.onResult({
        images: [{ url: "data:image/jpeg;base64,render1" }],
        timings: { inference: 0.3 },
        request_id: "0-1",
      });
    });

    expect(result.current.state.liveOutput?.imageDataUri).toBe(
      "data:image/jpeg;base64,render1",
    );
    expect(wire.sent).toHaveLength(2);
    expect(wire.sent[1]).toMatchObject({
      image_url: "data:image/jpeg;base64,frame2",
      request_id: "0-2",
    });
  });

  it("a malformed result becomes a sticky error and frees the loop for the next snapshot", () => {
    const { wire, connectFn } = fakeConnectFactory();
    const { result } = renderHook(() => useRealtimeSketch({ connectFn }));

    act(() => {
      result.current.captureSnapshot("data:image/jpeg;base64,frame1", 3);
    });
    act(() => {
      wire.handlers?.onResult({ nonsense: true });
    });

    expect(result.current.state.stats.lastError?.message).toContain(
      "unexpected result shape",
    );
    expect(result.current.state.liveOutput).toBeNull();

    act(() => {
      result.current.captureSnapshot("data:image/jpeg;base64,frame3", 3);
    });
    expect(wire.sent).toHaveLength(2);
  });
});
