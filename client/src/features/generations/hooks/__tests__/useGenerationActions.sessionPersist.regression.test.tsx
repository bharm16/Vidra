import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { clearVideoInputSupportCache } from "../../utils/videoInputSupport";
import { useGenerationActions } from "../useGenerationActions";
import type { Generation } from "../../types";

const generateVideoPreviewMock = vi.fn();
const waitForVideoJobMock = vi.fn();
vi.mock("../../api", () => ({
  compileWanPrompt: vi.fn(async (prompt: string) => prompt),
  generateVideoPreview: (...args: unknown[]) =>
    generateVideoPreviewMock(...args),
  waitForVideoJob: (...args: unknown[]) => waitForVideoJobMock(...args),
}));
vi.mock("@/services", () => ({
  capabilitiesApi: { getCapabilities: vi.fn(async () => ({ fields: {} })) },
}));

beforeEach(() => {
  vi.clearAllMocks();
  clearVideoInputSupportCache();
  generateVideoPreviewMock.mockResolvedValue({
    success: true,
    jobId: "job-saved",
    status: "queued",
  });
  waitForVideoJobMock.mockResolvedValue({
    videoUrl: "https://cdn.example/clip.mp4",
  });
});

describe("authoring clip persistence", () => {
  it("uses the freshly minted version id in the POST before the options render catches up", async () => {
    const { result } = renderHook(() =>
      useGenerationActions(vi.fn(), {
        sessionId: "session-42",
        promptVersionId: "v-old",
      }),
    );
    await act(async () => {
      await result.current.generateRender("google/veo-3", "Visible words", {
        promptVersionId: "v-new",
      });
    });
    expect(generateVideoPreviewMock).toHaveBeenCalledExactlyOnceWith(
      "Visible words",
      undefined,
      "google/veo-3",
      expect.objectContaining({
        sessionId: "session-42",
        promptVersionId: "v-new",
      }),
    );
  });

  it("keeps the remote job id as take identity and preserves previously saved media", async () => {
    const dispatch = vi.fn();
    const existing: Generation = {
      id: "prior",
      tier: "render",
      model: "google/veo-3",
      prompt: "Prior words",
      promptVersionId: "v-1",
      status: "completed",
      createdAt: 1,
      completedAt: 2,
      mediaType: "video",
      mediaUrls: ["https://cdn.example/prior.mp4"],
      thumbnailUrl: null,
      error: null,
    };
    const { result } = renderHook(() =>
      useGenerationActions(dispatch, {
        sessionId: "session-42",
        promptVersionId: "v-1",
        generations: [existing],
      }),
    );
    await act(async () => {
      await result.current.generateRender("google/veo-3", "New words", {
        promptVersionId: "v-1",
      });
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_GENERATIONS",
        payload: [
          existing,
          expect.objectContaining({ id: "job-saved", jobId: "job-saved" }),
        ],
      }),
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "UPDATE_GENERATION",
        payload: expect.objectContaining({
          id: "job-saved",
          updates: expect.objectContaining({
            status: "completed",
            mediaUrls: ["https://cdn.example/clip.mp4"],
          }),
        }),
      }),
    );
  });

  it("passes a picture's saved take identity through the explicit animate handoff", async () => {
    const { result } = renderHook(() =>
      useGenerationActions(vi.fn(), {
        sessionId: "session-42",
        promptVersionId: "v-1",
      }),
    );
    await act(async () => {
      await result.current.generateRender(
        "google/veo-3",
        "Animate visible words",
        {
          startImage: {
            url: "https://cdn.example/picture.png",
            source: "generation",
            generationId: "picture-saved",
          },
        },
      );
    });
    expect(generateVideoPreviewMock.mock.calls[0]?.[3]).toMatchObject({
      startImage: "https://cdn.example/picture.png",
      sourceGenerationId: "picture-saved",
      sessionId: "session-42",
    });
  });
});
