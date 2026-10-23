import { describe, it, expect, vi, beforeEach } from "vitest";
import { SignedUrlMinter } from "@infrastructure/signedUrl/SignedUrlMinter";
import { SignedUrlService } from "../services/SignedUrlService";

const logs = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock("@infrastructure/Logger", () => ({ logger: { ...logs, child: () => logs } }));

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

  it.each(["users/api-key:retired-test-secret/generations/clip.mp4", `users/api-key:v1:${"a".repeat(64)}/generations/clip.mp4`, "users/api-key-v1:not-a-principal/generations/clip.mp4"])("refuses unsafe API-key paths before logging or signing", async path => {
    const { service, mockFile } = buildService();
    await expect(service.getUploadUrl(path, "video/mp4")).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    await expect(service.getViewUrl(path)).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    await expect(service.getViewUrlIfPresent(path)).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    await expect(service.getDownloadUrl(path)).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(mockFile.getSignedUrl).not.toHaveBeenCalled();
    expect(JSON.stringify([logs.debug.mock.calls, logs.info.mock.calls, logs.error.mock.calls])).not.toContain(path);
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
});
