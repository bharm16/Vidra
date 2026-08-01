import { describe, it, expect, vi, beforeEach } from "vitest";
import { SignedUrlService } from "../services/SignedUrlService";
import { StorageService } from "../StorageService";

/**
 * Regression companion to the imageAssetView storage-fallback fix
 * (Library covers 404'd while their objects existed in GCS).
 *
 * The fallback resolves preview images at the storage-service location, and
 * its honesty depends on two properties pinned here:
 *
 * 1. getViewUrlIfPresent signs only when the object exists — plain getViewUrl
 *    signs blindly (GCS mints URLs for absent objects), which would turn the
 *    view route's honest 404 into a URL that dies at the bucket.
 * 2. getPreviewImageViewUrl rebuilds the canonical preview-image path from the
 *    requester's own uid ({basePath} users/{uid}/previews/images/{basename}),
 *    so cross-user reads are impossible by construction.
 */

const buildMocks = (exists: boolean) => {
  const mockFile = {
    getSignedUrl: vi
      .fn()
      .mockResolvedValue(["https://storage.googleapis.com/signed"]),
    exists: vi.fn().mockResolvedValue([exists]),
  };
  const mockBucket = {
    file: vi.fn().mockReturnValue(mockFile),
  };
  const mockStorage = {
    bucket: vi.fn().mockReturnValue(mockBucket),
  };
  return { mockFile, mockBucket, mockStorage };
};

describe("regression: preview-image resolution signs only existing objects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getViewUrlIfPresent returns null for an absent object instead of a dead URL", async () => {
    const { mockFile, mockStorage } = buildMocks(false);
    const service = new SignedUrlService(mockStorage as unknown as never);

    const result = await service.getViewUrlIfPresent(
      "users/user-1/previews/images/1785598164559-abc.webp",
    );

    expect(result).toBeNull();
    expect(mockFile.exists).toHaveBeenCalled();
    expect(mockFile.getSignedUrl).not.toHaveBeenCalled();
  });

  it("getViewUrlIfPresent signs a read URL when the object exists", async () => {
    const { mockFile, mockStorage } = buildMocks(true);
    const service = new SignedUrlService(mockStorage as unknown as never);

    const result = await service.getViewUrlIfPresent(
      "users/user-1/previews/images/1785598164559-abc.webp",
    );

    expect(result?.viewUrl).toBe("https://storage.googleapis.com/signed");
    expect(mockFile.getSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({ action: "read" }),
    );
  });

  it("getPreviewImageViewUrl resolves the asset at the requester's own preview-image path", async () => {
    const { mockBucket, mockStorage } = buildMocks(true);
    const service = new StorageService({
      storage: mockStorage as unknown as never,
    });

    const url = await service.getPreviewImageViewUrl(
      "user-1",
      "1785598164559-abc.webp",
    );

    expect(url).toBe("https://storage.googleapis.com/signed");
    expect(mockBucket.file).toHaveBeenCalledWith(
      "users/user-1/previews/images/1785598164559-abc.webp",
    );
  });

  it("getPreviewImageViewUrl returns null when the object is genuinely absent", async () => {
    const { mockStorage } = buildMocks(false);
    const service = new StorageService({
      storage: mockStorage as unknown as never,
    });

    const url = await service.getPreviewImageViewUrl(
      "user-1",
      "1785598164559-abc.webp",
    );

    expect(url).toBeNull();
  });
});
