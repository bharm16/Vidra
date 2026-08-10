import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UploadService } from "../services/UploadService";

const buildService = () => {
  const mockFile = {
    save: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue([true]),
    getMetadata: vi.fn().mockResolvedValue([
      {
        size: "256",
        contentType: "image/webp",
        timeCreated: "2024-01-21T12:00:00Z",
      },
    ]),
  };
  const mockBucket = {
    file: vi.fn().mockReturnValue(mockFile),
  };
  const mockStorage = {
    bucket: vi.fn().mockReturnValue(mockBucket),
  };

  const service = new UploadService(mockStorage as unknown as any);
  return { service, mockFile };
};

describe("UploadService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uploads a buffer and returns metadata", async () => {
    const { service, mockFile } = buildService();
    const buffer = Buffer.from("test");

    const result = await service.uploadFromBuffer(
      buffer,
      "user123",
      "preview-image",
      "image/webp",
      { model: "flux" },
    );

    expect(result.storagePath).toContain("users/user123/previews/images/");
    expect(result.sizeBytes).toBe(buffer.length);
    expect(mockFile.save).toHaveBeenCalled();
  });

  it("rejects uploadFromUrl with invalid content type", async () => {
    const { service } = buildService();
    const originalFetch = globalThis.fetch;

    (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/pdf" }),
        body: null,
      });

    try {
      await expect(
        service.uploadFromUrl(
          "https://example.com/file.pdf",
          "user123",
          "generation",
        ),
      ).rejects.toThrow("Invalid content type");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects confirmUpload for non-owned path", async () => {
    const { service } = buildService();
    await expect(
      service.confirmUpload("users/otheruser/file.mp4", "user123"),
    ).rejects.toMatchObject({
      message: "Unauthorized - file does not belong to user",
      statusCode: 403,
    });
  });
});
