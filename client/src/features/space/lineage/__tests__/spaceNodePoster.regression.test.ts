import { describe, expect, it } from "vitest";
import { deriveSpaceNodesFromVersions } from "../deriveSpaceNodes";

/**
 * Regression: a clip's own video URL is never its still.
 *
 * The gallery learned this rule once, but three other surfaces recomputed
 * "the still for this take" as `thumbnailUrl ?? mediaUrls[0]` without it. The
 * space is the default-on path (FEATURES.SPACE_LINEAGE) and renders a node's
 * `mediaUrl` straight into an <img src>, so a clip with no poster showed a
 * broken tile; Continue Scene fed the same expression to setStartFrame, so a
 * clip could be seeded as a *first frame* (covered at that seam by
 * CanvasWorkspace.tune-and-continue.regression). The invariant below is now
 * owned by one module, and every surface resolves its poster through it.
 */
describe("regression: a clip's video URL is not a still", () => {
  const clipWithNoStill = {
    id: "clip-1",
    mediaType: "video",
    status: "completed",
    mediaUrls: ["https://storage.example.com/users/u1/generations/clip.mp4"],
    ancestorGenerationId: "pic-1",
  };

  it("gives a poster-less clip no mediaUrl on the space path", () => {
    const nodes = deriveSpaceNodesFromVersions([
      {
        versionId: "v1",
        prompt: "a dancer",
        generations: [
          {
            id: "pic-1",
            mediaType: "image",
            status: "completed",
            mediaUrls: [
              "https://storage.example.com/users/u1/previews/pic.webp",
            ],
          },
          clipWithNoStill,
        ],
      },
    ]);

    const clipNode = nodes.find((node) => node.id === "clip-1");
    expect(clipNode?.kind).toBe("clip");
    expect(clipNode?.mediaUrl).toBeUndefined();
    // The picture is unaffected — its media URL *is* its still.
    expect(nodes.find((node) => node.id === "pic-1")?.mediaUrl).toBe(
      "https://storage.example.com/users/u1/previews/pic.webp",
    );
  });

  it("keeps a clip that does have a still", () => {
    const nodes = deriveSpaceNodesFromVersions([
      {
        versionId: "v1",
        prompt: "a dancer",
        generations: [
          {
            ...clipWithNoStill,
            thumbnailUrl:
              "https://storage.example.com/users/u1/previews/last.webp",
          },
        ],
      },
    ]);

    expect(nodes.find((node) => node.id === "clip-1")?.mediaUrl).toBe(
      "https://storage.example.com/users/u1/previews/last.webp",
    );
  });
});
