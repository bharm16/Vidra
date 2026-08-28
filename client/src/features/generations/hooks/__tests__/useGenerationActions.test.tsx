import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { ApiError } from "@/services/http/ApiError";
import { clearVideoInputSupportCache } from "../../utils/videoInputSupport";
import { useGenerationActions } from "../useGenerationActions";

const compileWanPromptMock = vi.fn();
const generateVideoPreviewMock = vi.fn();
const generateStoryboardPreviewMock = vi.fn();
const waitForVideoJobMock = vi.fn();
const getCapabilitiesMock = vi.fn();
const publishCreditBalanceSyncMock = vi.hoisted(() => vi.fn());
const requestCreditBalanceRefreshMock = vi.hoisted(() => vi.fn());

vi.mock("@/services", () => ({
  capabilitiesApi: {
    getCapabilities: (...args: unknown[]) => getCapabilitiesMock(...args),
  },
}));

vi.mock("@/hooks/useUserCreditBalance", () => ({
  publishCreditBalanceSync: (...args: unknown[]) =>
    publishCreditBalanceSyncMock(...args),
  requestCreditBalanceRefresh: (...args: unknown[]) =>
    requestCreditBalanceRefreshMock(...args),
}));

vi.mock("../../api", () => ({
  compileWanPrompt: (...args: unknown[]) => compileWanPromptMock(...args),
  generateVideoPreview: (...args: unknown[]) =>
    generateVideoPreviewMock(...args),
  generateStoryboardPreview: (...args: unknown[]) =>
    generateStoryboardPreviewMock(...args),
  waitForVideoJob: (...args: unknown[]) => waitForVideoJobMock(...args),
}));

const getAction = (dispatch: ReturnType<typeof vi.fn>, type: string) =>
  dispatch.mock.calls
    .map((call) => call[0] as { type: string })
    .find((action) => action.type === type);

const getActions = (dispatch: ReturnType<typeof vi.fn>, type: string) =>
  dispatch.mock.calls
    .map((call) => call[0] as { type: string; payload?: unknown })
    .filter((action) => action.type === type);

beforeEach(() => {
  clearVideoInputSupportCache();
  getCapabilitiesMock.mockResolvedValue({
    provider: "generic",
    model: "wan-2.2",
    version: "1",
    fields: {},
  });
});

