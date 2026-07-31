import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TheSpace } from "../TheSpace";
import type { SpaceNode } from "@/features/space/lineage/types";

/**
 * Regression: a signed GCS URL must never reach a space node's <img> raw.
 *
 * 1. Failure boundary: UI component — the space node body's img src.
 * 2. Mock boundary: none; pure render in jsdom.
 * 3. Invariant: for any node whose mediaUrl is a GCS-signed URL, the space
 *    renders the app media proxy URL, never the raw signed URL.
 *
 * Signed GCS URLs expire after one hour, and the media proxy is the only
 * consumer-side path with a rescue (it re-streams from the bucket with server
 * credentials on upstream 400). The space rendered node.mediaUrl verbatim, so
 * reopening a session more than an hour after its frame was generated showed
 * a dead <img> tile on the IMAGE node while the clip's poster — which arrives
 * already proxied — kept working next to it.
 */

const SIGNED_URL =
  "https://storage.googleapis.com/vidra-media-prod/users/u1/previews/images/frame.webp" +
  "?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Signature=abc123&X-Goog-Expires=3600";

const PROXIED_URL = `/api/storage/proxy?url=${encodeURIComponent("https://storage.googleapis.com/vidra-media-prod/users/u1/previews/images/poster.webp?X-Goog-Signature=def456")}`;

function nodesWithPicture(mediaUrl: string): SpaceNode[] {
  return [
    { id: "w", kind: "words", ancestorId: null, label: "a fox on snow" },
    { id: "p", kind: "picture", ancestorId: "w", status: "ready", mediaUrl },
  ];
}

function renderedImgSrc(): string {
  const node = screen.getByTestId("space-node-p");
  const img = node.querySelector("img");
  expect(img).not.toBeNull();
  return img!.getAttribute("src") ?? "";
}

describe("regression: space nodes never render raw signed GCS media URLs", () => {
  it("a signed GCS mediaUrl renders through the app media proxy", () => {
    render(<TheSpace nodes={nodesWithPicture(SIGNED_URL)} liveNodeId="p" />);

    const src = renderedImgSrc();
    expect(src.startsWith("/api/storage/proxy?url=")).toBe(true);
    expect(src).toContain(encodeURIComponent(SIGNED_URL));
  });

  it("an already-proxied mediaUrl is not double-wrapped", () => {
    render(<TheSpace nodes={nodesWithPicture(PROXIED_URL)} liveNodeId="p" />);

    expect(renderedImgSrc()).toBe(PROXIED_URL);
  });

  it("a non-GCS mediaUrl passes through untouched", () => {
    render(
      <TheSpace nodes={nodesWithPicture("blob:local-object")} liveNodeId="p" />,
    );

    expect(renderedImgSrc()).toBe("blob:local-object");
  });
});
