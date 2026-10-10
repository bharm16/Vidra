import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { clearVideoInputSupportCache } from "../../utils/videoInputSupport";
import { useGenerationActions } from "../useGenerationActions";

const compileWanPromptMock = vi.fn();
const generateVideoPreviewMock = vi.fn();
const waitForVideoJobMock = vi.fn();
const getCapabilitiesMock = vi.fn();

vi.mock("@/services", () => ({
  capabilitiesApi: {
    getCapabilities: (...args: unknown[]) => getCapabilitiesMock(...args),
  },
}));

vi.mock("../../api", () => ({
  compileWanPrompt: (...args: unknown[]) => compileWanPromptMock(...args),
  generateVideoPreview: (...args: unknown[]) =>
    generateVideoPreviewMock(...args),
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

describe("useGenerationActions admission failures", () => {
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

  it("surfaces request failures and releases submission for retry", async () => {
    const dispatch = vi.fn();
    generateVideoPreviewMock.mockRejectedValue(new Error("Network down"));

    const { result } = renderHook(() => useGenerationActions(dispatch));

    await act(async () => {
      await result.current.generateRender("sora-2", "Render prompt", {});
    });

    const setAction = getAction(dispatch, "SET_GENERATIONS") as
      | { payload: Array<{ status: string; error: string }> }
      | undefined;
    const failed = setAction?.payload?.[setAction.payload.length - 1];
    expect(failed?.status).toBe("failed");
    expect(failed?.error).toBe("Network down");
    expect(result.current.isSubmitting).toBe(false);
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
});