describe("useGenerationActions insufficient credits handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    compileWanPromptMock.mockResolvedValue("compiled prompt");
    getCapabilitiesMock.mockResolvedValue({
      provider: "generic",
      model: "wan-2.2",
      version: "1",
      fields: {},
    });
  });

  it("does not create a draft generation before a 402 rejection and reports insufficient credits", async () => {
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
      await result.current.generateDraft("wan-2.2", "A test prompt", {});
    });

    // ISSUE-12 follow-up: ADD_GENERATION retired; state growth flows through
    // SET_GENERATIONS. A 402 rejection must not grow the set.
    expect(getAction(dispatch, "SET_GENERATIONS")).toBeUndefined();
    expect(getAction(dispatch, "UPDATE_GENERATION")).toBeUndefined();
    expect(onInsufficientCredits).toHaveBeenCalledWith(28, "Wan 2.2 preview");
  });

  it("does not create a storyboard generation before a 402 rejection and reports insufficient credits", async () => {
    const dispatch = vi.fn();
    const onInsufficientCredits = vi.fn();
    generateStoryboardPreviewMock.mockRejectedValue(
      new ApiError("Insufficient credits", 402, {
        code: "INSUFFICIENT_CREDITS",
      }),
    );

    const { result } = renderHook(() =>
      useGenerationActions(dispatch, { onInsufficientCredits }),
    );

    await act(async () => {
      await result.current.generateStoryboard("Storyboard prompt", {});
    });

    expect(getAction(dispatch, "SET_GENERATIONS")).toBeUndefined();
    expect(getAction(dispatch, "UPDATE_GENERATION")).toBeUndefined();
    expect(onInsufficientCredits).toHaveBeenCalledWith(4, "Storyboard");
  });

  it("does not create a render generation before a 402 rejection and reports insufficient credits", async () => {
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
      await result.current.generateRender("sora-2", "Render prompt", {});
    });

    expect(getAction(dispatch, "SET_GENERATIONS")).toBeUndefined();
    expect(getAction(dispatch, "UPDATE_GENERATION")).toBeUndefined();
    expect(onInsufficientCredits).toHaveBeenCalledWith(48, "Sora 2 render");
  });

  it("surfaces non-402 failures as a failed generation via SET_GENERATIONS and does not treat them as insufficient credits", async () => {
    const dispatch = vi.fn();
    const onInsufficientCredits = vi.fn();
    generateVideoPreviewMock.mockRejectedValue(new Error("Network down"));

    const { result } = renderHook(() =>
      useGenerationActions(dispatch, { onInsufficientCredits }),
    );

    await act(async () => {
      await result.current.generateRender("sora-2", "Render prompt", {});
    });

    // Generic failures surface as a failed generation via SET_GENERATIONS
    // (state-replace with the failed record appended) so the user sees the
    // error rather than silence. The 402-only branch remains reserved for
    // insufficient-credits handling.
    const setAction = getAction(dispatch, "SET_GENERATIONS") as
      | { payload: Array<{ status: string; error: string }> }
      | undefined;
    const failed = setAction?.payload?.[setAction.payload.length - 1];
    expect(failed?.status).toBe("failed");
    expect(failed?.error).toBe("Network down");
    expect(onInsufficientCredits).not.toHaveBeenCalled();
    expect(result.current.isSubmitting).toBe(false);
  });

  it("publishes the remaining balance immediately after a queued draft response reserves credits", async () => {
    const dispatch = vi.fn();
    generateVideoPreviewMock.mockResolvedValue({
      success: true,
      jobId: "job-1",
      status: "queued",
      remainingCredits: 1,
    });
    waitForVideoJobMock.mockResolvedValue({
      videoUrl: "https://example.com/output.mp4",
    });

    const { result } = renderHook(() => useGenerationActions(dispatch));

    await act(async () => {
      await result.current.generateDraft("wan-2.2", "A queued prompt", {});
    });

    expect(publishCreditBalanceSyncMock).toHaveBeenCalledWith(1);
  });

  it("requests a balance refresh when the queued response omits remaining credits", async () => {
    const dispatch = vi.fn();
    generateVideoPreviewMock.mockResolvedValue({
      success: true,
      jobId: "job-1",
      status: "queued",
      creditsDeducted: 24,
    });
    waitForVideoJobMock.mockResolvedValue({
      videoUrl: "https://example.com/output.mp4",
    });

    const { result } = renderHook(() => useGenerationActions(dispatch));

    await act(async () => {
      await result.current.generateRender(
        "sora-2",
        "A queued render prompt",
        {},
      );
    });

    expect(requestCreditBalanceRefreshMock).toHaveBeenCalledTimes(1);
    expect(publishCreditBalanceSyncMock).not.toHaveBeenCalled();
  });
});

describe("useGenerationActions cancellation behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCapabilitiesMock.mockResolvedValue({
      provider: "generic",
      model: "wan-2.2",
      version: "1",
      fields: {},
    });
  });

  it("marks an accepted queued draft generation as cancelled", async () => {
    const dispatch = vi.fn();

    compileWanPromptMock.mockResolvedValue("compiled prompt");
    generateVideoPreviewMock.mockResolvedValue({
      success: true,
      jobId: "job-1",
      status: "queued",
    });
    waitForVideoJobMock.mockImplementation(
      (_jobId: string, signal: AbortSignal) =>
        new Promise<null>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    const { result } = renderHook(() => useGenerationActions(dispatch));

    let draftPromise: Promise<void> | undefined;
    act(() => {
      draftPromise = result.current.generateDraft(
        "wan-2.2",
        "A cinematic test prompt",
        {},
      );
    });

    await waitFor(() => {
      expect(getAction(dispatch, "SET_GENERATIONS")).toBeDefined();
    });
    // ISSUE-12 follow-up: SET_GENERATIONS payload is the whole array; the
    // just-added generation is the last element.
    const setAction = getAction(dispatch, "SET_GENERATIONS") as
      | { payload: Array<{ id: string }> }
      | undefined;

    const generationId = setAction?.payload?.[setAction.payload.length - 1]?.id;
    if (!generationId) {
      throw new Error("Expected generation id to be present");
    }

    await act(async () => {
      result.current.cancelGeneration(generationId);
      await draftPromise;
    });

    const updateActions = getActions(dispatch, "UPDATE_GENERATION") as Array<{
      payload?: { id?: string; updates?: { status?: string; error?: string } };
    }>;

    expect(
      updateActions.some(
        (action) =>
          action.payload?.id === generationId &&
          action.payload?.updates?.status === "failed" &&
          action.payload?.updates?.error === "Cancelled",
      ),
    ).toBe(true);
    expect(compileWanPromptMock).toHaveBeenCalled();
    expect(generateVideoPreviewMock).toHaveBeenCalledTimes(1);
  });
});

