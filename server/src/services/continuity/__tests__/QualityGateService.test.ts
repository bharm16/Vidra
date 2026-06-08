import { describe, expect, it, vi } from "vitest";
import { QualityGateService } from "../QualityGateService";

type QualityGateServicePrivate = {
  extractMidFrame: (videoUrl: string) => Promise<Buffer>;
  downloadImage: (url: string) => Promise<Buffer>;
  compareClipSimilarity: (
    reference: Buffer,
    frame: Buffer,
  ) => Promise<number | undefined>;
  compareHistogram: (reference: Buffer, frame: Buffer) => Promise<number>;
};

describe("QualityGateService", () => {
  it("passes when style similarity meets threshold", async () => {
    const service = new QualityGateService();
    const serviceAny = service as unknown as QualityGateServicePrivate;

    vi.spyOn(serviceAny, "extractMidFrame").mockResolvedValue(
      Buffer.from("frame"),
    );
    vi.spyOn(serviceAny, "downloadImage").mockResolvedValue(Buffer.from("ref"));
    vi.spyOn(serviceAny, "compareClipSimilarity").mockResolvedValue(0.91);

    const result = await service.evaluate({
      userId: "user-1",
      referenceImageUrl: "https://example.com/ref.png",
      generatedVideoUrl: "https://example.com/video.mp4",
      styleThreshold: 0.75,
    });

    expect(result.passed).toBe(true);
    expect(result.styleScore).toBeCloseTo(0.91, 5);
    expect(result.identityScore).toBeUndefined();
  });

  it("falls back to histogram scoring when clip similarity is unavailable", async () => {
    const service = new QualityGateService();
    const serviceAny = service as unknown as QualityGateServicePrivate;

    vi.spyOn(serviceAny, "extractMidFrame").mockResolvedValue(
      Buffer.from("frame"),
    );
    vi.spyOn(serviceAny, "downloadImage").mockResolvedValue(Buffer.from("ref"));
    vi.spyOn(serviceAny, "compareClipSimilarity").mockResolvedValue(undefined);
    const histogramSpy = vi
      .spyOn(serviceAny, "compareHistogram")
      .mockResolvedValue(0.5);

    const result = await service.evaluate({
      userId: "user-1",
      referenceImageUrl: "https://example.com/ref.png",
      generatedVideoUrl: "https://example.com/video.mp4",
      styleThreshold: 0.75,
    });

    expect(histogramSpy).toHaveBeenCalled();
    expect(result.styleScore).toBe(0.5);
    expect(result.passed).toBe(false);
  });

  it("fails when identity score is below threshold", async () => {
    const faceEmbedding = {
      extractEmbedding: vi
        .fn()
        .mockResolvedValueOnce({ embedding: [1, 0] })
        .mockResolvedValueOnce({ embedding: [0, 1] }),
      computeSimilarity: vi.fn().mockReturnValue(0.2),
    };
    const storage = {
      savePreviewImage: vi
        .fn()
        .mockResolvedValue({ viewUrl: "https://example.com/frame.png" }),
    };

    const service = new QualityGateService(
      faceEmbedding as never,
      storage as never,
    );
    const serviceAny = service as unknown as QualityGateServicePrivate;

    vi.spyOn(serviceAny, "extractMidFrame").mockResolvedValue(
      Buffer.from("frame"),
    );
    vi.spyOn(serviceAny, "downloadImage").mockResolvedValue(Buffer.from("ref"));
    vi.spyOn(serviceAny, "compareClipSimilarity").mockResolvedValue(0.92);

    const result = await service.evaluate({
      userId: "user-1",
      referenceImageUrl: "https://example.com/ref.png",
      generatedVideoUrl: "https://example.com/video.mp4",
      characterReferenceUrl: "https://example.com/char.png",
      styleThreshold: 0.75,
      identityThreshold: 0.6,
    });

    expect(storage.savePreviewImage).toHaveBeenCalled();
    expect(result.styleScore).toBeCloseTo(0.92, 5);
    expect(result.identityScore).toBeCloseTo(0.2, 5);
    expect(result.passed).toBe(false);
  });

  it("tolerates identity extraction failures and evaluates style-only pass/fail", async () => {
    const faceEmbedding = {
      extractEmbedding: vi
        .fn()
        .mockResolvedValueOnce({ embedding: [1, 0] })
        .mockRejectedValueOnce(new Error("face model unavailable")),
      computeSimilarity: vi.fn(),
    };
    const storage = {
      savePreviewImage: vi
        .fn()
        .mockResolvedValue({ viewUrl: "https://example.com/frame.png" }),
    };

    const service = new QualityGateService(
      faceEmbedding as never,
      storage as never,
    );
    const serviceAny = service as unknown as QualityGateServicePrivate;

    vi.spyOn(serviceAny, "extractMidFrame").mockResolvedValue(
      Buffer.from("frame"),
    );
    vi.spyOn(serviceAny, "downloadImage").mockResolvedValue(Buffer.from("ref"));
    vi.spyOn(serviceAny, "compareClipSimilarity").mockResolvedValue(0.88);

    const result = await service.evaluate({
      userId: "user-1",
      referenceImageUrl: "https://example.com/ref.png",
      generatedVideoUrl: "https://example.com/video.mp4",
      characterReferenceUrl: "https://example.com/char.png",
      styleThreshold: 0.75,
      identityThreshold: 0.6,
    });

    expect(result.styleScore).toBeCloseTo(0.88, 5);
    expect(result.identityScore).toBeUndefined();
    expect(result.passed).toBe(true);
  });
});
