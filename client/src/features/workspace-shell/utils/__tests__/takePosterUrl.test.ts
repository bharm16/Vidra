import { describe, expect, it } from "vitest";
import { isLikelyVideoUrl, resolveTakePosterUrl } from "../takePosterUrl";

/**
 * The still for a take. These cases moved here from the gallery's own tests
 * when the rule became a module — the gallery, the space's lineage nodes, the
 * canvas tiles and Continue Scene all resolve their poster through this one
 * function, so the rule is proven once and every surface inherits it.
 */
describe("resolveTakePosterUrl", () => {
  it("does not use a raw video URL as a clip's still", () => {
    expect(
      resolveTakePosterUrl({
        mediaType: "video",
        status: "completed",
        thumbnailUrl: null,
        mediaUrls: [
          "/api/preview/video/content/users/u1/generations/video.mp4",
        ],
      }),
    ).toBeNull();
  });

  it("ignores a video-like thumbnail URL on a clip", () => {
    expect(
      resolveTakePosterUrl({
        mediaType: "video",
        status: "completed",
        thumbnailUrl:
          "/api/preview/video/content/users/u1/generations/video.mp4",
        mediaUrls: [
          "https://storage.example.com/users/u1/generations/video.mp4",
        ],
      }),
    ).toBeNull();
  });

  it("uses a clip's real still when it has one", () => {
    expect(
      resolveTakePosterUrl({
        mediaType: "video",
        status: "completed",
        thumbnailUrl: "https://storage.example.com/users/u1/previews/last.webp",
        mediaUrls: [
          "https://storage.example.com/users/u1/generations/video.mp4",
        ],
      }),
    ).toBe("https://storage.example.com/users/u1/previews/last.webp");
  });

  it("still falls back to the media URL for a picture", () => {
    expect(
      resolveTakePosterUrl({
        mediaType: "image",
        status: "completed",
        thumbnailUrl: null,
        mediaUrls: [
          "https://storage.example.com/users/u1/previews/images/preview.webp",
        ],
      }),
    ).toBe("https://storage.example.com/users/u1/previews/images/preview.webp");
  });

  it("uses the version preview when a completed take has no still of its own", () => {
    expect(
      resolveTakePosterUrl(
        {
          mediaType: "video",
          status: "completed",
          thumbnailUrl: null,
          mediaUrls: ["/api/preview/video/content/asset-1"],
        },
        "https://storage.example.com/users/u1/previews/images/version-thumb.webp",
      ),
    ).toBe(
      "https://storage.example.com/users/u1/previews/images/version-thumb.webp",
    );
  });

  it("withholds the version preview while a take is still in flight", () => {
    expect(
      resolveTakePosterUrl(
        {
          mediaType: "image-sequence",
          status: "pending",
          thumbnailUrl: null,
          mediaUrls: [],
        },
        "https://storage.example.com/users/u1/previews/images/version-thumb.webp",
      ),
    ).toBeNull();
  });

  it("is null when a take has nothing to show yet", () => {
    expect(
      resolveTakePosterUrl({ mediaType: "image", status: "pending" }),
    ).toBeNull();
  });
});

/**
 * Regression: legacy session records wrote the clip's mp4 into preview
 * fields wrapped in the storage proxy, hiding the extension behind percent-
 * encoding (/api/storage/proxy?url=...%2Fclip.mp4%3FX-Goog...). A plain
 * extension scan missed it, so the "a clip is never a still" rule leaked
 * broken <img> covers onto the Library and the space.
 */
describe("isLikelyVideoUrl (proxied media)", () => {
  const PROXIED_MP4 =
    "/api/storage/proxy?url=https%3A%2F%2Fstorage.googleapis.com%2Fvidra-media-prod%2Fusers%2Fu1%2Fgenerations%2F1785521699821-abc.mp4%3FX-Goog-Algorithm%3DGOOG4-RSA-SHA256%26X-Goog-Expires%3D3600";

  it("recognizes a storage-proxied mp4 as video", () => {
    expect(isLikelyVideoUrl(PROXIED_MP4)).toBe(true);
  });

  it("still passes a storage-proxied image through", () => {
    expect(
      isLikelyVideoUrl(
        "/api/storage/proxy?url=https%3A%2F%2Fstorage.googleapis.com%2Fvidra-media-prod%2Fusers%2Fu1%2Fframes%2Fframe.webp%3FX-Goog-Expires%3D3600",
      ),
    ).toBe(false);
  });

  it("rejects a proxied mp4 offered as a clip's version preview", () => {
    expect(
      resolveTakePosterUrl(
        {
          mediaType: "video",
          status: "completed",
          thumbnailUrl: null,
          mediaUrls: ["/api/preview/video/content/asset-1"],
        },
        PROXIED_MP4,
      ),
    ).toBeNull();
  });
});
