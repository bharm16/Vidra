import { describe, expect, it } from "vitest";
import { resolveTakePosterUrl } from "../takePosterUrl";

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
