import { describe, it, expect, vi, beforeEach } from "vitest";
import { SignedUrlMinter } from "@infrastructure/signedUrl/SignedUrlMinter";
import { SignedUrlService } from "../services/SignedUrlService";

const buildService = () => {
  const mockFile = {
    getSignedUrl: vi
      .fn()
      .mockResolvedValue(["https://storage.googleapis.com/signed"]),
    exists: vi.fn().mockResolvedValue([true]),
  };
  const mockBucket = {
    file: vi.fn().mockReturnValue(mockFile),
  };

  const service = new SignedUrlService(
    new SignedUrlMinter(mockBucket as unknown as never),
  );
  return { service, mockFile };
};

describe("SignedUrlService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates upload URL with write action", async () => {
    const { service, mockFile } = buildService();
    const result = await service.getUploadUrl(
      "users/user123/file.webp",
      "image/webp",
      1024,
    );

    expect(result.uploadUrl).toBeDefined();
    expect(mockFile.getSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({ action: "write", contentType: "image/webp" }),
    );
  });

  it("generates a view URL with read action", async () => {
    const { service, mockFile } = buildService();
    const result = await service.getViewUrl("users/user123/missing.mp4");

    expect(result.viewUrl).toBeDefined();
    expect(mockFile.getSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "read",
        responseDisposition: "inline",
      }),
    );
  });
});
