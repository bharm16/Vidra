import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SketchFrameRefused, type SendSketchFrame } from "@/features/realtime-sketch/api/falI2i";
import { useProjectSketchPreview } from "../hooks/useProjectSketchPreview";

const drawing = "data:image/png;base64,YQ==";
const output = "data:image/png;base64,Yg==";
function deferred(): { promise: Promise<unknown>; resolve(value: unknown): void; reject(error: unknown): void } { let resolve!: (value: unknown) => void; let reject!: (error: unknown) => void; const promise = new Promise<unknown>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

describe("project Sketch preview control", () => {
  it("never dispatches on entering/restoring, aborts on Pause, and ignores a late result", async () => {
    const pending = deferred();
    const send: SendSketchFrame = vi.fn(async () => pending.promise);
    const { result } = renderHook(() => useProjectSketchPreview(send));
    act(() => { result.current.snapshot(drawing, 1); result.current.updateSettings({ prompt: "Original drawing" }); });
    expect(send).not.toHaveBeenCalled();
    act(() => result.current.start());
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(send).mock.calls[0]?.[1];
    act(() => result.current.pause()); expect(signal?.aborted).toBe(true);
    await act(async () => { pending.resolve({ images: [{ url: output }] }); await pending.promise; });
    expect(result.current.state.liveOutput).toBeNull(); expect(result.current.status).toBe("off");
  });
  it("preserves the displayed output and its producing settings after a failed newer frame; Retry is explicit", async () => {
    const send: SendSketchFrame = vi.fn(async () => ({ images: [{ url: output }], seed: 13 }));
    const { result } = renderHook(() => useProjectSketchPreview(send));
    act(() => { result.current.snapshot(drawing, 1); result.current.start(); });
    await waitFor(() => expect(result.current.status).toBe("live"));
    const first = result.current.state.liveOutput;
    expect(first?.inputs.seed).toBe(13); expect(first?.sketchDataUri).toBe(drawing);
    vi.mocked(send).mockRejectedValueOnce(new Error("connection lost"));
    act(() => result.current.updateSettings({ prompt: "Different newer direction" }));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.state.liveOutput).toEqual(first); expect(send).toHaveBeenCalledTimes(2);
    act(() => result.current.snapshot("data:image/png;base64,Yw==", 1));
    expect(send).toHaveBeenCalledTimes(2);
    act(() => result.current.start()); await waitFor(() => expect(result.current.status).toBe("live"));
    expect(result.current.state.liveOutput?.inputs.prompt).toBe("Different newer direction");
  });
  it("keeps the last frame available at the allowance cap and refuses dispatch before the server reset", async () => {
    const send: SendSketchFrame = vi.fn(async () => ({ images: [{ url: output }] }));
    const { result } = renderHook(() => useProjectSketchPreview(send));
    act(() => { result.current.snapshot(drawing, 1); result.current.start(); });
    await waitFor(() => expect(result.current.status).toBe("live"));
    const first = result.current.state.liveOutput;
    vi.mocked(send).mockRejectedValueOnce(new SketchFrameRefused({ reason: "daily-allowance-reached", detail: "Allowance reached", resetAtMs: Date.now() + 60_000 }));
    act(() => result.current.snapshot(drawing, 1)); await waitFor(() => expect(result.current.status).toBe("limit"));
    act(() => { result.current.snapshot(drawing, 1); result.current.start(); });
    expect(send).toHaveBeenCalledTimes(2); expect(result.current.state.liveOutput).toEqual(first);
  });
});
