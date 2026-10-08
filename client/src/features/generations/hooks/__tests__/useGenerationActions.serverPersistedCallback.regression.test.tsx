import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { clearVideoInputSupportCache } from "../../utils/videoInputSupport";
import { useGenerationActions } from "../useGenerationActions";

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
});

describe("clip completion and session attachment", () => {
  it("refreshes the named session only after the job confirms durable attachment", async () => {
    waitForVideoJobMock.mockResolvedValue({
      videoUrl: "https://cdn.example/clip.mp4",
      attachment: {
        state: "attached",
        sessionId: "session-42",
        promptVersionId: "v-1",
        generationId: "job-saved",
        record: { id: "job-saved" },
      },
    });
    const onServerGenerationPersisted = vi.fn();
    const { result } = renderHook(() =>
      useGenerationActions(vi.fn(), {
        sessionId: "session-42",
        promptVersionId: "v-1",
        onServerGenerationPersisted,
      }),
    );
    await act(async () => {
      await result.current.generateRender("google/veo-3", "Visible words", {});
    });
    expect(onServerGenerationPersisted).toHaveBeenCalledExactlyOnceWith({
      sessionId: "session-42",
      generationId: "job-saved",
    });
  });

  it("does not claim persistence when the completed job omits its attachment confirmation", async () => {
    waitForVideoJobMock.mockResolvedValue({
      videoUrl: "https://cdn.example/clip.mp4",
    });
    const onServerGenerationPersisted = vi.fn();
    const { result } = renderHook(() =>
      useGenerationActions(vi.fn(), {
        sessionId: "session-42",
        promptVersionId: "v-1",
        onServerGenerationPersisted,
      }),
    );
    await act(async () => {
      await result.current.generateRender("google/veo-3", "Visible words", {});
    });
    expect(onServerGenerationPersisted).not.toHaveBeenCalled();
  });

  it("does not claim persistence when the video request fails", async () => {
    generateVideoPreviewMock.mockResolvedValue({
      success: false,
      error: "Provider unavailable",
    });
    const onServerGenerationPersisted = vi.fn();
    const { result } = renderHook(() =>
      useGenerationActions(vi.fn(), {
        sessionId: "session-42",
        promptVersionId: "v-1",
        onServerGenerationPersisted,
      }),
    );
    await act(async () => {
      await result.current.generateRender("google/veo-3", "Visible words", {});
    });
    expect(onServerGenerationPersisted).not.toHaveBeenCalled();
    expect(waitForVideoJobMock).not.toHaveBeenCalled();
  });
});
