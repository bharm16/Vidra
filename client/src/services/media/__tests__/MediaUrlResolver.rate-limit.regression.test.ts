import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveMediaUrl } from "../MediaUrlResolver";
import { getMediaReferenceViewUrl } from "@/features/preview/api/previewApi";

vi.mock("@/features/preview/api/previewApi", () => ({
  getMediaReferenceViewUrl: vi.fn(),
  getImageAssetViewUrlBatch: vi.fn(),
}));

describe("regression: media URL resolver retries after transient rate limits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not cache 429 failures for preview asset resolution", async () => {
    const rateLimitedError = Object.assign(new Error("Too many requests"), {
      status: 429,
    });

    (getMediaReferenceViewUrl as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(rateLimitedError)
      .mockResolvedValueOnce({
        success: true,
        data: {
          viewUrl: "https://storage.example.com/image-previews/asset-429",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          mediaRef: "asset-429",
          source: "preview",
        },
      });

    await expect(
      resolveMediaUrl({
        kind: "image",
        assetId: "asset-429",
      }),
    ).rejects.toMatchObject({ status: 429 });

    const result = await resolveMediaUrl({
      kind: "image",
      assetId: "asset-429",
    });

    expect(getMediaReferenceViewUrl).toHaveBeenCalledTimes(2);
    expect(result.url).toBe(
      "https://storage.example.com/image-previews/asset-429",
    );
    expect(result.source).toBe("preview");
  });
});
