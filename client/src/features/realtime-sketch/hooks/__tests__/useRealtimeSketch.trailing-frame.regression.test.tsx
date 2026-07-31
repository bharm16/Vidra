import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useRealtimeSketch } from "../useRealtimeSketch";
import {
  createInitialGenerationState,
  generationReducer,
} from "../generationReducer";
import type { SendSketchFrame, SketchFramePayload } from "../../api/falI2i";

/**
 * Regression from the 2026-07-27 live-editor reliability diagnosis.
 *
 * Send-discipline invariant #3 (spike spec): "stroke-end always captures, so
 * the final drawing state always renders." A transient failure on the
 * trailing frame — nothing pending behind it — used to strand the newest
 * drawing forever: the loop went idle and the live output stayed stale until
 * the creator happened to draw again. The trailing frame now gets exactly
 * one bounded retry; a second failure frees the loop and the sticky error
 * stands, so a dead relay is never hammered.
 */

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

const wireResult = {
  images: [{ url: "data:image/jpeg;base64,render1", width: 512, height: 512 }],
  timings: { inference: 0.19 },
  seed: 42,
};

const snapshot = (at: number, dataUri = `data:image/jpeg;base64,frame${at}`) =>
  ({
    type: "snapshot",
    dataUri,
    encodeMs: 3,
    at,
  }) as const;

describe("generationReducer — trailing-frame retry discipline", () => {
  it("retries a failed trailing frame once, with the same drawing bytes", () => {
    let state = generationReducer(
      createInitialGenerationState(),
      snapshot(1_000),
    );
    state = generationReducer(state, {
      type: "generationError",
      message: "frame failed (500): relay hiccup",
      requestId: "0-1",
      at: 1_600,
    });

    expect(state.inFlight?.requestId).toBe("0-2");
    expect(state.inFlight?.dataUri).toBe("data:image/jpeg;base64,frame1000");
    expect(state.inFlight?.sentAt).toBe(1_600);
    expect(state.stats.sent).toBe(2);
    expect(state.stats.lastError?.message).toBe(
      "frame failed (500): relay hiccup",
    );
  });

  it("a retry that fails again frees the loop instead of retrying forever", () => {
    let state = generationReducer(
      createInitialGenerationState(),
      snapshot(1_000),
    );
    state = generationReducer(state, {
      type: "generationError",
      message: "frame failed (500): relay hiccup",
      requestId: "0-1",
      at: 1_600,
    });
    state = generationReducer(state, {
      type: "generationError",
      message: "frame failed (500): relay hiccup",
      requestId: "0-2",
      at: 2_200,
    });

    expect(state.inFlight).toBeNull();
    expect(state.stats.sent).toBe(2);
    expect(state.stats.lastError?.message).toBe(
      "frame failed (500): relay hiccup",
    );
  });

  it("a fresh snapshot after a failed retry earns its own retry budget", () => {
    let state = generationReducer(
      createInitialGenerationState(),
      snapshot(1_000),
    );
    state = generationReducer(state, {
      type: "generationError",
      message: "boom",
      requestId: "0-1",
      at: 1_600,
    });
    state = generationReducer(state, {
      type: "generationError",
      message: "boom",
      requestId: "0-2",
      at: 2_200,
    });
    state = generationReducer(state, snapshot(3_000));
    state = generationReducer(state, {
      type: "generationError",
      message: "boom",
      requestId: "0-3",
      at: 3_600,
    });

    expect(state.inFlight?.requestId).toBe("0-4");
    expect(state.inFlight?.dataUri).toBe("data:image/jpeg;base64,frame3000");
  });

  it("a pending drawing still wins over a retry — newest wins, always", () => {
    let state = generationReducer(
      createInitialGenerationState(),
      snapshot(1_000),
    );
    state = generationReducer(state, snapshot(1_150));
    state = generationReducer(state, {
      type: "generationError",
      message: "boom",
      requestId: "0-1",
      at: 1_600,
    });

    expect(state.inFlight?.dataUri).toBe("data:image/jpeg;base64,frame1150");
  });
});

describe("useRealtimeSketch — trailing-frame retry wiring", () => {
  it("a transient failure self-heals: the retry carries the same bytes and its result renders", async () => {
    const { frames, sendFrameFn } = fakeSendFrameFactory();
    const { result } = renderHook(() => useRealtimeSketch({ sendFrameFn }));

    act(() => {
      result.current.captureSnapshot("data:image/jpeg;base64,final-stroke", 3);
    });
    await act(async () => {
      frames[0]?.reject(new Error("frame failed (502): relay blip"));
    });

    expect(frames).toHaveLength(2);
    expect(frames[1]?.payload.image_url).toBe(
      "data:image/jpeg;base64,final-stroke",
    );
    expect(result.current.state.stats.lastError?.message).toContain(
      "frame failed (502)",
    );

    await act(async () => {
      frames[1]?.resolve(wireResult);
    });

    expect(result.current.state.liveOutput?.imageUrl).toBe(
      "data:image/jpeg;base64,render1",
    );
    expect(result.current.state.stats.lastError).toBeNull();
  });

  it("a persistent failure stops after exactly one retry and keeps the sticky error", async () => {
    const { frames, sendFrameFn } = fakeSendFrameFactory();
    const { result } = renderHook(() => useRealtimeSketch({ sendFrameFn }));

    act(() => {
      result.current.captureSnapshot("data:image/jpeg;base64,final-stroke", 3);
    });
    await act(async () => {
      frames[0]?.reject(
        new Error("frame failed (503): FAL_KEY not configured"),
      );
    });
    await act(async () => {
      frames[1]?.reject(
        new Error("frame failed (503): FAL_KEY not configured"),
      );
    });

    expect(frames).toHaveLength(2);
    expect(result.current.state.inFlight).toBeNull();
    expect(result.current.state.stats.lastError?.message).toContain(
      "frame failed (503)",
    );
  });
});
