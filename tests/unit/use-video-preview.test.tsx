import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { useVideoPreview } from "@features/preview/hooks/useVideoPreview";
import { promptOptimizationApiV2 } from "@/services";
import {
  generateVideoPreview,
  getVideoPreviewStatus,
} from "@features/preview/api/previewApi";

vi.mock("@/services", () => ({
  promptOptimizationApiV2: {
    compilePrompt: vi.fn(),
  },
}));

vi.mock("@features/preview/api/previewApi", () => ({
  generateVideoPreview: vi.fn(),
  getVideoPreviewStatus: vi.fn(),
}));

const mockCompilePrompt = vi.mocked(promptOptimizationApiV2.compilePrompt);
const mockGenerateVideoPreview = vi.mocked(generateVideoPreview);
const mockGetVideoPreviewStatus = vi.mocked(getVideoPreviewStatus);

describe("useVideoPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("error handling", () => {
    it("surfaces API errors when preview generation fails", async () => {
      // generateVideoPreview throws on failure (non-2xx); it never resolves a
      // success:false body. Mock the real failure mode.
      mockGenerateVideoPreview.mockRejectedValue(
        new Error("Generation failed"),
      );

      const { result } = renderHook(() =>
        useVideoPreview({
          prompt: "Test prompt",
          isVisible: true,
          model: "wan-2.2",
        }),
      );

      await act(async () => {
        result.current.regenerate();
      });

      await waitFor(() => {
        expect(result.current.error).toBe("Generation failed");
        expect(result.current.videoUrl).toBeNull();
        expect(result.current.loading).toBe(false);
      });
    });

    it("surfaces job failure errors from polling", async () => {
      mockGenerateVideoPreview.mockResolvedValue({
        success: true,
        jobId: "job-1",
      });
      mockGetVideoPreviewStatus.mockResolvedValue({
        success: true,
        jobId: "job-1",
        status: "failed",
        error: "Job failed",
      });

      const { result } = renderHook(() =>
        useVideoPreview({
          prompt: "Another prompt",
          isVisible: true,
          model: "wan-2.2",
        }),
      );

      await act(async () => {
        result.current.regenerate();
      });

      await waitFor(() => {
        expect(result.current.error).toBe("Job failed");
        expect(result.current.videoUrl).toBeNull();
      });
    });
  });

  describe("edge cases", () => {
    it("does nothing when prompt is empty", async () => {
      const { result } = renderHook(() =>
        useVideoPreview({ prompt: "   ", isVisible: true }),
      );

      await act(async () => {
        result.current.regenerate();
      });

      expect(mockGenerateVideoPreview).not.toHaveBeenCalled();
      expect(result.current.videoUrl).toBeNull();
      expect(result.current.loading).toBe(false);
    });

    it("uses the start image as input reference for sora models", async () => {
      mockGenerateVideoPreview.mockResolvedValue({
        success: true,
        videoUrl: "https://cdn/video.mp4",
      });

      const { result } = renderHook(() =>
        useVideoPreview({
          prompt: "Prompt",
          isVisible: true,
          model: "sora-2",
          startImage: "https://cdn/start.png",
        }),
      );

      await act(async () => {
        result.current.regenerate();
      });

      await waitFor(() => {
        expect(mockGenerateVideoPreview).toHaveBeenCalledWith(
          "Prompt",
          undefined,
          "sora-2",
          expect.objectContaining({
            startImage: "https://cdn/start.png",
            inputReference: "https://cdn/start.png",
          }),
        );
      });
    });
  });

  describe("core behavior", () => {
    it("compiles WAN prompts before sending to preview generation", async () => {
      mockCompilePrompt.mockResolvedValue({
        compiledPrompt: "Compiled prompt",
      });
      mockGenerateVideoPreview.mockResolvedValue({
        success: true,
        videoUrl: "https://cdn/compiled.mp4",
      });
      const prompt = "This is a longer prompt\n**Technical specs**\nfoo";

      const { result } = renderHook(() =>
        useVideoPreview({
          prompt,
          isVisible: true,
          model: "wan-2.2",
        }),
      );

      await act(async () => {
        result.current.regenerate();
      });

      await waitFor(() => {
        expect(mockCompilePrompt).toHaveBeenCalledWith(
          expect.objectContaining({ prompt: "This is a longer prompt" }),
        );
        expect(mockGenerateVideoPreview).toHaveBeenCalledWith(
          "Compiled prompt",
          undefined,
          "wan-2.2",
          undefined,
        );
        expect(result.current.videoUrl).toBe("https://cdn/compiled.mp4");
      });
    });
  });
});
