import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useRealtimeSketch } from "../useRealtimeSketch";
import type { SendSketchFrame, SketchFramePayload } from "../../api/falI2i";

interface CapturedFrame {
  payload: SketchFramePayload;
  signal: AbortSignal;
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

function fakeSendFrameFactory(): {
  frames: CapturedFrame[];
  sendFrameFn: SendSketchFrame;
} {
  const frames: CapturedFrame[] = [];
  const sendFrameFn: SendSketchFrame = (payload, signal) =>
    new Promise((resolve, reject) => {
      frames.push({ payload, signal, resolve, reject });
    });
  return { frames, sendFrameFn };
}

// Wire shape pinned by the HTTP probes: data-URI url in images[0].url.
const wireResult = {
  images: [{ url: "data:image/jpeg;base64,render1", width: 512, height: 512 }],
  timings: { inference: 0.19 },
  seed: 42,
};

describe("useRealtimeSketch", () => {
  it("sends a captured snapshot once, with the generation settings", () => {
    const { frames, sendFrameFn } = fakeSendFrameFactory();
    const { result } = renderHook(() => useRealtimeSketch({ sendFrameFn }));

    act(() => {
      result.current.captureSnapshot("data:image/jpeg;base64,frame1", 3);
    });

    expect(frames).toHaveLength(1);
    expect(frames[0]?.payload).toEqual({
      prompt: expect.stringContaining("lamp"),
      image_url: "data:image/jpeg;base64,frame1",
      strength: 0.625,
      num_inference_steps: 8,
      seed: 42,
    });
  });

  it("holds the newest snapshot while busy and sends it when the result lands", async () => {
    const { frames, sendFrameFn } = fakeSendFrameFactory();
    const { result } = renderHook(() => useRealtimeSketch({ sendFrameFn }));

    act(() => {
      result.current.captureSnapshot("data:image/jpeg;base64,frame1", 3);
      result.current.captureSnapshot("data:image/jpeg;base64,frame2", 3);
    });
    expect(frames).toHaveLength(1);

    await act(async () => {
      frames[0]?.resolve(wireResult);
    });

    expect(result.current.state.liveOutput?.imageUrl).toBe(
      "data:image/jpeg;base64,render1",
    );
    expect(frames).toHaveLength(2);
    expect(frames[1]?.payload.image_url).toBe("data:image/jpeg;base64,frame2");
  });

  it("a failed frame becomes a sticky error and frees the loop", async () => {
    const { frames, sendFrameFn } = fakeSendFrameFactory();
    const { result } = renderHook(() => useRealtimeSketch({ sendFrameFn }));

    act(() => {
      result.current.captureSnapshot("data:image/jpeg;base64,frame1", 3);
    });
    await act(async () => {
      frames[0]?.reject(
        new Error("frame failed (503): FAL_KEY not configured"),
      );
    });

    expect(result.current.state.stats.lastError?.message).toContain(
      "frame failed (503)",
    );
    expect(result.current.state.liveOutput).toBeNull();

    act(() => {
      result.current.captureSnapshot("data:image/jpeg;base64,frame3", 3);
    });
    expect(frames).toHaveLength(2);
  });

  it("a malformed result becomes a sticky error and frees the loop", async () => {
    const { frames, sendFrameFn } = fakeSendFrameFactory();
    const { result } = renderHook(() => useRealtimeSketch({ sendFrameFn }));

    act(() => {
      result.current.captureSnapshot("data:image/jpeg;base64,frame1", 3);
    });
    await act(async () => {
      frames[0]?.resolve({ nonsense: true });
    });

    expect(result.current.state.stats.lastError?.message).toContain(
      "unexpected result shape",
    );
    expect(result.current.state.inFlight).toBeNull();
  });

  it("a frame stuck past the watchdog is aborted and the newest drawing takes over", async () => {
    vi.useFakeTimers();
    try {
      const { frames, sendFrameFn } = fakeSendFrameFactory();
      const { result } = renderHook(() => useRealtimeSketch({ sendFrameFn }));

      act(() => {
        result.current.captureSnapshot("data:image/jpeg;base64,frame1", 3);
        result.current.captureSnapshot("data:image/jpeg;base64,frame2", 3);
      });
      expect(frames).toHaveLength(1);

      await act(async () => {
        vi.advanceTimersByTime(10_000);
      });

      expect(frames[0]?.signal.aborted).toBe(true);
      expect(result.current.state.stats.lastError?.message).toContain(
        "timed out",
      );
      expect(frames).toHaveLength(2);
      expect(frames[1]?.payload.image_url).toBe(
        "data:image/jpeg;base64,frame2",
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
