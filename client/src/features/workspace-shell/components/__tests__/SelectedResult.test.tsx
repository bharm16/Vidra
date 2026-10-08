import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SelectedResult } from "../SelectedResult";
import type { GalleryGeneration } from "../../types/result";

const resolveMedia = vi.hoisted(() => vi.fn());
vi.mock("@/services/media/MediaUrlResolver", () => ({
  resolveMediaUrl: resolveMedia,
}));
vi.mock("@components/Toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));
const writeText = vi.fn();
const result: GalleryGeneration = {
  id: "take-1",
  tier: "render",
  mediaType: "video",
  mediaUrl: "https://example.com/take.mp4",
  thumbnailUrl: "https://example.com/poster.jpg",
  prompt: "Saved direction",
  model: "Wan",
  duration: "5s",
  aspectRatio: "16:9",
  createdAt: 1000,
  isFavorite: false,
  generationSettings: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  resolveMedia.mockImplementation(async ({ url }: { url?: string | null }) => ({
    url: url ?? null,
    expiresAt: null,
  }));
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  writeText.mockResolvedValue(undefined);
});
const actions = (): {
  onClose: ReturnType<typeof vi.fn>;
  onReuse: ReturnType<typeof vi.fn>;
  onToggleFavorite: ReturnType<typeof vi.fn>;
  onDownload: ReturnType<typeof vi.fn>;
  onShare: ReturnType<typeof vi.fn>;
} => ({
  onClose: vi.fn(),
  onReuse: vi.fn(),
  onToggleFavorite: vi.fn(),
  onDownload: vi.fn(),
  onShare: vi.fn(),
});
describe("selected result", () => {
  it("keeps inspection, details and copying separate from explicit setup reuse", async () => {
    const callbacks = actions();
    render(<SelectedResult generation={result} {...callbacks} />);
    await screen.findByRole("button", { name: "Play video" });
    expect(callbacks.onReuse).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(
      screen.getByRole("dialog", { name: "Result details" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Saved direction")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("Saved direction"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(callbacks.onReuse).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reuse setup" }));
    expect(callbacks.onReuse).toHaveBeenCalledOnce();
  });
  it("retains favorite, download and public sharing on the selected take", async () => {
    const callbacks = actions();
    render(<SelectedResult generation={result} {...callbacks} />);
    await screen.findByRole("button", { name: "Play video" });
    fireEvent.click(screen.getByRole("button", { name: "Favorite" }));
    expect(callbacks.onToggleFavorite).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(callbacks.onDownload).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(callbacks.onShare).toHaveBeenCalledOnce();
  });
  it.each([
    {
      mediaUrl: "https://expired.example.com/old.mp4",
      mediaAssetId: "video-asset",
    },
    { mediaUrl: null, mediaAssetId: "video-asset" },
  ])("downloads the recovered media URL for $mediaUrl", async (saved) => {
    const callbacks = actions();
    resolveMedia.mockImplementation(
      async ({ kind, url }: { kind: string; url?: string | null }) => ({
        url:
          kind === "video"
            ? "https://current.example.com/recovered.mp4"
            : (url ?? null),
        expiresAt: null,
      }),
    );
    render(
      <SelectedResult generation={{ ...result, ...saved }} {...callbacks} />,
    );
    await screen.findByRole("button", { name: "Play video" });
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(callbacks.onDownload).toHaveBeenCalledWith(
      "https://current.example.com/recovered.mp4",
    );
  });
  it("opens fullscreen media and returns to the same selected take", async () => {
    render(<SelectedResult generation={result} {...actions()} />);
    await screen.findByRole("button", { name: "Play video" });
    fireEvent.click(screen.getByRole("button", { name: "Fullscreen" }));
    expect(
      screen.getByRole("dialog", { name: "Fullscreen result" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close fullscreen" }));
    expect(
      screen.getByRole("region", { name: "Selected result" }),
    ).toBeInTheDocument();
  });
  it.each([
    { mediaType: "image" as const, mediaUrl: "https://example.com/image.jpg" },
    { mediaType: "video" as const, mediaUrl: null },
  ])(
    "shows no playback for nonplayable media: $mediaType $mediaUrl",
    async (media) => {
      render(
        <SelectedResult generation={{ ...result, ...media }} {...actions()} />,
      );
      await screen.findByRole("img", { name: "Selected result" });
      expect(screen.queryByRole("button", { name: "Play video" })).toBeNull();
      expect(
        screen.queryByRole("slider", { name: "Playback position" }),
      ).toBeNull();
    },
  );
});
