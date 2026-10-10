/**
 * Regression test: GCS signed URLs must be rewritten through the media proxy.
 *
 * When the server returns a raw storage.googleapis.com signed URL, the client
 * must rewrite it to /api/storage/proxy?url=... so the browser loads media
 * from the app origin, avoiding ORB (Opaque Response Blocking) failures
 * caused by missing CORS headers on GCS responses.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveMediaUrl } from "../MediaUrlResolver";

vi.mock("@/api/storageApi", () => ({
  storageApi: {
    getViewUrl: vi.fn(),
  },
}));

vi.mock("@/features/preview/api/previewApi", () => ({
  getImageAssetViewUrl: vi.fn(),
  getVideoAssetViewUrl: vi.fn(),
  getImageAssetViewUrlBatch: vi.fn(),
}));

const futureExpiry =
  new Date(Date.now() + 10 * 60 * 1000)
    .toISOString()
    .replace(/[-:]/g, "")
    .slice(0, 15) + "Z";

describe("regression: GCS signed URLs are rewritten to media proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rewrites a valid GCS signed URL through the proxy", async () => {
    const gcsUrl = `https://storage.googleapis.com/my-bucket/users/u1/img.webp?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Expires=900&X-Goog-Date=${futureExpiry}&X-Goog-Signature=abc123`;

    const result = await resolveMediaUrl({
      kind: "image",
      url: gcsUrl,
      preferFresh: false,
    });

    expect(result.url).toContain("/api/storage/proxy?url=");
    expect(result.url).toContain(encodeURIComponent("storage.googleapis.com"));
    expect(result.url).not.toBe(gcsUrl);
  });
});
