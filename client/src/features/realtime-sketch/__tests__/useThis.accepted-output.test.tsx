import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { acceptLiveOutput } from "../api/acceptLiveOutput";
import { useAcceptLiveOutput } from "../hooks/useAcceptLiveOutput";
import { useRealtimeSketch } from "../hooks/useRealtimeSketch";
import { DEFAULT_STEPS, DEFAULT_STRENGTH } from "../config/constants";
import type { SendSketchFrame, SketchFramePayload } from "../api/falI2i";

/**
 * "Use this" accepts the picture the creator is LOOKING AT — ADR-0022
 * decision 5, issue #87.
 *
 * The risk this file exists for: the relay keeps answering and the creator
 * keeps typing, so the sketchpad and the settings at the moment of the press
 * describe a DIFFERENT image than the one on screen. Reading them at the press
 * would record a provenance that is confidently wrong. The inputs are captured
 * with the frame at dispatch and ride the shown output instead — this asserts
 * exactly that, under a newer result landing mid-acceptance.
 *
 * Seam: the feature's own `api/` module, which is the client's wire boundary.
 */

vi.mock("../api/acceptLiveOutput", () => ({
  acceptLiveOutput: vi.fn(),
}));

const acceptLiveOutputMock = vi.mocked(acceptLiveOutput);

interface CapturedFrame {
  payload: SketchFramePayload;
  resolve: (value: unknown) => void;
}

function fakeRelay(): {
  frames: CapturedFrame[];
  sendFrameFn: SendSketchFrame;
} {
  const frames: CapturedFrame[] = [];
  const sendFrameFn: SendSketchFrame = (payload) =>
    new Promise((resolve) => {
      frames.push({ payload, resolve });
    });
  return { frames, sendFrameFn };
}

const relayResult = (url: string, seed: number): unknown => ({
  images: [{ url, width: 512, height: 512 }],
  timings: { inference: 0.19 },
  seed,
});

const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
  <MemoryRouter>{children}</MemoryRouter>
);

function renderLiveEditorHooks(sendFrameFn: SendSketchFrame) {
  return renderHook(
    () => {
      const sketch = useRealtimeSketch({ sendFrameFn });
      const acceptance = useAcceptLiveOutput();
      return { sketch, acceptance };
    },
    { wrapper },
  );
}

