import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useGenerationActions } from "@features/generations/hooks/useGenerationActions";
import type { Generation } from "@features/generations/types";
import {
  compileWanPrompt,
  generateVideoPreview,
  waitForVideoJob,
} from "@features/generations/api";
import { deriveGenerationTier } from "@features/generations/config/generationConfig";
import {
  buildGeneration,
  resolveGenerationOptions,
} from "@features/generations/utils/generationUtils";

vi.mock("@features/generations/api", () => ({
  compileWanPrompt: vi.fn(),
  generateStoryboardPreview: vi.fn(),
  generateVideoPreview: vi.fn(),
  waitForVideoJob: vi.fn(),
}));

vi.mock("@features/generations/utils/generationUtils", () => ({
  buildGeneration: vi.fn(),
  resolveGenerationOptions: vi.fn(),
}));

// Unmocked, getVideoInputSupport reaches the capabilities API through the http
// client, whose waitForAuthReady only resolves via its 3s timeout in jsdom
// (there is no Firebase to fire onAuthStateChanged) — the first render test in
// this file silently cost 3.0s. The stub returns the same all-unsupported
// shape that timeout path degrades to.
vi.mock("@features/generations/utils/videoInputSupport", () => ({
  getVideoInputSupport: vi.fn().mockResolvedValue({
    supportsEndFrame: false,
    supportsReferenceImages: false,
    supportsExtendVideo: false,
  }),
}));

const mockCompileWanPrompt = vi.mocked(compileWanPrompt);
const mockGenerateVideoPreview = vi.mocked(generateVideoPreview);
const mockWaitForVideoJob = vi.mocked(waitForVideoJob);
const mockBuildGeneration = vi.mocked(buildGeneration);
const mockResolveGenerationOptions = vi.mocked(resolveGenerationOptions);
const createGeneration = (overrides: Partial<Generation> = {}): Generation => ({
  id: "gen-1",
  tier: "draft",
  status: "pending",
  model: "wan-2.2",
  prompt: "Prompt",
  promptVersionId: "version-1",
  createdAt: 1,
  completedAt: null,
  mediaType: "video",
  mediaUrls: [],
  thumbnailUrl: null,
  error: null,
  ...overrides,
});

