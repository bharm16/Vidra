import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShotRow } from "../ShotRow";
import type { Shot } from "../../utils/groupShots";
import type { Generation } from "@features/generations/types";

vi.mock("../../events", () => ({ dispatchContinueScene: vi.fn() }));

vi.mock("@/hooks/useResolvedMediaUrl", () => ({
  useResolvedMediaUrl: ({ url }: { url?: string | null }) => ({
    url: url ?? null,
  }),
}));

function gen(id: string, status: Generation["status"]): Generation {
  return {
    id,
    tier: "render",
    status,
    model: "sora-2",
    prompt: "x",
    promptVersionId: id.slice(0, 1),
    createdAt: 1,
    completedAt: 1,
    mediaType: "video",
    mediaUrls: ["https://example.com/v.mp4"],
    thumbnailUrl: "https://example.com/p.jpg",
    isFavorite: false,
    generationSettings: null,
  } as Generation;
}

/**
 * GenTile featured-video cap lock (ADR-0010 M1).
 *
 * The featured tile — the player — carries the shot's single inline <video>
 * (autoplay, loop, muted). Every other tile stays poster-only. The perf
 * contract is the cap: at most one <video> per shot, so a 32-tile grid can
 * never trigger 32 concurrent autoplays.
 */
describe("GenTile — featured tile plays inline video, others stay posters", () => {
  it("renders 8 completed tiles with exactly one <video> (the featured tile)", () => {
    const tiles = Array.from({ length: 8 }, (_, i) =>
      gen(`g${i}`, "completed"),
    );
    const shot: Shot = {
      id: "v",
      promptSummary: "p",
      modelId: "m",
      createdAt: 1,
      tiles,
      status: "ready",
    };
    const { container } = render(
      <ShotRow
        shot={shot}
        now={1_000}
        layout="featured"
        featuredTileId="g0"
        onSelectTile={vi.fn()}
        onRetryTile={vi.fn()}
      />,
    );
    const videos = container.querySelectorAll("video");
    // Hard cap: at most 1 active <video> per shot — the actual perf contract.
    expect(videos.length).toBeLessThanOrEqual(1);
    expect(videos.length).toBe(1);
    const featuredVideo = videos[0];
    expect(featuredVideo?.closest("[data-generation-id]")).toHaveAttribute(
      "data-generation-id",
      "g0",
    );
    expect(featuredVideo).toHaveAttribute("loop");
    expect(featuredVideo?.muted).toBe(true);
    expect(featuredVideo).toHaveAttribute("playsinline");
    const imgs = container.querySelectorAll("img");
    expect(imgs.length).toBe(7);
  });

  it("keeps every tile poster-only when no tile is featured", () => {
    const tiles = Array.from({ length: 4 }, (_, i) =>
      gen(`g${i}`, "completed"),
    );
    const shot: Shot = {
      id: "v",
      promptSummary: "p",
      modelId: "m",
      createdAt: 1,
      tiles,
      status: "ready",
    };
    const { container } = render(
      <ShotRow
        shot={shot}
        now={1_000}
        layout="compact"
        featuredTileId={null}
        onSelectTile={vi.fn()}
        onRetryTile={vi.fn()}
      />,
    );
    expect(container.querySelectorAll("video").length).toBe(0);
    expect(container.querySelectorAll("img").length).toBe(4);
  });
});
