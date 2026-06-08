import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

let FrameBridgeService: typeof import("../FrameBridgeService").FrameBridgeService;

beforeAll(async () => {
  process.env.GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME || "test-bucket";
  ({ FrameBridgeService } = await import("../FrameBridgeService"));
});

describe("FrameBridgeService", () => {
  const storage = {
    savePreviewImage: vi
      .fn()
      .mockResolvedValue({ viewUrl: "https://storage.example.com/frame.png" }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts a bridge frame and stores metadata", async () => {
    const service = new FrameBridgeService(storage as any);
    const serviceAny = service as any;
    vi.spyOn(serviceAny, "getVideoMetadata").mockResolvedValue({
      duration: 10,
      width: 1280,
      height: 720,
      fps: 24,
    });
    vi.spyOn(serviceAny, "extractFrameAt").mockResolvedValue(
      Buffer.from("frame"),
    );

    const result = await service.extractBridgeFrame(
      "user-1",
      "video-1",
      "https://example.com/video.mp4",
      "shot-1",
      "last",
    );

    expect(storage.savePreviewImage).toHaveBeenCalledWith(
      "user-1",
      expect.any(Buffer),
      expect.objectContaining({
        sourceVideo: "video-1",
        position: "last",
      }),
    );
    expect(result.framePosition).toBe("last");
    expect(result.frameTimestamp).toBeCloseTo(9.9, 2);
    expect(result.resolution).toEqual({ width: 1280, height: 720 });
    expect(result.aspectRatio).toBe("16:9");
  });

  it("selects the best representative frame based on score", async () => {
    const service = new FrameBridgeService(storage as any);
    const serviceAny = service as any;
    vi.spyOn(serviceAny, "getVideoMetadata").mockResolvedValue({
      duration: 12,
      width: 1920,
      height: 1080,
      fps: 24,
    });
    vi.spyOn(serviceAny, "extractFrameAt")
      .mockResolvedValueOnce(Buffer.from("frame-1"))
      .mockResolvedValueOnce(Buffer.from("frame-2"))
      .mockResolvedValueOnce(Buffer.from("frame-3"));
    vi.spyOn(serviceAny, "scoreFrameQuality")
      .mockResolvedValueOnce(0.1)
      .mockResolvedValueOnce(0.9)
      .mockResolvedValueOnce(0.2);

    const result = await service.extractRepresentativeFrame(
      "user-1",
      "video-1",
      "https://example.com/video.mp4",
      "shot-1",
    );

    expect(result.frameTimestamp).toBeCloseTo(6, 2);
    expect(storage.savePreviewImage).toHaveBeenCalledTimes(1);
  });
});