describe("useGenerationActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let counter = 0;
    mockBuildGeneration.mockImplementation((model, prompt, params) => {
      counter += 1;
      return createGeneration({
        id: `gen-${counter}`,
        // ADR-0021: buildGeneration derives the tier from the model.
        tier: deriveGenerationTier(model),
        model,
        prompt,
        promptVersionId: params.promptVersionId ?? null,
        status: "pending",
      });
    });
    mockResolveGenerationOptions.mockReturnValue({
      aspectRatio: "16:9",
      promptVersionId: "version-1",
      duration: 5,
      fps: 24,
      generationParams: { seed: 1 },
      startImage: null,
    });
    mockCompileWanPrompt.mockResolvedValue("compiled");

  });

  describe("error handling", () => {

    it("marks render generation as failed when preview generation fails", async () => {
      const dispatch = vi.fn();
      // generateVideoPreview throws on failure (non-2xx); it never resolves a
      // success:false body. Mock the real failure mode.
      mockGenerateVideoPreview.mockRejectedValue(new Error("No credits"));

      const { result } = renderHook(() =>
        useGenerationActions(dispatch, { promptVersionId: "version-1" }),
      );

      await act(async () => {
        await result.current.generateRender("sora-2", "Prompt", {
          promptVersionId: "version-1",
        });
      });

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "SET_GENERATIONS",
          payload: expect.arrayContaining([
            expect.objectContaining({
              id: "gen-1",
              status: "failed",
              error: "No credits",
            }),
          ]),
        }),
      );
    });

    it("marks render generation as failed when the job never returns a video", async () => {
      const dispatch = vi.fn();
      mockGenerateVideoPreview.mockResolvedValue({
        success: true,
        jobId: "job-1",
      });
      mockWaitForVideoJob.mockResolvedValue(null);

      const { result } = renderHook(() =>
        useGenerationActions(dispatch, { promptVersionId: "version-1" }),
      );

      await act(async () => {
        await result.current.generateRender("sora-2", "Prompt", {
          promptVersionId: "version-1",
        });
      });

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "UPDATE_GENERATION",
          payload: expect.objectContaining({
            // "job-1", not the local "gen-1": the take adopted the server id
            // when the job was accepted, so every later update must follow it.
            id: "job-1",
            updates: expect.objectContaining({
              status: "failed",
              error: "Failed to render video",
            }),
          }),
        }),
      );
    });

    // Regression: a clip's server-persisted generation record is written under
    // the job id (processVideoJob). The client used to keep its optimistic
    // `gen-<n>` id and stash the job id in a separate `jobId` field, so a
    // session refetch could not match the two and landed a duplicate take —
    // the exact hazard the picture paths adopt the server id to avoid.
    it("adopts the server job id as the clip's identity", async () => {
      const dispatch = vi.fn();
      mockGenerateVideoPreview.mockResolvedValue({
        success: true,
        jobId: "job-42",
        status: "queued",
      });
      mockWaitForVideoJob.mockResolvedValue({
        videoUrl: "https://example.com/clip.mp4",
      });

      const { result } = renderHook(() =>
        useGenerationActions(dispatch, { promptVersionId: "version-1" }),
      );

      await act(async () => {
        await result.current.generateRender("sora-2", "Prompt", {
          promptVersionId: "version-1",
        });
      });

      const accepted = dispatch.mock.calls
        .map(([action]) => action)
        .find((action) => action.type === "SET_GENERATIONS");
      expect(accepted?.payload).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: "job-42" })]),
      );

      // And nothing is left addressing the take by its provisional id.
      const staleIdCalls = dispatch.mock.calls
        .map(([action]) => action)
        .filter(
          (action) =>
            action.type === "UPDATE_GENERATION" &&
            action.payload.id === "gen-1",
        );
      expect(staleIdCalls).toEqual([]);
    });
  });

  describe("edge cases", () => {
    it("does nothing when retrying a missing generation id", () => {
      const dispatch = vi.fn();
      const { result } = renderHook(() =>
        useGenerationActions(dispatch, {
          generations: [],
          promptVersionId: "version-1",
        }),
      );

      act(() => {
        result.current.retryGeneration("missing");
      });

      expect(dispatch).not.toHaveBeenCalled();
      expect(mockGenerateVideoPreview).not.toHaveBeenCalled();
    });
  });

  describe("core behavior", () => {
    it("compiles visible @ words without reviving dormant named-asset resolution", async () => {
      const dispatch = vi.fn();
      mockCompileWanPrompt.mockResolvedValue("compiled visible words");
      mockGenerateVideoPreview.mockResolvedValue({ success: true, videoUrl: "https://cdn/video.mp4" });
      const { result } = renderHook(() => useGenerationActions(dispatch, { promptVersionId: "version-1" }));
      await act(async () => { await result.current.generateDraft("wan-2.2", "@matt walks through a neon alley", { promptVersionId: "version-1" }); });
      expect(mockCompileWanPrompt).toHaveBeenCalledWith("@matt walks through a neon alley", expect.any(Object));
      expect(mockGenerateVideoPreview).toHaveBeenCalledWith("compiled visible words", "16:9", "wan-2.2", expect.objectContaining({ generationParams: { seed: 1 } }));
      expect(mockGenerateVideoPreview.mock.calls[0]?.[3]).not.toHaveProperty("characterAssetId");
    });

    it("stores video asset ids for render generations when both asset and storage refs exist", async () => {
      const dispatch = vi.fn();
      mockGenerateVideoPreview.mockResolvedValue({
        success: true,
        videoUrl: "https://cdn/video.mp4",
        assetId: "video-asset-1",
        storagePath: "users/user-1/generations/video.mp4",
      });

      const { result } = renderHook(() =>
        useGenerationActions(dispatch, { promptVersionId: "version-1" }),
      );

      await act(async () => {
        await result.current.generateRender("sora-2", "Prompt", {
          promptVersionId: "version-1",
        });
      });

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "SET_GENERATIONS",
          payload: expect.arrayContaining([
            expect.objectContaining({
              id: "gen-1",
              status: "completed",
              mediaUrls: ["https://cdn/video.mp4"],
              mediaAssetIds: ["video-asset-1"],
            }),
          ]),
        }),
      );
    });
  });
});
