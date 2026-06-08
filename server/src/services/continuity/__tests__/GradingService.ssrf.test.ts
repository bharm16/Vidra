import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GradingService } from "../GradingService";

const IPV4_MAPPED_METADATA_URL = "http://[::ffff:169.254.169.254]/";
const SAFE_REFERENCE_URL = "https://example.com/ref.png";
const SAFE_SOURCE_URL = "https://example.com/source.png";

describe("GradingService SSRF guard (regression)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("matchPalette throws before any fetch when referenceImageUrl is unsafe", async () => {
    const getPublicUrl = vi
      .fn()
      .mockResolvedValue("https://cdn.example.com/video.mp4");
    const service = new GradingService(
      {
        getPublicUrl,
        storeFromBuffer: vi.fn(),
      } as never,
      undefined,
    );

    await expect(
      service.matchPalette("asset-1", IPV4_MAPPED_METADATA_URL),
    ).rejects.toThrow(/Invalid URL for referenceImageUrl/);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(getPublicUrl).not.toHaveBeenCalled();
  });

  it("matchImagePalette throws before any fetch when sourceImageUrl is unsafe", async () => {
    const storage = { savePreviewImage: vi.fn() };
    const service = new GradingService(
      {
        getPublicUrl: vi.fn(),
        storeFromBuffer: vi.fn(),
      } as never,
      storage as never,
    );

    await expect(
      service.matchImagePalette(
        "user-1",
        IPV4_MAPPED_METADATA_URL,
        SAFE_REFERENCE_URL,
      ),
    ).rejects.toThrow(/Invalid URL for sourceImageUrl/);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(storage.savePreviewImage).not.toHaveBeenCalled();
  });

  it("matchImagePalette throws before any fetch when referenceImageUrl is unsafe", async () => {
    const storage = { savePreviewImage: vi.fn() };
    const service = new GradingService(
      {
        getPublicUrl: vi.fn(),
        storeFromBuffer: vi.fn(),
      } as never,
      storage as never,
    );

    await expect(
      service.matchImagePalette(
        "user-1",
        SAFE_SOURCE_URL,
        IPV4_MAPPED_METADATA_URL,
      ),
    ).rejects.toThrow(/Invalid URL for referenceImageUrl/);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(storage.savePreviewImage).not.toHaveBeenCalled();
  });

  it("matchPalette throws for localhost referenceImageUrl", async () => {
    const service = new GradingService(
      {
        getPublicUrl: vi
          .fn()
          .mockResolvedValue("https://cdn.example.com/video.mp4"),
        storeFromBuffer: vi.fn(),
      } as never,
      undefined,
    );

    await expect(
      service.matchPalette("asset-1", "http://127.0.0.1/ref.png"),
    ).rejects.toThrow(/Invalid URL for referenceImageUrl/);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("matchImagePalette throws for file:// scheme sourceImageUrl", async () => {
    const storage = { savePreviewImage: vi.fn() };
    const service = new GradingService(
      {
        getPublicUrl: vi.fn(),
        storeFromBuffer: vi.fn(),
      } as never,
      storage as never,
    );

    await expect(
      service.matchImagePalette(
        "user-1",
        "file:///etc/passwd",
        SAFE_REFERENCE_URL,
      ),
    ).rejects.toThrow(/Invalid URL for sourceImageUrl/);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
