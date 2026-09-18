import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useRealtimeSketch } from "../useRealtimeSketch";
import { DEFAULT_STRENGTH } from "../../config/constants";
import {
  SketchFrameRefused,
  type SendSketchFrame,
  type SketchFramePayload,
} from "../../api/falI2i";

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
      strength: DEFAULT_STRENGTH,
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

    // The trailing drawing retries once with the same bytes...
    expect(frames).toHaveLength(2);
    expect(frames[1]?.payload.image_url).toBe("data:image/jpeg;base64,frame1");

    // ...and a newer drawing captured meanwhile wins the slot when it fails.
    act(() => {
      result.current.captureSnapshot("data:image/jpeg;base64,frame3", 3);
    });
    await act(async () => {
      frames[1]?.reject(
        new Error("frame failed (503): FAL_KEY not configured"),
      );
    });
    expect(frames).toHaveLength(3);
    expect(frames[2]?.payload.image_url).toBe("data:image/jpeg;base64,frame3");
  });

  it("a malformed result becomes a sticky error; the retry failing too frees the loop", async () => {
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

    await act(async () => {
      frames[1]?.resolve({ nonsense: true });
    });

    expect(result.current.state.inFlight).toBeNull();
    expect(frames).toHaveLength(2);
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

/**
 * The relay bounds each creator's daily sketch spend (issue #84). The editor
 * has to tell the two refusals apart: a spent allowance pauses the loop until
 * the relay's own reset, while an unreadable budget is an ordinary transient
 * failure that the loop's bounded retry already handles.
 */
describe("useRealtimeSketch — daily allowance", () => {
  const RESET_AT_MS = Date.now() + 60 * 60 * 1000;

  it("pauses frame sending when the relay reports the allowance is spent", async () => {
    const { frames, sendFrameFn } = fakeSendFrameFactory();
    const { result } = renderHook(() => useRealtimeSketch({ sendFrameFn }));

    act(() => {
      result.current.captureSnapshot("data:image/jpeg;base64,frame1", 3);
    });
    await act(async () => {
      frames[0]?.reject(
        new SketchFrameRefused({
          reason: "daily-allowance-reached",
          detail: "Daily sketch allowance reached.",
          resetAtMs: RESET_AT_MS,
        }),
      );
    });

    expect(result.current.state.halted).toEqual({
      message: "Daily sketch allowance reached.",
      resumeAtMs: RESET_AT_MS,
    });
    expect(result.current.state.stats.lastError?.message).toBe(
      "Daily sketch allowance reached.",
    );

    // Further strokes send nothing — not even the bounded retry.
    act(() => {
      result.current.captureSnapshot("data:image/jpeg;base64,frame2", 3);
      result.current.captureSnapshot("data:image/jpeg;base64,frame3", 3);
    });
    expect(frames).toHaveLength(1);
  });

  it("treats an unreadable budget as a transient failure, not a pause", async () => {
    const { frames, sendFrameFn } = fakeSendFrameFactory();
    const { result } = renderHook(() => useRealtimeSketch({ sendFrameFn }));

    act(() => {
      result.current.captureSnapshot("data:image/jpeg;base64,frame1", 3);
    });
    await act(async () => {
      frames[0]?.reject(
        new SketchFrameRefused({
          reason: "budget-unavailable",
          detail:
            "Sketch budget is temporarily unavailable — no frame was sent.",
        }),
      );
    });

    expect(result.current.state.halted).toBeNull();
    expect(result.current.state.stats.lastError?.message).toBe(
      "Sketch budget is temporarily unavailable — no frame was sent.",
    );
    // The loop's existing one-shot retry still applies.
    expect(frames).toHaveLength(2);
  });
});
