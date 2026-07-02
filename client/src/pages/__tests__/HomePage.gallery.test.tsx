/**
 * Gallery landing states (ADR-0008, design-overhaul decision 6):
 *
 * - Empty manifest → the one-screen manifesto. No grid, no placeholder
 *   skeletons — curating clips into the static manifest is the only step
 *   needed to grow the gallery (no fetch involved).
 * - Curated manifest → muted looping clip tiles under the one-liner.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "../HomePage";
import { CLIP_MANIFEST, type GalleryClip } from "../home/clipManifest";

const mockUseAuthUser = vi.hoisted(() => vi.fn());

vi.mock("@hooks/useAuthUser", () => ({
  useAuthUser: mockUseAuthUser,
}));

const SURF_DOG: GalleryClip = {
  src: "https://cdn.example.com/clips/surf-dog.mp4",
  poster: "https://cdn.example.com/posters/surf-dog.jpg",
  caption: "A dog sprinting through golden-hour surf",
  aspect: "16:9",
};

const NEON_ALLEY: GalleryClip = {
  src: "https://cdn.example.com/clips/neon-alley.mp4",
  poster: "https://cdn.example.com/posters/neon-alley.jpg",
  caption: "Slow dolly through a rain-soaked alley",
  aspect: "9:16",
};

const FIXTURE_CLIPS: readonly GalleryClip[] = [SURF_DOG, NEON_ALLEY];

function renderHome(clips?: readonly GalleryClip[]): void {
  mockUseAuthUser.mockReturnValue(null);
  render(
    <MemoryRouter>
      {clips ? <HomePage clips={clips} /> : <HomePage />}
    </MemoryRouter>,
  );
}

describe("HomePage gallery states", () => {
  it("renders a muted looping tile per manifest entry when clips are curated", () => {
    renderHome(FIXTURE_CLIPS);

    const grid = screen.getByTestId("clip-grid");
    const videos = grid.querySelectorAll("video");
    expect(videos).toHaveLength(FIXTURE_CLIPS.length);

    const first = videos[0] as HTMLVideoElement;
    expect(first).toHaveAttribute("src", SURF_DOG.src);
    expect(first).toHaveAttribute("poster", SURF_DOG.poster);
    expect(first.muted).toBe(true);
    expect(first).toHaveAttribute("loop");
    expect(first).toHaveAttribute("autoplay");

    expect(
      screen.getByText("A dog sprinting through golden-hour surf"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Slow dolly through a rain-soaked alley"),
    ).toBeInTheDocument();

    // The manifesto header stays above the grid.
    expect(
      screen.getByText("From one-line idea to one good clip."),
    ).toBeInTheDocument();
  });

  it("falls back to the manifesto when the manifest is empty — no grid, no skeletons", () => {
    // The shipped manifest is empty today; the default render is the
    // zero-content state.
    expect(CLIP_MANIFEST).toHaveLength(0);

    renderHome();

    expect(screen.queryByTestId("clip-grid")).toBeNull();
    expect(document.querySelector("video")).toBeNull();
    expect(
      screen.getByText("From one-line idea to one good clip."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
  });
});