describe("Use this (issue #87)", () => {
  beforeEach(() => {
    acceptLiveOutputMock.mockReset();
  });

  it("accepts the displayed picture with ITS inputs, even as a newer result lands and the prompt moves on", async () => {
    const { frames, sendFrameFn } = fakeRelay();
    let settleAcceptance: () => void = () => {};
    acceptLiveOutputMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          settleAcceptance = () =>
            resolve({
              sessionId: "session-new",
              promptVersionId: "v-root",
              generationId: "take-1",
              imageUrl: "https://storage.example.com/asset-1",
              createdSession: true,
            });
        }),
    );

    const { result } = renderLiveEditorHooks(sendFrameFn);

    // The creator draws under the prompt they are about to abandon.
    act(() => {
      result.current.sketch.updateSettings({
        prompt: "a brass desk lamp",
        seed: 11,
      });
    });
    act(() => {
      result.current.sketch.captureSnapshot(
        "data:image/jpeg;base64,drawing-1",
        3,
      );
    });
    expect(frames[0]?.payload.prompt).toBe("a brass desk lamp");

    // …and that frame comes back. THIS is the picture on screen.
    await act(async () => {
      frames[0]?.resolve(
        relayResult("data:image/webp;base64,output-1", 990011),
      );
    });
    const shown = result.current.sketch.state.liveOutput;
    expect(shown?.imageUrl).toBe("data:image/webp;base64,output-1");

    // The creator moves on: new words, new drawing, a frame in flight.
    act(() => {
      result.current.sketch.updateSettings({ prompt: "a chrome floor lamp" });
    });
    act(() => {
      result.current.sketch.captureSnapshot(
        "data:image/jpeg;base64,drawing-2",
        3,
      );
    });
    expect(frames).toHaveLength(2);

    // Press Use this on what is on screen.
    act(() => {
      result.current.acceptance.accept(shown!);
    });
    expect(result.current.acceptance.status.state).toBe("accepting");

    // …and while it is in flight, everything the naive reading would use
    // changes: a newer result lands and the prompt changes again.
    act(() => {
      result.current.sketch.updateSettings({
        prompt: "a paper lantern",
        seed: 77,
      });
    });
    await act(async () => {
      frames[1]?.resolve(
        relayResult("data:image/webp;base64,output-2", 220022),
      );
    });
    expect(result.current.sketch.state.liveOutput?.imageUrl).toBe(
      "data:image/webp;base64,output-2",
    );

    await act(async () => {
      settleAcceptance();
    });

    // The recorded acceptance is still the FIRST output, its own drawing, and
    // the words and settings that frame was dispatched with.
    expect(acceptLiveOutputMock).toHaveBeenCalledTimes(1);
    expect(acceptLiveOutputMock.mock.calls[0]?.[0]).toMatchObject({
      liveOutputDataUri: "data:image/webp;base64,output-1",
      sketchSnapshotDataUri: "data:image/jpeg;base64,drawing-1",
      inputs: {
        prompt: "a brass desk lamp",
        strength: DEFAULT_STRENGTH,
        steps: DEFAULT_STEPS,
        // The seed the relay REPORTS, not the one that was asked for: the
        // reproducible fact is the one the provider used.
        seed: 990011,
      },
    });
  });

  it("records the requested seed only when the relay reports none", async () => {
    const { frames, sendFrameFn } = fakeRelay();
    acceptLiveOutputMock.mockResolvedValue({
      sessionId: "session-new",
      promptVersionId: "v-root",
      generationId: "take-1",
      imageUrl: "https://storage.example.com/asset-1",
      createdSession: true,
    });

    const { result } = renderLiveEditorHooks(sendFrameFn);

    act(() => {
      result.current.sketch.updateSettings({ seed: 31337 });
    });
    act(() => {
      result.current.sketch.captureSnapshot(
        "data:image/jpeg;base64,drawing-1",
        3,
      );
    });
    await act(async () => {
      frames[0]?.resolve({
        images: [{ url: "data:image/webp;base64,output-1" }],
      });
    });

    act(() => {
      result.current.acceptance.accept(result.current.sketch.state.liveOutput!);
    });
    await waitFor(() => expect(acceptLiveOutputMock).toHaveBeenCalled());

    expect(acceptLiveOutputMock.mock.calls[0]?.[0].inputs.seed).toBe(31337);
  });

  it("sends one acceptance key for one picture, so a double press cannot make two", async () => {
    const { frames, sendFrameFn } = fakeRelay();
    acceptLiveOutputMock.mockResolvedValue({
      sessionId: "session-new",
      promptVersionId: "v-root",
      generationId: "take-1",
      imageUrl: "https://storage.example.com/asset-1",
      createdSession: true,
    });

    const { result } = renderLiveEditorHooks(sendFrameFn);

    act(() => {
      result.current.sketch.captureSnapshot(
        "data:image/jpeg;base64,drawing-1",
        3,
      );
    });
    await act(async () => {
      frames[0]?.resolve(
        relayResult("data:image/webp;base64,output-1", 990011),
      );
    });

    const shown = result.current.sketch.state.liveOutput!;
    await act(async () => {
      result.current.acceptance.accept(shown);
    });
    await act(async () => {
      result.current.acceptance.accept(shown);
    });

    const keys = acceptLiveOutputMock.mock.calls.map(
      (call) => call[0].idempotencyKey,
    );
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toEqual(expect.any(String));
  });

  it("surfaces a refusal as a message and keeps the creator on the live editor", async () => {
    const { frames, sendFrameFn } = fakeRelay();
    acceptLiveOutputMock.mockRejectedValue(
      new Error("Couldn’t use this picture — storage is unavailable."),
    );

    const { result } = renderLiveEditorHooks(sendFrameFn);

    act(() => {
      result.current.sketch.captureSnapshot(
        "data:image/jpeg;base64,drawing-1",
        3,
      );
    });
    await act(async () => {
      frames[0]?.resolve(
        relayResult("data:image/webp;base64,output-1", 990011),
      );
    });

    await act(async () => {
      result.current.acceptance.accept(result.current.sketch.state.liveOutput!);
    });

    expect(result.current.acceptance.status).toEqual({
      state: "failed",
      message: "Couldn’t use this picture — storage is unavailable.",
    });
    // The live editor keeps running: the loop is untouched by a failed accept.
    expect(result.current.sketch.state.liveOutput?.imageUrl).toBe(
      "data:image/webp;base64,output-1",
    );
  });
});
