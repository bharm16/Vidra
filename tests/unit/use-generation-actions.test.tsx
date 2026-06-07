import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useGenerationActions } from "@features/generations/hooks/useGenerationActions";
import type { Generation } from "@features/generations/types";
import {
  compileWanPrompt,
  generateStoryboardPreview,
  generateVideoPreview,
  waitForVideoJob,
} from "@features/generations/api";
import { assetApi } from "@features/assets/api/assetApi";
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

vi.mock("@features/assets/api/assetApi", () => ({
  assetApi: {
    resolve: vi.fn(),
  },
}));

const mockCompileWanPrompt = vi.mocked(compileWanPrompt);
const mockGenerateStoryboardPreview = vi.mocked(generateStoryboardPreview);
const mockGenerateVideoPreview = vi.mocked(generateVideoPreview);
const mockWaitForVideoJob = vi.mocked(waitForVideoJob);
const mockBuildGeneration = vi.mocked(buildGeneration);
const mockResolveGenerationOptions = vi.mocked(resolveGenerationOptions);
const mockResolveAssetPrompt = vi.mocked(assetApi.resolve);
type ResolvedPromptPayload = Awaited<ReturnType<typeof assetApi.resolve>>;
type ResolvedAsset = ResolvedPromptPayload["assets"][number];

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

const createAsset = (overrides: Partial<ResolvedAsset> = {}): ResolvedAsset =>
  ({
    id: overrides.id ?? "asset-1",
    userId: overrides.userId ?? "user-1",
    type: overrides.type ?? "character",
    trigger: overrides.trigger ?? "@hero",
    name: overrides.name ?? "Hero",
    textDefinition: overrides.textDefinition ?? "Hero character",
    referenceImages: overrides.referenceImages ?? [],
    usageCount: overrides.usageCount ?? 0,
    lastUsedAt: overrides.lastUsedAt ?? null,
    createdAt: overrides.createdAt ?? "2024-01-01T00:00:00Z",
    updatedAt: overrides.updatedAt ?? "2024-01-01T00:00:00Z",
    ...overrides,
  }) as ResolvedAsset;

describe("useGenerationActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let counter = 0;
    mockBuildGeneration.mockImplementation((tier, model, prompt, params) => {
      counter += 1;
      return createGeneration({
        id: `gen-${counter}`,
        tier,
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
    mockResolveAssetPrompt.mockResolvedValue({
      originalText: "Prompt",
      expandedText: "Prompt",
      assets: [],
      characters: [],
      styles: [],
      locations: [],
      objects: [],
      requiresKeyframe: false,
      negativePrompts: [],
      referenceImages: [],
    });
  });

  describe("error handling", () => {
    it("marks draft generation as failed when storyboard response is invalid", async () => {
      const dispatch = vi.fn();
      mockGenerateStoryboardPreview.mockResolvedValue({
        success: false,
        error: "No frames",
      });

      const { result } = renderHook(() =>
        useGenerationActions(dispatch, { promptVersionId: "version-1" }),
      );

      await act(async () => {
        await result.current.generateDraft("flux-kontext", "Prompt", {
          promptVersionId: "version-1",
        });
      });

      // ISSUE-12 follow-up: ADD_GENERATION retired; state growth now flows
      // through SET_GENERATIONS with the full array. The failed generation
      // appears as the last element of the payload.
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "SET_GENERATIONS",
          payload: expect.arrayContaining([
            expect.objectContaining({
              id: "gen-1",
              status: "failed",
              error: "No frames",
            }),
          ]),
        }),
      );
    });

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
            id: "gen-1",
            updates: expect.objectContaining({
              status: "failed",
              error: "Failed to render video",
            }),
          }),
        }),
      );
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

    it("uses character asset id when start image comes from an asset", async () => {
      const dispatch = vi.fn();
      mockResolveGenerationOptions.mockReturnValue({
        aspectRatio: "16:9",
        promptVersionId: "version-1",
        duration: 5,
        fps: 24,
        generationParams: { seed: 2 },
        startImage: {
          url: "https://cdn/start.png",
          source: "asset",
          assetId: "asset-1",
        },
      });
      mockGenerateVideoPreview.mockResolvedValue({
        success: true,
        videoUrl: "https://cdn/video.mp4",
      });

      const { result } = renderHook(() =>
        useGenerationActions(dispatch, { promptVersionId: "version-1" }),
      );

      await act(async () => {
        await result.current.generateRender("sora-2", "Prompt", {
          promptVersionId: "version-1",
        });
      });

      expect(mockGenerateVideoPreview).toHaveBeenCalledWith(
        "Prompt",
        "16:9",
        "sora-2",
        expect.objectContaining({
          characterAssetId: "asset-1",
          generationParams: { seed: 2 },
        }),
      );
    });
  });

  describe("core behavior", () => {
    it("resolves trigger prompts before WAN compile and forwards characterAssetId", async () => {
      const dispatch = vi.fn();
      const resolvedPrompt: Awaited<ReturnType<typeof assetApi.resolve>> = {
        originalText: "@matt walks through a neon alley",
        expandedText: "Matt Harmon walks through a neon alley",
        assets: [createAsset({ id: "char-1" })],
        characters: [createAsset({ id: "char-1" })],
        styles: [],
        locations: [],
        objects: [],
        requiresKeyframe: true,
        negativePrompts: [],
        referenceImages: [],
      };
      mockResolveAssetPrompt.mockResolvedValue(resolvedPrompt);
      mockCompileWanPrompt.mockResolvedValue("compiled expanded prompt");
      mockGenerateVideoPreview.mockResolvedValue({
        success: true,
        videoUrl: "https://cdn/video.mp4",
      });

      const { result } = renderHook(() =>
        useGenerationActions(dispatch, { promptVersionId: "version-1" }),
      );

      await act(async () => {
        await result.current.generateDraft(
          "wan-2.2",
          "@matt walks through a neon alley",
          {
            promptVersionId: "version-1",
          },
        );
      });

      expect(mockResolveAssetPrompt).toHaveBeenCalledWith(
        "@matt walks through a neon alley",
      );
      expect(mockCompileWanPrompt).toHaveBeenCalledWith(
        "Matt Harmon walks through a neon alley",
        expect.any(Object),
      );
      expect(mockGenerateVideoPreview).toHaveBeenCalledWith(
        "compiled expanded prompt",
        "16:9",
        "wan-2.2",
        expect.objectContaining({
          characterAssetId: "char-1",
          generationParams: { seed: 1 },
        }),
      );
    });

    it("finalizes storyboard generations with media urls", async () => {
      const dispatch = vi.fn();
      mockGenerateStoryboardPreview.mockResolvedValue({
        success: true,
        data: {
          imageUrls: ["https://cdn/frame1.png", "https://cdn/frame2.png"],
          storagePaths: ["users/path1", "users/path2"],
          baseImageUrl: "https://cdn/base.png",
          deltas: [],
        },
      });

      const { result } = renderHook(() =>
        useGenerationActions(dispatch, { promptVersionId: "version-1" }),
      );

      await act(async () => {
        await result.current.generateStoryboard("Storyboard prompt", {
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
              mediaUrls: ["https://cdn/frame1.png", "https://cdn/frame2.png"],
              thumbnailUrl: "https://cdn/base.png",
              mediaAssetIds: ["path1", "path2"],
            }),
          ]),
        }),
      );
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
