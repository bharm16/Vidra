import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useRealtimeSketch } from "../useRealtimeSketch";
import type { SendSketchFrame, SketchFramePayload } from "../../api/falI2i";

/**
 * Regression from the 2026-10-22 launch testing: the Live editor sent one
 * frame and then never another. The send effect's cleanup aborted the frame
 * (and cleared its watchdog) when the effect re-ran for the same in-flight
 * frame, and the "already sent" guard then skipped it — so the frame never
 * settled and the loop stayed blocked behind it. A frame aborted by cleanup
 * before it settled must be sent again.
 */
describe("useRealtimeSketch — effect re-run while a frame is in flight", () => {
  it("re-sends the in-flight frame instead of stranding the loop", async () => {
    const frames: { payload: SketchFramePayload; signal: AbortSignal; resolve: (value: unknown) => void }[] = [];
    const makeSender = (): SendSketchFrame => (payload, signal) => new Promise(resolve => { frames.push({ payload, signal, resolve }); });
    const { result, rerender } = renderHook(({ sendFrameFn }) => useRealtimeSketch({ sendFrameFn }), { initialProps: { sendFrameFn: makeSender() } });

    act(() => result.current.captureSnapshot("data:image/jpeg;base64,stroke", 3));
    expect(frames).toHaveLength(1);

    // Any re-run of the send effect for the same frame (StrictMode, a new sender identity) aborts it.
    rerender({ sendFrameFn: makeSender() });
    expect(frames[0]?.signal.aborted).toBe(true);
    expect(frames).toHaveLength(2);
    expect(frames[1]?.payload.image_url).toBe("data:image/jpeg;base64,stroke");

    await act(async () => { frames[1]?.resolve({ images: [{ url: "data:image/webp;base64,render", width: 512, height: 512 }], seed: 42 }); });
    expect(result.current.state.inFlight).toBeNull();
    expect(result.current.state.liveOutput?.imageUrl).toBe("data:image/webp;base64,render");
  });
});