describe("useGenerationActions dispatch-model capability filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    compileWanPromptMock.mockResolvedValue("compiled prompt");
    generateVideoPreviewMock.mockResolvedValue({
      success: true,
      videoUrl: "https://example.com/output.mp4",
    });
  });

  it("drops end/reference/extend fields when dispatch model does not support them", async () => {
    getCapabilitiesMock.mockResolvedValue({
      provider: "generic",
      model: "wan-2.2",
      version: "1",
      fields: {},
    });

    const dispatch = vi.fn();
    const { result } = renderHook(() => useGenerationActions(dispatch));

    await act(async () => {
      await result.current.generateDraft("wan-2.2", "A test prompt", {
        endImage: { url: "https://example.com/end.png" },
        referenceImages: [
          { url: "https://example.com/ref.png", type: "asset" },
        ],
        extendVideoUrl: "https://example.com/source.mp4",
      });
    });

    const requestOptions = generateVideoPreviewMock.mock.calls[0]?.[3] as
      | Record<string, unknown>
      | undefined;

    expect(requestOptions).toBeDefined();
    expect(requestOptions).not.toHaveProperty("endImage");
    expect(requestOptions).not.toHaveProperty("referenceImages");
    expect(requestOptions).not.toHaveProperty("extendVideoUrl");
    expect(getCapabilitiesMock).toHaveBeenCalledWith("generic", "wan-2.2");
  });

  it("includes end/reference/extend fields when dispatch model supports them", async () => {
    getCapabilitiesMock.mockResolvedValue({
      provider: "generic",
      model: "google/veo-3",
      version: "1",
      fields: {
        last_frame: { type: "bool", default: true },
        reference_images: { type: "bool", default: true },
        extend_video: { type: "bool", default: true },
      },
    });

    const dispatch = vi.fn();
    const { result } = renderHook(() => useGenerationActions(dispatch));

    await act(async () => {
      await result.current.generateRender("google/veo-3", "Render prompt", {
        endImage: { url: "https://example.com/end.png" },
        referenceImages: [
          { url: "https://example.com/ref-1.png", type: "asset" },
          { url: "https://example.com/ref-2.png", type: "style" },
        ],
        extendVideoUrl: "https://example.com/source.mp4",
      });
    });

    const requestOptions = generateVideoPreviewMock.mock.calls[0]?.[3] as
      | {
          endImage?: string;
          referenceImages?: Array<{ url: string; type: "asset" | "style" }>;
          extendVideoUrl?: string;
        }
      | undefined;

    expect(requestOptions?.endImage).toBe("https://example.com/end.png");
    expect(requestOptions?.referenceImages).toEqual([
      { url: "https://example.com/ref-1.png", type: "asset" },
      { url: "https://example.com/ref-2.png", type: "style" },
    ]);
    expect(requestOptions?.extendVideoUrl).toBe(
      "https://example.com/source.mp4",
    );
    expect(getCapabilitiesMock).toHaveBeenCalledWith("generic", "google/veo-3");
  });

  it("caches capability lookups per dispatch model", async () => {
    getCapabilitiesMock.mockResolvedValue({
      provider: "generic",
      model: "wan-2.2",
      version: "1",
      fields: {},
    });

    const dispatch = vi.fn();
    const { result } = renderHook(() => useGenerationActions(dispatch));

    await act(async () => {
      await result.current.generateDraft("wan-2.2", "Prompt one", {});
      await result.current.generateDraft("wan-2.2", "Prompt two", {});
    });

    expect(getCapabilitiesMock).toHaveBeenCalledTimes(1);
    expect(getCapabilitiesMock).toHaveBeenCalledWith("generic", "wan-2.2");
  });
});
