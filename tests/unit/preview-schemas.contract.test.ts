import { describe, expect, it } from "vitest";

import {
  GeneratePreviewResponseSchema,
  UploadPreviewImageResponseSchema,
  MediaViewUrlResponseSchema,
  GenerateVideoResponseSchema,
  VideoJobStatusResponseSchema,
} from "#shared/schemas/preview.schemas";

describe("GeneratePreviewResponse contract", () => {
  it("accepts a success response", () => {
    const result = GeneratePreviewResponseSchema.safeParse({
      success: true,
      data: {
        imageUrl: "https://storage.example.com/preview.png",
        metadata: {
          aspectRatio: "16:9",
          model: "flux-schnell",
          duration: 0,
          generatedAt: "2025-06-15T10:00:00Z",
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts an error response", () => {
    const result = GeneratePreviewResponseSchema.safeParse({
      success: false,
      error: "Generation failed",
      message: "Rate limit exceeded",
    });

    expect(result.success).toBe(true);
  });
});

describe("UploadPreviewImageResponse contract", () => {
  it("accepts a success response with all optional fields", () => {
    const result = UploadPreviewImageResponseSchema.safeParse({
      success: true,
      data: {
        imageUrl: "https://storage.example.com/uploaded.png",
        storagePath: "uploads/user-1/img.png",
        viewUrl: "https://cdn.example.com/img.png",
        viewUrlExpiresAt: "2025-06-16T10:00:00Z",
        sizeBytes: 150000,
        contentType: "image/png",
      },
    });

    expect(result.success).toBe(true);
  });
});

describe("MediaViewUrlResponse contract", () => {
  it("accepts a success response", () => {
    const result = MediaViewUrlResponseSchema.safeParse({
      success: true,
      data: {
        viewUrl: "https://cdn.example.com/video.mp4",
        expiresAt: "2025-06-16T10:00:00Z",
        assetId: "asset-1",
        source: "firebase-storage",
      },
    });

    expect(result.success).toBe(true);
  });
});

describe("GenerateVideoResponse contract", () => {
  it("accepts a queued video response", () => {
    const result = GenerateVideoResponseSchema.safeParse({
      success: true,
      jobId: "job-abc",
      status: "queued",
      creditsReserved: 10,
    });

    expect(result.success).toBe(true);
  });

  it("accepts a completed video response", () => {
    const result = GenerateVideoResponseSchema.safeParse({
      success: true,
      videoUrl: "https://storage.example.com/video.mp4",
      assetId: "asset-v1",
      storagePath: "videos/session-1/output.mp4",
      viewUrl: "https://cdn.example.com/video.mp4",
      viewUrlExpiresAt: "2025-06-16T10:00:00Z",
      sizeBytes: 5000000,
      inputMode: "i2v",
      startImageUrl: "https://example.com/keyframe.png",
      jobId: "job-abc",
      status: "completed",
      creditsReserved: 10,
      creditsDeducted: 10,
      keyframeGenerated: true,
      keyframeUrl: "https://example.com/kf.png",
      faceSwapApplied: false,
      faceSwapUrl: null,
    });

    expect(result.success).toBe(true);
  });
});

describe("VideoJobStatusResponse contract", () => {
  it("accepts a processing status", () => {
    const result = VideoJobStatusResponseSchema.safeParse({
      success: true,
      jobId: "job-abc",
      status: "processing",
      progress: 0.45,
      createdAtMs: 1718445600000,
    });

    expect(result.success).toBe(true);
  });

  it("accepts a completed status with null progress", () => {
    const result = VideoJobStatusResponseSchema.safeParse({
      success: true,
      jobId: "job-abc",
      status: "completed",
      progress: null,
      videoUrl: "https://example.com/video.mp4",
      creditsDeducted: 10,
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid status values", () => {
    const result = VideoJobStatusResponseSchema.safeParse({
      success: true,
      jobId: "job-abc",
      status: "cancelled",
    });

    expect(result.success).toBe(false);
  });
});
