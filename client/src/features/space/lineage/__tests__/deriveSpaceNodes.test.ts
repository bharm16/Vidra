import { describe, expect, it } from "vitest";
import { deriveSpaceNodes } from "../deriveSpaceNodes";

/**
 * Adapter from the session's live generations to the space's lineage nodes.
 * The lineage is derived here for the current session (ADR-0013 persists it
 * later); the mapping stays a pure transform so it is fully testable.
 */
describe("deriveSpaceNodes", () => {
  it("builds a words root, a picture, and a clip from real generations", () => {
    const nodes = deriveSpaceNodes({
      prompt: "a cat on a couch",
      promptVersionId: "v1",
      generations: [
        {
          id: "img1",
          mediaType: "image",
          status: "completed",
          thumbnailUrl: "https://x/pic.png",
        },
        {
          id: "vid1",
          mediaType: "video",
          status: "generating",
          thumbnailUrl: "https://x/clip.png",
        },
      ],
    });
    expect(nodes.find((n) => n.kind === "words")).toMatchObject({
      ancestorId: null,
      label: "a cat on a couch",
    });
    expect(nodes.find((n) => n.id === "img1")).toMatchObject({
      kind: "picture",
      status: "ready",
      mediaUrl: "https://x/pic.png",
    });
    // The clip links to the picture (its derived source) and is still forming.
    expect(nodes.find((n) => n.id === "vid1")).toMatchObject({
      kind: "clip",
      ancestorId: "img1",
      status: "forming",
    });
  });

  it("maps a failed generation to a failed node", () => {
    const nodes = deriveSpaceNodes({
      prompt: "x",
      promptVersionId: "v1",
      generations: [{ id: "img1", mediaType: "image", status: "failed" }],
    });
    expect(nodes.find((n) => n.id === "img1")?.status).toBe("failed");
  });

  it("is just the words root when there are no generations yet", () => {
    const nodes = deriveSpaceNodes({
      prompt: "x",
      promptVersionId: "v1",
      generations: [],
    });
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ kind: "words", ancestorId: null });
  });
});
