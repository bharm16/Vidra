import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/services/http/ApiError";
import { clearVideoInputSupportCache } from "../../utils/videoInputSupport";
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

vi.mock("../../api", () => ({
  compileWanPrompt: (...args: unknown[]) => compileWanPromptMock(...args),
  generateVideoPreview: (...args: unknown[]) =>
    generateVideoPreviewMock(...args),
  generateStoryboardPreview: (...args: unknown[]) =>
    generateStoryboardPreviewMock(...args),
  waitForVideoJob: (...args: unknown[]) => waitForVideoJobMock(...args),
}));

describe("regression: pre-accept generation failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearVideoInputSupportCache();
    compileWanPromptMock.mockResolvedValue("compiled prompt");
    getCapabilitiesMock.mockResolvedValue({
      provider: "generic",
      model: "wan-2.2",
      version: "1",
      fields: {},
    });
  });

  it("does not create a generation entry when a draft request is rejected for insufficient credits before acceptance", async () => {
    const dispatch = vi.fn();
    const onInsufficientCredits = vi.fn();
    generateVideoPreviewMock.mockRejectedValue(
      new ApiError("Insufficient credits", 402, {
        code: "INSUFFICIENT_CREDITS",
      }),
    );

    const { result } = renderHook(() =>
      useGenerationActions(dispatch, { onInsufficientCredits }),
    );

    await act(async () => {
      await result.current.generateDraft("wan-2.2", "A cinematic fox", {});
    });

    // ISSUE-12 follow-up: ADD_GENERATION retired; state growth now flows
    // through SET_GENERATIONS. A 402 rejection must not grow the set.
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_GENERATIONS" }),
    );
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "UPDATE_GENERATION" }),
    );
    expect(onInsufficientCredits).toHaveBeenCalledWith(28, "Wan 2.2 preview");
    expect(result.current.isSubmitting).toBe(false);
  });

  it("suppresses duplicate submit attempts while the request is still being accepted", async () => {
    const dispatch = vi.fn();
    let resolveRequest:
      | ((value: { success: boolean; videoUrl: string }) => void)
      | null = null;
    generateVideoPreviewMock.mockImplementation(
      () =>
        new Promise<{ success: boolean; videoUrl: string }>((resolve) => {
          resolveRequest = resolve;
        }),
    );

    const { result } = renderHook(() => useGenerationActions(dispatch));

    await act(async () => {
      void result.current.generateDraft("wan-2.2", "A cinematic fox", {});
      void result.current.generateDraft("wan-2.2", "A cinematic fox", {});
    });

    expect(generateVideoPreviewMock).toHaveBeenCalledTimes(1);
    expect(result.current.isSubmitting).toBe(true);
    // In-flight: nothing has been accepted yet, so no state growth.
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_GENERATIONS" }),
    );

    await act(async () => {
      resolveRequest?.({
        success: true,
        videoUrl: "https://example.com/output.mp4",
      });
    });

    await waitFor(() => {
      expect(result.current.isSubmitting).toBe(false);
    });
    // On success the reducer grows via SET_GENERATIONS (state-replace from
    // [...current, newGen]).
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_GENERATIONS" }),
    );
  });
});
