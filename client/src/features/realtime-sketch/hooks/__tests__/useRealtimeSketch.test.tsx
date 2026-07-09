import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

// Wire shape pinned by the smoke gate: raw JPEG bytes in images[0].content.
const wireResult = (requestId: string): Record<string, unknown> => ({
  images: [
    {
      content: new Uint8Array([255, 216, 255, 224]),
      width: 768,
      height: 768,
      content_type: "image/jpeg",
    },
  ],
  timings: { inference: 0.3 },
  request_id: requestId,
});

describe("useRealtimeSketch", () => {
  beforeEach(() => {
    // jsdom has no object URLs; the hook turns result bytes into one.
    URL.createObjectURL = vi.fn(() => "blob:mock-render");
    URL.revokeObjectURL = vi.fn();
  });

  it("surfaces a failed token-mint preflight as a sticky error (fal's client is silent on auth failures)", async () => {
    const { connectFn } = fakeConnectFactory();
    const preflightFn = async (): Promise<string | null> =>
      "fal token mint failed (403): balance exhausted";
    const { result } = renderHook(() =>
      useRealtimeSketch({ connectFn, preflightFn }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.state.stats.lastError?.message).toBe(
      "fal token mint failed (403): balance exhausted",
    );
  });

  it("sends a captured snapshot once, with the generation settings and a request id", () => {
    const { wire, connectFn } = fakeConnectFactory();
    const { result } = renderHook(() =>
      useRealtimeSketch({ connectFn, preflightFn: async () => null }),
    );

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
    const { result } = renderHook(() =>
      useRealtimeSketch({ connectFn, preflightFn: async () => null }),
    );

    act(() => {
      result.current.captureSnapshot("data:image/jpeg;base64,frame1", 3);
      result.current.captureSnapshot("data:image/jpeg;base64,frame2", 3);
    });
    expect(wire.sent).toHaveLength(1);

    act(() => {
      wire.handlers?.onResult(wireResult("0-1"));
    });

    expect(result.current.state.liveOutput?.imageUrl).toBe("blob:mock-render");
    expect(wire.sent).toHaveLength(2);
    expect(wire.sent[1]).toMatchObject({
      image_url: "data:image/jpeg;base64,frame2",
      request_id: "0-2",
    });
  });

  it("a malformed result becomes a sticky error and frees the loop for the next snapshot", () => {
    const { wire, connectFn } = fakeConnectFactory();
    const { result } = renderHook(() =>
      useRealtimeSketch({ connectFn, preflightFn: async () => null }),
    );

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

  it("a frame stuck in flight past the watchdog reconnects and re-sends the newest drawing", () => {
    vi.useFakeTimers();
    try {
      const { wire, connectFn } = fakeConnectFactory();
      const { result } = renderHook(() =>
        useRealtimeSketch({ connectFn, preflightFn: async () => null }),
      );

      act(() => {
        result.current.captureSnapshot("data:image/jpeg;base64,frame1", 3);
        result.current.captureSnapshot("data:image/jpeg;base64,frame2", 3);
      });
      expect(wire.sent).toHaveLength(1);

      // fal silently dropped frame1's result (idle socket close fires no
      // onError). The watchdog must free the loop on its own.
      act(() => {
        vi.advanceTimersByTime(10_000);
      });

      expect(result.current.state.stats.lastError?.message).toContain(
        "timed out",
      );
      expect(wire.closed).toBe(1);
      expect(wire.sent).toHaveLength(2);
      expect(wire.sent[1]).toMatchObject({
        image_url: "data:image/jpeg;base64,frame2",
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
