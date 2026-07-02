import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { API_CONFIG } from "@/config/api.config";
import {
  generatePreview,
  generateStoryboardPreview,
  getImageAssetViewUrl,
  getVideoAssetViewUrl,
  uploadPreviewImage,
  generateVideoPreview,
  getVideoPreviewStatus,
} from "@features/preview/api/previewApi";

const apiClientMocks = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  buildFirebaseAuthHeaders: vi.fn(),
}));

vi.mock("@/services/ApiClient", () => ({
  apiClient: apiClientMocks,
}));

vi.mock("@/services/http/firebaseAuth", () => authMocks);

describe("previewApi", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    // Parse-valid superset defaults: the tightened preview schemas require
    // `data` on the success arm; unknown data keys are stripped, so one
    // kitchen-sink body satisfies every endpoint schema.
    apiClientMocks.post.mockResolvedValue({
      success: true,
      data: {
        imageUrl: "https://cdn.example.com/i.png",
        metadata: {
          aspectRatio: "16:9",
          model: "test-model",
          duration: 1,
          generatedAt: "2026-01-01T00:00:00Z",
        },
        imageUrls: ["https://cdn.example.com/i.png"],
        deltas: [],
        baseImageUrl: "https://cdn.example.com/i.png",
        faceSwapUrl: "https://cdn.example.com/f.png",
        creditsDeducted: 0,
        results: [],
      },
    });
    apiClientMocks.get.mockResolvedValue({
      success: true,
      data: { viewUrl: "https://cdn.example.com/v.png", results: [] },
    });
    authMocks.buildFirebaseAuthHeaders.mockResolvedValue({
      "X-Test-Auth": "token",
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("error handling", () => {
    it("rejects when generatePreview receives an empty prompt", async () => {
      await expect(generatePreview("  ")).rejects.toThrow(
        "Prompt is required and must be a non-empty string",
      );
    });

    it("rejects when generateStoryboardPreview receives an empty prompt", async () => {
      await expect(generateStoryboardPreview("")).rejects.toThrow(
        "Prompt is required and must be a non-empty string",
      );
    });

    it("rejects when getImageAssetViewUrl receives an empty assetId", async () => {
      await expect(getImageAssetViewUrl("")).rejects.toThrow(
        "assetId is required and must be a non-empty string",
      );
    });

    it("rejects when getVideoPreviewStatus receives a missing jobId", async () => {
      await expect(getVideoPreviewStatus("")).rejects.toThrow(
        "jobId is required",
      );
    });

    it("throws the API error when uploadPreviewImage fails", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Not authorized" }),
      } as unknown as Response);
      global.fetch = fetchMock as typeof fetch;

      const file = new File(["data"], "preview.png", { type: "image/png" });

      await expect(uploadPreviewImage(file)).rejects.toThrow("Not authorized");
    });
  });

  describe("edge cases", () => {
    it("accepts a string options argument for generatePreview", async () => {
      await generatePreview("A prompt", "16:9");

      expect(apiClientMocks.post).toHaveBeenCalledWith(
        "/preview/generate",
        expect.objectContaining({
          prompt: "A prompt",
          aspectRatio: "16:9",
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            "Idempotency-Key": expect.any(String),
          }),
        }),
      );
    });

    it("returns a fallback payload when uploadPreviewImage JSON parsing fails", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error("bad json");
        },
      } as unknown as Response);
      global.fetch = fetchMock as typeof fetch;

      const file = new File(["data"], "preview.png", { type: "image/png" });
      const result = await uploadPreviewImage(file);

      expect(result).toEqual({
        success: false,
        error: "Failed to upload image",
      });
    });
  });

  describe("core behavior", () => {
    it("trims the prompt and applies Kontext timeout when inputImageUrl is provided", async () => {
      await generatePreview("  Hello world  ", {
        aspectRatio: "4:3",
        provider: "replicate-flux-schnell",
        inputImageUrl: "  https://images.example.com/input.png  ",
        seed: 42,
        speedMode: "Juiced",
        outputQuality: 80,
      });

      expect(apiClientMocks.post).toHaveBeenCalledWith(
        "/preview/generate",
        expect.objectContaining({
          prompt: "Hello world",
          aspectRatio: "4:3",
          provider: "replicate-flux-schnell",
          inputImageUrl: "https://images.example.com/input.png",
          seed: 42,
          speedMode: "Juiced",
          outputQuality: 80,
        }),
        expect.objectContaining({
          timeout: 60000,
          headers: expect.objectContaining({
            "Idempotency-Key": expect.any(String),
          }),
        }),
      );
    });

    it("uses the storyboard timeout and trims the seed image URL", async () => {
      await generateStoryboardPreview("Storyboard prompt", {
        seedImageUrl: "  https://images.example.com/seed.png ",
        aspectRatio: "16:9",
        speedMode: "Real Time",
        seed: 7,
      });

      expect(apiClientMocks.post).toHaveBeenCalledWith(
        "/preview/generate/storyboard",
        expect.objectContaining({
          prompt: "Storyboard prompt",
          seedImageUrl: "https://images.example.com/seed.png",
          aspectRatio: "16:9",
          speedMode: "Real Time",
          seed: 7,
        }),
        expect.objectContaining({
          timeout: API_CONFIG.timeout.storyboard,
          headers: expect.objectContaining({
            "Idempotency-Key": expect.any(String),
          }),
        }),
      );
    });

    it("builds encoded asset view URLs for preview images and videos", async () => {
      await getImageAssetViewUrl(" asset/123 ");
      await getVideoAssetViewUrl("video asset");

      expect(apiClientMocks.get).toHaveBeenCalledWith(
        `/preview/image/view?assetId=${encodeURIComponent("asset/123")}`,
      );
      expect(apiClientMocks.get).toHaveBeenCalledWith(
        `/preview/video/view?assetId=${encodeURIComponent("video asset")}`,
      );
    });

    it("posts a video preview request with timeout and options", async () => {
      await generateVideoPreview("  Video prompt  ", "16:9", "model-x", {
        startImage: "https://images.example.com/start.png",
        inputReference: "ref-1",
        generationParams: { quality: "high" },
        characterAssetId: "asset-1",
        autoKeyframe: true,
      });

      expect(apiClientMocks.post).toHaveBeenCalledWith(
        "/preview/video/generate",
        expect.objectContaining({
          prompt: "Video prompt",
          aspectRatio: "16:9",
          model: "model-x",
          startImage: "https://images.example.com/start.png",
          inputReference: "ref-1",
          generationParams: { quality: "high" },
          characterAssetId: "asset-1",
          autoKeyframe: true,
        }),
        expect.objectContaining({
          timeout: API_CONFIG.timeout.video,
          headers: expect.objectContaining({
            "Idempotency-Key": expect.any(String),
          }),
        }),
      );
    });

    it("requests the video preview status without caching", async () => {
      apiClientMocks.get.mockResolvedValueOnce({
        success: true,
        jobId: "job-123",
        status: "processing",
      });

      await getVideoPreviewStatus("job-123");

      expect(apiClientMocks.get).toHaveBeenCalledWith(
        "/preview/video/jobs/job-123",
        {
          fetchOptions: { cache: "no-store" },
        },
      );
    });

    it("uploads preview images with auth headers and metadata", async () => {
      const payload = {
        success: true,
        data: {
          imageUrl: "https://cdn.example.com/preview.png",
          contentType: "image/png",
        },
      };
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => payload,
      } as unknown as Response);
      global.fetch = fetchMock as typeof fetch;

      const file = new File(["data"], "preview.png", { type: "image/png" });
      const result = await uploadPreviewImage(
        file,
        { mood: "bright" },
        {
          source: "gallery",
          label: "hero",
        },
      );

      const request = fetchMock.mock.calls[0]?.[1];
      const body = request?.body as FormData | undefined;

      expect(result).toEqual(payload);
      expect(authMocks.buildFirebaseAuthHeaders).toHaveBeenCalled();
      expect(request?.headers).toEqual(
        expect.objectContaining({ "X-Test-Auth": "token" }),
      );
      expect(body).toBeInstanceOf(FormData);
      expect(body?.get("file")).toBe(file);
      expect(body?.get("metadata")).toBe(JSON.stringify({ mood: "bright" }));
      expect(body?.get("source")).toBe("gallery");
      expect(body?.get("label")).toBe("hero");
    });
  });
});
