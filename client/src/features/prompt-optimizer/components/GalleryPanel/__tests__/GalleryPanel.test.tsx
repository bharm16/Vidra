import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GalleryPanel } from "../GalleryPanel";
import type { GalleryGeneration } from "../types";

vi.mock("@/hooks/useResolvedMediaUrl", () => ({
  useResolvedMediaUrl: ({ url }: { url?: string | null }) => ({
    url: url ?? null,
  }),
}));

const makeGeneration = (
  id: string,
  overrides: Partial<GalleryGeneration> = {},
): GalleryGeneration => ({
  id,
  tier: "render",
  thumbnailUrl: "https://example.com/thumb.jpg",
  mediaUrl: "https://example.com/video.mp4",
  mediaType: "video",
  prompt: "A cinematic shot",
  model: "Sora",
  createdAt: Date.now(),
  isFavorite: false,
  generationSettings: null,
  ...overrides,
});

describe("GalleryPanel", () => {
  it("renders all generations and selects one", () => {
    const onSelectGeneration = vi.fn();
    const generations = [
      makeGeneration("g-1", { mediaType: "image-sequence" }),
      makeGeneration("g-2", { tier: "draft" }),
      makeGeneration("g-3", { tier: "render" }),
    ];

    render(
      <GalleryPanel
        generations={generations}
        activeGenerationId={null}
        onSelectGeneration={onSelectGeneration}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("gallery-thumbnail-g-1")).toBeInTheDocument();
    expect(screen.getByTestId("gallery-thumbnail-g-2")).toBeInTheDocument();
    expect(screen.getByTestId("gallery-thumbnail-g-3")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("gallery-thumbnail-g-2"));
    expect(onSelectGeneration).toHaveBeenCalledWith("g-2");
  });

  it("renders all tiers in compact mode without filter controls", () => {
    const generations = [
      makeGeneration("storyboard-1", { mediaType: "image-sequence" }),
      makeGeneration("draft-1", { tier: "draft" }),
      makeGeneration("favorite-1", { isFavorite: true }),
    ];

    render(
      <GalleryPanel
        generations={generations}
        activeGenerationId={null}
        onSelectGeneration={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId("gallery-thumbnail-storyboard-1"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("gallery-thumbnail-draft-1")).toBeInTheDocument();
    expect(
      screen.getByTestId("gallery-thumbnail-favorite-1"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Preview" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Draft" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "★" })).not.toBeInTheDocument();
  });

  it("does not render a close button in compact mode", () => {
    const onClose = vi.fn();
    render(
      <GalleryPanel
        generations={[makeGeneration("g-1")]}
        activeGenerationId={null}
        onSelectGeneration={vi.fn()}
        onClose={onClose}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Close gallery" }),
    ).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders video fallback thumbnail when image thumbnail is missing", () => {
    render(
      <GalleryPanel
        generations={[
          makeGeneration("video-1", {
            mediaType: "video",
            thumbnailUrl: null,
            mediaUrl: "/api/preview/video/content/asset-1",
          }),
        ]}
        activeGenerationId={null}
        onSelectGeneration={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const card = screen.getByTestId("gallery-thumbnail-video-1");
    expect(card.querySelector("video")).not.toBeNull();
  });
});
