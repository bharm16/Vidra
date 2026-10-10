import { describe, it, expect, vi, beforeEach } from "vitest";
import { StorageService } from "../StorageService";

const buildStorageService = () => {
  const mockBucket = {
    file: vi.fn().mockReturnValue({
      exists: vi.fn().mockResolvedValue([true]),
      getMetadata: vi
        .fn()
        .mockResolvedValue([{ size: "1024", contentType: "video/mp4" }]),
    }),
  };

  const mockStorage = {
    bucket: vi.fn().mockReturnValue(mockBucket),
  };

  const mockSignedUrlService = {
    getUploadUrl: vi.fn().mockResolvedValue({
      uploadUrl: "https://storage.googleapis.com/upload",
      expiresAt: "2024-01-21T12:00:00Z",
    }),
    getViewUrl: vi.fn().mockResolvedValue({
      viewUrl: "https://storage.googleapis.com/view",
      expiresAt: "2024-01-21T12:00:00Z",
    }),
    getDownloadUrl: vi.fn().mockResolvedValue({
      downloadUrl: "https://storage.googleapis.com/download",
      expiresAt: "2024-01-22T12:00:00Z",
    }),
  };

  const mockUploadService = {
    uploadFromUrl: vi.fn().mockResolvedValue({
      storagePath: "users/user123/generations/123-abc.mp4",
      sizeBytes: 52428800,
      contentType: "video/mp4",
      createdAt: "2024-01-21T12:00:00Z",
    }),
    confirmUpload: vi.fn().mockResolvedValue({
      storagePath: "users/user123/previews/images/123-abc.webp",
      sizeBytes: 1024,
      contentType: "image/webp",
      createdAt: "2024-01-21T12:00:00Z",
    }),
  };

  const mockRetentionService = {
    deleteFile: vi
      .fn()
      .mockResolvedValue({ deleted: true, path: "users/user123/file.mp4" }),
    deleteFiles: vi
      .fn()
      .mockResolvedValue({ deleted: 2, failed: 0, details: [] }),
    listUserFiles: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    getUserStorageUsage: vi.fn().mockResolvedValue({ totalBytes: 0 }),
  };

  const service = new StorageService({
    storage: mockStorage as unknown as any,
    signedUrlService: mockSignedUrlService as unknown as any,
    uploadService: mockUploadService as unknown as any,
    retentionService: mockRetentionService as unknown as any,
  });

  return {
    service,
    mockSignedUrlService,
    mockUploadService,
    mockRetentionService,
  };
};

describe("StorageService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns upload URL for valid type and content type", async () => {
    const { service, mockSignedUrlService } = buildStorageService();
    const result = await service.getUploadUrl(
      "user123",
      "preview-image",
      "image/webp",
    );

    expect(result).toHaveProperty("uploadUrl");
    expect(result.storagePath).toContain("users/user123/previews/images/");
    expect(mockSignedUrlService.getUploadUrl).toHaveBeenCalled();
  });

  it("rejects invalid storage type", async () => {
    const { service } = buildStorageService();
    await expect(
      service.getUploadUrl("user123", "invalid-type" as never, "image/webp"),
    ).rejects.toThrow("Invalid storage type");
  });

  it("rejects invalid content type", async () => {
    const { service } = buildStorageService();
    await expect(
      service.getUploadUrl("user123", "preview-image", "application/pdf"),
    ).rejects.toThrow("Invalid content type");
  });

  it("rejects access to other user files", async () => {
    const { service } = buildStorageService();
    await expect(
      service.getViewUrl("user123", "users/otheruser/generations/123-abc.mp4"),
    ).rejects.toMatchObject({
      message: "Unauthorized - cannot access files belonging to other users",
      statusCode: 403,
    });
  });

  it("resolves an opaque reference only within the requesting owner namespace", async () => {
    const { service, mockSignedUrlService } = buildStorageService();

    const result = await service.getOwnedMediaViewUrl(
      "user123",
      "om1.preview-image.preview.webp",
    );

    expect(mockSignedUrlService.getViewUrl).toHaveBeenCalledWith(
      "users/user123/previews/images/preview.webp",
    );
    expect(result.mediaRef).toBe("om1.preview-image.preview.webp");
  });

  it("rejects a legacy reference outside the requesting owner namespace", async () => {
    const { service } = buildStorageService();

    await expect(
      service.getOwnedMediaViewUrl(
        "user123",
        "users/otheruser/previews/images/preview.webp",
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects download URL requests for non-owned files with 403", async () => {
    const { service } = buildStorageService();
    await expect(
      service.getDownloadUrl(
        "user123",
        "users/otheruser/generations/123-abc.mp4",
      ),
    ).rejects.toMatchObject({
      message: "Unauthorized - cannot access files belonging to other users",
      statusCode: 403,
    });
  });

  // Issue #118: the vector lane, and the XSS-safe way it is served.
  describe("vector (SVG) storage and serving", () => {
    it("accepts image/svg+xml under the vector lane and names a .svg object", async () => {
      const { service } = buildStorageService();
      const result = await service.getUploadUrl(
        "user123",
        "preview-vector",
        "image/svg+xml",
      );
      expect(result.storagePath).toContain("users/user123/previews/vectors/");
      expect(result.storagePath.endsWith(".svg")).toBe(true);
    });

    it("keeps the vector lane SVG-only — a raster mime is rejected", async () => {
      const { service } = buildStorageService();
      await expect(
        service.getUploadUrl("user123", "preview-vector", "image/png"),
      ).rejects.toThrow("Invalid content type");
    });

    it("keeps the raster preview-image lane raster-only — SVG still rejected", async () => {
      // preview-image must stay raster: the first-frame ARMABLE gate derives
      // from it, so widening it would let a vector be armed as a frame (#118).
      const { service } = buildStorageService();
      await expect(
        service.getUploadUrl("user123", "preview-image", "image/svg+xml"),
      ).rejects.toThrow("Invalid content type");
    });

    it("serves a stored vector as an attachment so it cannot execute script inline", async () => {
      // SECURITY (#118): a signed view URL for an SVG carries
      // Content-Disposition: attachment, so a direct open downloads rather
      // than renders — the only way an SVG's <script>/onload could run.
      const { service, mockSignedUrlService } = buildStorageService();
      await service.getViewUrl(
        "user123",
        "users/user123/previews/vectors/1758100000000-abcdef01.svg",
      );
      expect(mockSignedUrlService.getViewUrl).toHaveBeenCalledWith(
        "users/user123/previews/vectors/1758100000000-abcdef01.svg",
        "attachment",
      );
    });

    it("serves raster images inline, unchanged", async () => {
      const { service, mockSignedUrlService } = buildStorageService();
      await service.getViewUrl(
        "user123",
        "users/user123/previews/images/1758100000000-abcdef01.webp",
      );
      expect(mockSignedUrlService.getViewUrl).toHaveBeenCalledWith(
        "users/user123/previews/images/1758100000000-abcdef01.webp",
        "inline",
      );
    });
  });
});
