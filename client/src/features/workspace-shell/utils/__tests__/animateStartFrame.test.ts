import { describe, expect, it } from "vitest";
import type { SpaceNode } from "@/features/space/lineage/types";
import { buildAnimateStartFrame } from "../animateStartFrame";

const pictureNode = (over: Partial<SpaceNode> & { id: string }): SpaceNode => ({
  kind: "picture",
  ancestorId: "words-v1",
  ...over,
});

describe("buildAnimateStartFrame", () => {
  // AC2 (issue #125): Make it move on a node with an EXPIRED URL must arm the
  // durable handle so the frame is recoverable, not a request against a dead URL.
  it("arms the durable handle when the node's view URL has expired", () => {
    const node = pictureNode({
      id: "gen-pic-1",
      mediaUrl: "https://signed/expired?X-Goog-Signature=dead",
      storagePath: "image-previews/owner/gen-pic-1",
      assetId: "asset-1",
      viewUrlExpiresAt: "2000-01-01T00:00:00.000Z",
    });

    const frame = buildAnimateStartFrame(node, "a lighthouse at dusk");

    expect(frame).toEqual({
      id: "space-animate-gen-pic-1",
      url: "https://signed/expired?X-Goog-Signature=dead",
      source: "generation",
      generationId: "gen-pic-1",
      storagePath: "image-previews/owner/gen-pic-1",
      assetId: "asset-1",
      viewUrlExpiresAt: "2000-01-01T00:00:00.000Z",
      sourcePrompt: "a lighthouse at dusk",
    });
  });

  // "A missing URL is recoverable, never an apparently-missing picture" — arm
  // from the handle alone; the refresh loop fills the URL from storagePath.
  it("arms from the handle alone when the node has no URL", () => {
    const frame = buildAnimateStartFrame(
      pictureNode({
        id: "gen-pic-2",
        storagePath: "image-previews/owner/gen-pic-2",
      }),
    );

    expect(frame).toMatchObject({
      id: "space-animate-gen-pic-2",
      url: "",
      generationId: "gen-pic-2",
      storagePath: "image-previews/owner/gen-pic-2",
    });
  });

  it("refuses to arm a node with neither a URL nor a handle", () => {
    expect(buildAnimateStartFrame(pictureNode({ id: "gen-pic-3" }))).toBeNull();
  });

  it("arms the URL and take id when a node carries no handle (unchanged legacy path)", () => {
    const frame = buildAnimateStartFrame(
      pictureNode({ id: "gen-pic-4", mediaUrl: "https://img/live.webp" }),
    );

    expect(frame).toMatchObject({
      url: "https://img/live.webp",
      generationId: "gen-pic-4",
    });
    expect(frame).not.toHaveProperty("storagePath");
    expect(frame).not.toHaveProperty("assetId");
  });
});
