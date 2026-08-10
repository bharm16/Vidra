import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveMediaUrl } from "../MediaUrlResolver";
import { getMediaReferenceViewUrl } from "@/features/preview/api/previewApi";

vi.mock("@/features/preview/api/previewApi", () => ({
  getMediaReferenceViewUrl: vi.fn(),
  getImageAssetViewUrlBatch: vi.fn(),
}));

describe("MediaUrlResolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves opaque owned-media references through one endpoint", async () => {
    (getMediaReferenceViewUrl as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        viewUrl: "https://storage.example.com/users/user123/preview.webp",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        mediaRef: "om1.preview-image.preview.webp",
        source: "owned",
      },
    });

    const result = await resolveMediaUrl({
      kind: "image",
      mediaRef: "om1.preview-image.preview.webp",
    });

    expect(getMediaReferenceViewUrl).toHaveBeenCalledWith(
      "om1.preview-image.preview.webp",
      "image",
    );
    expect(result.url).toBe(
      "https://storage.example.com/users/user123/preview.webp",
    );
    expect(result.source).toBe("storage");
    expect(result.mediaRef).toBe("om1.preview-image.preview.webp");
  });

  it("refreshes a preview asset by its explicit reference", async () => {
    (getMediaReferenceViewUrl as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        viewUrl: "https://storage.example.com/video-previews/asset-123",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        mediaRef: "asset-123",
        source: "preview",
      },
    });

    const expiredUrl =
      "https://storage.googleapis.com/vidra-media-prod/video-previews/asset-123?GoogleAccessId=test&Expires=1&Signature=deadbeef";

    const result = await resolveMediaUrl({
      kind: "video",
      url: expiredUrl,
      mediaRef: "asset-123",
    });

    expect(getMediaReferenceViewUrl).toHaveBeenCalledWith("asset-123", "video");
    expect(result.url).toBe(
      "https://storage.example.com/video-previews/asset-123",
    );
    expect(result.source).toBe("preview");
  });

  it("returns proxied URL when not expired and preferFresh is false", async () => {
    const freshUrl =
      "https://storage.googleapis.com/vidra-media-prod/image-previews/asset-999?GoogleAccessId=test&Expires=4102444800&Signature=deadbeef";

    const result = await resolveMediaUrl({
      kind: "image",
      url: freshUrl,
      preferFresh: false,
    });

    expect(getMediaReferenceViewUrl).not.toHaveBeenCalled();
    // GCS signed URLs are rewritten through the media proxy to avoid ORB
    expect(result.url).toContain("/api/storage/proxy?url=");
    expect(result.url).toContain(encodeURIComponent("storage.googleapis.com"));
    expect(result.source).toBe("raw");
  });

  it("does not extract a storage path from protected preview content URLs", async () => {
    const result = await resolveMediaUrl({
      kind: "video",
      url: "/api/preview/video/content/users/user123/generations/generated.mp4",
    });

    expect(getMediaReferenceViewUrl).not.toHaveBeenCalled();
    expect(result.url).toBeNull();
    expect(result.source).toBe("unknown");
  });

  it("does not fall back to protected preview content URL when asset lookup fails", async () => {
    (getMediaReferenceViewUrl as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: "Video asset not found",
    });

    const result = await resolveMediaUrl({
      kind: "video",
      url: "/api/preview/video/content/2b540a8b-e96b-4810-bfd2-8a9e9b1fade6",
      assetId: "2b540a8b-e96b-4810-bfd2-8a9e9b1fade6",
    });

    expect(getMediaReferenceViewUrl).toHaveBeenCalledWith(
      "2b540a8b-e96b-4810-bfd2-8a9e9b1fade6",
      "video",
    );
    expect(result.url).toBeNull();
    expect(result.source).toBe("unknown");
  });

  it("sends a legacy path to the server migration boundary without parsing it", async () => {
    (getMediaReferenceViewUrl as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: "Video asset not found",
    });

    const result = await resolveMediaUrl({
      kind: "video",
      storagePath: "users/user123/generations/generated.mp4",
    });

    expect(getMediaReferenceViewUrl).toHaveBeenCalledWith(
      "users/user123/generations/generated.mp4",
      "video",
    );
    expect(result.url).toBeNull();
    expect(result.source).toBe("unknown");
  });
});
