import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { HistoryThumbnail } from "../components/HistoryThumbnail";
import { getImageAssetViewUrl } from "@/features/preview/api/previewApi";

/**
 * Regression: session thumbnails whose asset fetch errors (e.g. storage 403)
 * rendered as blank tiles — the letter-avatar fallback only covered no-asset
 * sessions, not failed fetches.
 *
 * Failure boundary: UI component (the thumbnail tile in the Sessions panel).
 * Mock boundary: the preview/storage view-url API wrappers (the wire) — the
 * real useResolvedMediaUrl hook and real MediaUrlResolver pipeline run.
 * Invariant: for any thumbnail whose <img> errors, the tile must end in the
 * letter-avatar fallback (or a retry with a genuinely different URL that
 * itself falls back on error) — never a permanently broken <img>.
 */

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

const mockedGetImageAssetViewUrl = vi.mocked(getImageAssetViewUrl);

/**
 * A view-url response whose signed URL expires inside MediaUrlResolver's
 * 2-minute safety window, so the resolver cache is immediately stale and the
 * onError refresh goes back to the wire instead of replaying the cache.
 */
const staleSignedResponse = (
  assetId: string,
  viewUrl: string,
): {
  success: true;
  data: { viewUrl: string; expiresAt: string; assetId: string };
} => ({
  success: true,
  data: {
    viewUrl,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    assetId,
  },
});

const transientError = (status: number): Error =>
  Object.assign(new Error(`Transient failure ${status}`), { status });

async function renderThumbnailWithResolvedSrc(options: {
  assetId: string;
  rawUrl: string;
  signedUrl: string;
  label: string;
}): Promise<HTMLElement> {
  render(
    <HistoryThumbnail
      src={options.rawUrl}
      assetId={options.assetId}
      label={options.label}
      size="md"
      variant="muted"
    />,
  );

  const img = await screen.findByRole("img", { name: options.label });
  await waitFor(() => expect(img).toHaveAttribute("src", options.signedUrl));
  return img;
}

describe("regression: failed thumbnail fetches fall back to the letter avatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the letter avatar when the refresh attempt fails transiently (no new URL ever reaches the img)", async () => {
    // NOTE: unique asset id per test — MediaUrlResolver caches module-wide.
    const signedUrl = "https://media.example.com/thumbs/dead-refresh.png";
    mockedGetImageAssetViewUrl
      .mockResolvedValueOnce(
        staleSignedResponse("asset-dead-refresh", signedUrl),
      )
      .mockRejectedValueOnce(transientError(503));

    const img = await renderThumbnailWithResolvedSrc({
      assetId: "asset-dead-refresh",
      rawUrl: "https://media.example.com/thumbs/dead-refresh-original.png",
      signedUrl,
      label: "Dog running",
    });

    // The storage fetch for the signed URL 403s → the browser fires onerror.
    fireEvent.error(img);

    // The refresh cannot deliver a new URL to the <img> (the resolver threw),
    // so the tile must fall back to the letter avatar — not stay broken.
    expect(await screen.findByText("D")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Dog running" })).toBeNull();
  });

  it("shows the letter avatar when the refresh resolves the same dead URL", async () => {
    const signedUrl = "https://media.example.com/thumbs/same-url.png";
    mockedGetImageAssetViewUrl
      .mockResolvedValueOnce(staleSignedResponse("asset-same-url", signedUrl))
      .mockResolvedValueOnce(staleSignedResponse("asset-same-url", signedUrl));

    const img = await renderThumbnailWithResolvedSrc({
      assetId: "asset-same-url",
      rawUrl: "https://media.example.com/thumbs/same-url-original.png",
      signedUrl,
      label: "Neon alley",
    });

    fireEvent.error(img);

    expect(await screen.findByText("N")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Neon alley" })).toBeNull();
  });

  it("retries a genuinely new URL once, then falls back when that URL errors too", async () => {
    const firstUrl = "https://media.example.com/thumbs/retry-first.png";
    const secondUrl = "https://media.example.com/thumbs/retry-second.png";
    mockedGetImageAssetViewUrl
      .mockResolvedValueOnce(staleSignedResponse("asset-retry", firstUrl))
      .mockResolvedValueOnce(staleSignedResponse("asset-retry", secondUrl));

    const img = await renderThumbnailWithResolvedSrc({
      assetId: "asset-retry",
      rawUrl: "https://media.example.com/thumbs/retry-original.png",
      signedUrl: firstUrl,
      label: "Storm chase",
    });

    fireEvent.error(img);

    // The refresh produced a different URL — the img must retry it.
    const retriedImg = await screen.findByRole("img", { name: "Storm chase" });
    await waitFor(() => expect(retriedImg).toHaveAttribute("src", secondUrl));

    // The retry errors as well → the letter avatar must take over.
    fireEvent.error(retriedImg);
    expect(await screen.findByText("S")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Storm chase" })).toBeNull();
  });

  it("keeps the tile frame identical between thumbnail and fallback (no layout shift)", async () => {
    const signedUrl = "https://media.example.com/thumbs/layout.png";
    mockedGetImageAssetViewUrl
      .mockResolvedValueOnce(staleSignedResponse("asset-layout", signedUrl))
      .mockRejectedValueOnce(transientError(503));

    const img = await renderThumbnailWithResolvedSrc({
      assetId: "asset-layout",
      rawUrl: "https://media.example.com/thumbs/layout-original.png",
      signedUrl,
      label: "Quiet dawn",
    });

    const frame = img.parentElement;
    expect(frame).not.toBeNull();
    const frameClassBefore = frame?.className;

    fireEvent.error(img);
    await screen.findByText("Q");

    // Same frame element, same classes — the fallback swaps the content,
    // not the box.
    expect(frame?.isConnected).toBe(true);
    expect(frame?.className).toBe(frameClassBefore);
  });
});
