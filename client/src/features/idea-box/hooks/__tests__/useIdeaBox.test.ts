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

  it("sends sessionId + promptVersionId from the persistence-target resolver (M5 D4)", async () => {
    generatePreviewMock.mockResolvedValue(successResponse);
    const setStartFrame = vi.fn();
    const resolvePersistenceTarget = vi.fn(() => ({
      sessionId: "sess-remote-abc",
      promptVersionId: "v-123-abc",
    }));

    const { result } = renderHook(() =>
      useIdeaBox({
        startImageUrl: null,
        setStartFrame,
        resolvePersistenceTarget,
      }),
    );

    await act(async () => {
      await result.current.continueAfterOptimization("a cozy coffee shop ad");
    });

    // The resolver mints/reads the words-version at frame time, and its ids
    // ride the generatePreview POST so the server persists the picture as a
    // generation record on that version node.
    expect(resolvePersistenceTarget).toHaveBeenCalledTimes(1);
    expect(generatePreviewMock).toHaveBeenCalledWith("a cozy coffee shop ad", {
      aspectRatio: "16:9",
      sessionId: "sess-remote-abc",
      promptVersionId: "v-123-abc",
    });
  });

  it("omits blank persistence ids instead of sending empty keys (M5 D4)", async () => {
    generatePreviewMock.mockResolvedValue(successResponse);
    const setStartFrame = vi.fn();
    // Golden-path early state: a version was minted, but the session is still a
    // local draft, so isRemoteSessionId gates sessionId to blank. The empty
    // field must not appear in the payload — the server's opt-in persistence
    // keys off the presence of both, and a stray "" would break its contract.
    const resolvePersistenceTarget = vi.fn(() => ({
      sessionId: "",
      promptVersionId: "v-456-def",
    }));

    const { result } = renderHook(() =>
      useIdeaBox({
        startImageUrl: null,
        setStartFrame,
        resolvePersistenceTarget,
      }),
    );

    await act(async () => {
      await result.current.continueAfterOptimization("a quiet forest at dawn");
    });

    expect(generatePreviewMock).toHaveBeenCalledWith("a quiet forest at dawn", {
      aspectRatio: "16:9",
      promptVersionId: "v-456-def",
    });
  });

  it("captures the persisted generationId onto the start frame (M5 2b)", async () => {
    generatePreviewMock.mockResolvedValue({
      success: true,
      data: {
        imageUrl: "https://img.example/frame.webp",
        viewUrl: "https://signed.example/frame.webp",
        generationId: "pic-gen-77",
        metadata: {},
      },
    });
    const setStartFrame = vi.fn();
    const { result } = renderHook(() =>
      useIdeaBox({ startImageUrl: null, setStartFrame }),
    );

    await act(async () => {
      await result.current.continueAfterOptimization("a lighthouse at dusk");
    });

    // The tile carries the picture's generation id so a later animate can name
    // it as the clip's source (ancestorGenerationId) in the space.
    expect(setStartFrame.mock.calls[0]?.[0]).toMatchObject({
      generationId: "pic-gen-77",
    });
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
      consecutiveFailures: 1,
    });
  });

  it("increments consecutiveFailures across repeated failed retries", async () => {
    generatePreviewMock.mockRejectedValue(new Error("storage down"));
    const setStartFrame = vi.fn();
    const { result } = renderHook(() =>
      useIdeaBox({ startImageUrl: null, setStartFrame }),
    );

    await act(async () => {
      await result.current.continueAfterOptimization("dog at the park");
    });
    expect(result.current.stage).toEqual({
      kind: "failed",
      message: "storage down",
      consecutiveFailures: 1,
    });

    await act(async () => {
      await result.current.regenerateFrame("dog at the park");
    });
    expect(result.current.stage).toEqual({
      kind: "failed",
      message: "storage down",
      consecutiveFailures: 2,
    });

    await act(async () => {
      await result.current.regenerateFrame("dog at the park");
    });
    expect(result.current.stage).toEqual({
      kind: "failed",
      message: "storage down",
      consecutiveFailures: 3,
    });
  });

  it("resets the failure count after a successful frame", async () => {
    generatePreviewMock.mockRejectedValueOnce(new Error("storage down"));
    generatePreviewMock.mockRejectedValueOnce(new Error("storage down"));
    generatePreviewMock.mockResolvedValueOnce(successResponse);
    generatePreviewMock.mockRejectedValueOnce(new Error("storage down"));
    const setStartFrame = vi.fn();
    const { result } = renderHook(() =>
      useIdeaBox({ startImageUrl: null, setStartFrame }),
    );

    await act(async () => {
      await result.current.regenerateFrame("dog at the park");
    });
    await act(async () => {
      await result.current.regenerateFrame("dog at the park");
    });
    expect(result.current.stage).toEqual({
      kind: "failed",
      message: "storage down",
      consecutiveFailures: 2,
    });

    await act(async () => {
      await result.current.regenerateFrame("dog at the park");
    });
    expect(result.current.stage).toEqual({ kind: "ready" });

    // The next failure starts a fresh streak — not a continuation of the old one.
    await act(async () => {
      await result.current.regenerateFrame("dog at the park");
    });
    expect(result.current.stage).toEqual({
      kind: "failed",
      message: "storage down",
      consecutiveFailures: 1,
    });
  });

  it("resets the failure count when the stage is reset via acceptFrame", async () => {
    generatePreviewMock.mockRejectedValueOnce(new Error("storage down"));
    const setStartFrame = vi.fn();
    const { result } = renderHook(() =>
      useIdeaBox({ startImageUrl: null, setStartFrame }),
    );

    await act(async () => {
      await result.current.regenerateFrame("dog at the park");
    });
    expect(result.current.stage).toEqual({
      kind: "failed",
      message: "storage down",
      consecutiveFailures: 1,
    });

    act(() => {
      result.current.acceptFrame();
    });
    expect(result.current.stage).toEqual({ kind: "idle" });

    generatePreviewMock.mockRejectedValueOnce(new Error("storage down"));
    await act(async () => {
      await result.current.regenerateFrame("dog at the park");
    });
    expect(result.current.stage).toEqual({
      kind: "failed",
      message: "storage down",
      consecutiveFailures: 1,
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
      consecutiveFailures: 1,
    });
  });
});
