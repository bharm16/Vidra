import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { LibraryThumbnail } from "../LibraryThumbnail";

/**
 * Regression: Library covers went blank one hour after their session was
 * created. The card rendered the persisted signed GCS url verbatim; signed
 * urls expire after an hour, and only the app media proxy can rescue an
 * expired one (it re-streams from the bucket with server credentials on
 * upstream 400).
 *
 * Failure boundary: UI component (the Library card cover).
 * Mock boundary: the storage/preview view-url API wrappers (the wire) — the
 * real useResolvedMediaUrl hook and real MediaUrlResolver pipeline run.
 * Invariant: a signed GCS thumbnail url never reaches the <img> raw — every
 * paint goes through the app media proxy.
 */

vi.mock("@/api/storageApi", () => ({
  storageApi: {
    getViewUrl: vi.fn().mockRejectedValue(new Error("offline test")),
  },
}));

vi.mock("@/features/preview/api/previewApi", () => ({
  getImageAssetViewUrl: vi.fn().mockRejectedValue(new Error("offline test")),
  getVideoAssetViewUrl: vi.fn().mockRejectedValue(new Error("offline test")),
  getImageAssetViewUrlBatch: vi
    .fn()
    .mockRejectedValue(new Error("offline test")),
}));

const SIGNED_URL =
  "https://storage.googleapis.com/vidra-media-prod/image-previews/1785521699000-still.webp?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Signature=abc&X-Goog-Expires=3600";

describe("regression: Library covers render through the media proxy", () => {
  it("never hands the raw signed GCS url to the <img> — not even on first paint", async () => {
    render(
      <LibraryThumbnail
        thumbnail={{ url: SIGNED_URL }}
        label="Paper Sailboat"
      />,
    );

    // Synchronous read: this IS the first paint, before the async resolver
    // settles. The bug lived exactly here — the raw signed url rendered
    // (dead once expired) until resolution replaced it.
    const img = screen.getByAltText("Paper Sailboat");
    expect(img.getAttribute("src")).toContain("/api/storage/proxy?url=");
    expect(img.getAttribute("src")).not.toBe(SIGNED_URL);

    // The async resolver settles too (its wire mocks reject; the resolver
    // falls back to the raw url and proxies it) — the src must STAY proxied.
    await waitFor(() => {
      expect(
        screen.getByAltText("Paper Sailboat").getAttribute("src"),
      ).toContain("/api/storage/proxy?url=");
    });
  });
});
