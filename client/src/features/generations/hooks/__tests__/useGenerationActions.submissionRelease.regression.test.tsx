/**
 * Every exit path of a generate* call must release the submission: deregister
 * its abort controller and hand back the pending flag.
 *
 * These pass against the pre-`registerSubmission` code too — each of the ~8
 * exits per callback did carry the bookkeeping itself, correctly. They exist
 * because that was the fragile part: a new early return had to remember both
 * halves, and forgetting them leaves the submit button spinning and the
 * controller registered (which is what cancel and prompt-version aborts look a
 * take up by). `release()` in a `finally` is now the single owner, and these
 * cases keep it honest.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { clearVideoInputSupportCache } from "@features/generations/utils/videoInputSupport";
import { useGenerationActions } from "../useGenerationActions";

const compileWanPromptMock = vi.fn();
const generateVideoPreviewMock = vi.fn();
const generateStoryboardPreviewMock = vi.fn();
const waitForVideoJobMock = vi.fn();
const getCapabilitiesMock = vi.fn();

vi.mock("@/services", () => ({
  capabilitiesApi: {
    getCapabilities: (...args: unknown[]) => getCapabilitiesMock(...args),
  },
}));

vi.mock("@/hooks/useUserCreditBalance", () => ({
  publishCreditBalanceSync: vi.fn(),
  requestCreditBalanceRefresh: vi.fn(),
}));

vi.mock("@features/generations/api", () => ({
  compileWanPrompt: (...args: unknown[]) => compileWanPromptMock(...args),
  generateVideoPreview: (...args: unknown[]) =>
    generateVideoPreviewMock(...args),
  generateStoryboardPreview: (...args: unknown[]) =>
    generateStoryboardPreviewMock(...args),
  waitForVideoJob: (...args: unknown[]) => waitForVideoJobMock(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  clearVideoInputSupportCache();
  getCapabilitiesMock.mockResolvedValue({
    provider: "generic",
    model: "wan-2.2",
    version: "1",
    fields: {},
  });
  compileWanPromptMock.mockResolvedValue("compiled prompt");
});

describe("regression: a submission is released on every exit path", () => {
  it("releases the pending flag when the draft request rejects", async () => {
    const dispatch = vi.fn();
    generateVideoPreviewMock.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useGenerationActions(dispatch));
    await act(async () => {
      await result.current.generateDraft("wan-2.2", "a prompt", {});
    });

    expect(result.current.isSubmitting).toBe(false);
  });

  it("releases the pending flag when the draft response reports failure", async () => {
    const dispatch = vi.fn();
    generateVideoPreviewMock.mockResolvedValue({
      success: false,
      error: "provider rejected the prompt",
    });

    const { result } = renderHook(() => useGenerationActions(dispatch));
    await act(async () => {
      await result.current.generateDraft("wan-2.2", "a prompt", {});
    });

    expect(result.current.isSubmitting).toBe(false);
  });

  it("releases the pending flag when the render request rejects", async () => {
    const dispatch = vi.fn();
    generateVideoPreviewMock.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useGenerationActions(dispatch));
    await act(async () => {
      await result.current.generateRender("sora-2", "a prompt", {});
    });

    expect(result.current.isSubmitting).toBe(false);
  });

  it("releases the pending flag when the storyboard request rejects", async () => {
    const dispatch = vi.fn();
    generateStoryboardPreviewMock.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useGenerationActions(dispatch));
    await act(async () => {
      await result.current.generateStoryboard("a prompt", {
        seedImageUrl: "https://example.com/seed.png",
      });
    });

    expect(result.current.isSubmitting).toBe(false);
  });

  /**
   * The pending flag is handed off the moment a take is accepted, because from
   * then on the take's own status drives the UI. Between acceptance and that
   * handoff the storyboard path calls back into the caller
   * (`onServerGenerationPersisted`) — and a throw there landed in the catch with
   * the take already accepted, where the conditional clear is a no-op. The flag
   * stuck true, and `isGenerationBusy` keeps the generate and preview buttons
   * disabled for the rest of the session.
   */
  it("releases the pending flag when a post-acceptance callback throws", async () => {
    const dispatch = vi.fn();
    generateStoryboardPreviewMock.mockResolvedValue({
      success: true,
      data: {
        imageUrls: ["https://example.com/frame-1.png"],
        generationId: "server-generation-1",
        baseImageUrl: "https://example.com/base.png",
      },
    });

    const { result } = renderHook(() =>
      useGenerationActions(dispatch, {
        sessionId: "session-1",
        onServerGenerationPersisted: () => {
          throw new Error("session refetch blew up");
        },
      }),
    );

    await act(async () => {
      await result.current.generateStoryboard("a prompt", {
        seedImageUrl: "https://example.com/seed.png",
      });
    });

    expect(result.current.isSubmitting).toBe(false);
  });

  // The guard that blocks a concurrent submission reads the same flag, so a
  // release that never happened also permanently wedges the next submission.
  it("lets a second submission start after the first one failed", async () => {
    const dispatch = vi.fn();
    generateVideoPreviewMock.mockRejectedValueOnce(new Error("network down"));
    generateVideoPreviewMock.mockResolvedValue({
      success: true,
      jobId: "job-2",
      status: "queued",
    });
    waitForVideoJobMock.mockResolvedValue({
      videoUrl: "https://example.com/output.mp4",
    });

    const { result } = renderHook(() => useGenerationActions(dispatch));
    await act(async () => {
      await result.current.generateDraft("wan-2.2", "first", {});
    });
    await act(async () => {
      await result.current.generateDraft("wan-2.2", "second", {});
    });

    expect(generateVideoPreviewMock).toHaveBeenCalledTimes(2);
  });
});
