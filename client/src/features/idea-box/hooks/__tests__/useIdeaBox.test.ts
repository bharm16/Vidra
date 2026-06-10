import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

const { generatePreviewMock } = vi.hoisted(() => ({
  generatePreviewMock: vi.fn(),
}));

vi.mock("@/features/preview/api/previewApi", () => ({
  generatePreview: generatePreviewMock,
}));

import { useIdeaBox } from "../useIdeaBox";

const successResponse = {
  success: true,
  data: {
    imageUrl: "https://img.example/frame.webp",
    viewUrl: "https://signed.example/frame.webp",
    storagePath: "previews/frame.webp",
    viewUrlExpiresAt: "2099-01-01T00:00:00.000Z",
    metadata: {},
  },
};

describe("useIdeaBox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("chains optimization into a generated start frame and reaches ready", async () => {
    generatePreviewMock.mockResolvedValue(successResponse);
    const setStartFrame = vi.fn();

    const { result } = renderHook(() =>
      useIdeaBox({ startImageUrl: null, setStartFrame }),
    );
    expect(result.current.stage).toEqual({ kind: "idle" });

    await act(async () => {
      await result.current.continueAfterOptimization("a cozy coffee shop ad");
    });

    expect(generatePreviewMock).toHaveBeenCalledWith("a cozy coffee shop ad", {
      aspectRatio: "16:9",
    });
    expect(setStartFrame).toHaveBeenCalledTimes(1);
    const tile = setStartFrame.mock.calls[0]?.[0];
    expect(tile).toMatchObject({
      url: "https://signed.example/frame.webp",
      source: "generation",
      sourcePrompt: "a cozy coffee shop ad",
      storagePath: "previews/frame.webp",
      viewUrlExpiresAt: "2099-01-01T00:00:00.000Z",
    });
    expect(result.current.stage).toEqual({ kind: "ready" });
  });

  it("does nothing when a start frame already exists", async () => {
    const setStartFrame = vi.fn();
    const { result } = renderHook(() =>
      useIdeaBox({
        startImageUrl: "https://existing.example/frame.webp",
        setStartFrame,
      }),
    );

    await act(async () => {
      await result.current.continueAfterOptimization("anything");
    });

    expect(generatePreviewMock).not.toHaveBeenCalled();
    expect(setStartFrame).not.toHaveBeenCalled();
    expect(result.current.stage).toEqual({ kind: "idle" });
  });

  it("does nothing for an empty optimized prompt", async () => {
    const setStartFrame = vi.fn();
    const { result } = renderHook(() =>
      useIdeaBox({ startImageUrl: null, setStartFrame }),
    );

    await act(async () => {
      await result.current.continueAfterOptimization("   ");
    });

    expect(generatePreviewMock).not.toHaveBeenCalled();
    expect(result.current.stage).toEqual({ kind: "idle" });
  });

  it("falls back to imageUrl when no signed viewUrl is returned", async () => {
    generatePreviewMock.mockResolvedValue({
      success: true,
      data: { imageUrl: "https://img.example/raw.webp", metadata: {} },
    });
    const setStartFrame = vi.fn();
    const { result } = renderHook(() =>
      useIdeaBox({ startImageUrl: null, setStartFrame }),
    );

    await act(async () => {
      await result.current.continueAfterOptimization("dog at the park");
    });

    expect(setStartFrame.mock.calls[0]?.[0]).toMatchObject({
      url: "https://img.example/raw.webp",
    });
    expect(result.current.stage).toEqual({ kind: "ready" });
  });

  it("reports failure without setting a frame when generation fails", async () => {
    generatePreviewMock.mockRejectedValue(new Error("Flux down"));
    const setStartFrame = vi.fn();
    const { result } = renderHook(() =>
      useIdeaBox({ startImageUrl: null, setStartFrame }),
    );

    await act(async () => {
      await result.current.continueAfterOptimization("dog at the park");
    });

    expect(setStartFrame).not.toHaveBeenCalled();
    expect(result.current.stage).toEqual({
      kind: "failed",
      message: "Flux down",
    });
  });

  it("regenerateFrame replaces the frame even when a start frame exists", async () => {
    generatePreviewMock.mockResolvedValue(successResponse);
    const setStartFrame = vi.fn();
    const { result } = renderHook(() =>
      useIdeaBox({
        startImageUrl: "https://existing.example/wrong-frame.webp",
        setStartFrame,
      }),
    );

    await act(async () => {
      await result.current.regenerateFrame("dog at the park, golden hour");
    });

    expect(generatePreviewMock).toHaveBeenCalledWith(
      "dog at the park, golden hour",
      { aspectRatio: "16:9" },
    );
    expect(setStartFrame).toHaveBeenCalledTimes(1);
    expect(setStartFrame.mock.calls[0]?.[0]).toMatchObject({
      url: "https://signed.example/frame.webp",
      source: "generation",
      sourcePrompt: "dog at the park, golden hour",
    });
    expect(result.current.stage).toEqual({ kind: "ready" });
  });

  it("acceptFrame dismisses the gate back to idle", async () => {
    generatePreviewMock.mockResolvedValue(successResponse);
    const setStartFrame = vi.fn();
    const { result } = renderHook(() =>
      useIdeaBox({ startImageUrl: null, setStartFrame }),
    );

    await act(async () => {
      await result.current.continueAfterOptimization("dog at the park");
    });
    expect(result.current.stage).toEqual({ kind: "ready" });

    act(() => {
      result.current.acceptFrame();
    });
    expect(result.current.stage).toEqual({ kind: "idle" });
  });

  it("treats an unsuccessful response as failure", async () => {
    generatePreviewMock.mockResolvedValue({
      success: false,
      error: "quota exceeded",
    });
    const setStartFrame = vi.fn();
    const { result } = renderHook(() =>
      useIdeaBox({ startImageUrl: null, setStartFrame }),
    );

    await act(async () => {
      await result.current.continueAfterOptimization("dog at the park");
    });

    expect(setStartFrame).not.toHaveBeenCalled();
    expect(result.current.stage).toEqual({
      kind: "failed",
      message: "quota exceeded",
    });
  });
});
