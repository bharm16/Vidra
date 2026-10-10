import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TileStateAnnouncer } from "../TileStateAnnouncer";
import type { Shot } from "../../utils/groupShots";
import type { Generation } from "@features/generations/types";

function gen(p: Partial<Generation>): Generation {
  return {
    id: "g",
    tier: "render",
    status: "completed",
    model: "sora-2",
    prompt: "x",
    promptVersionId: "v",
    createdAt: 1,
    completedAt: 1,
    mediaType: "video",
    mediaUrls: ["u"],
    isFavorite: false,
    generationSettings: null,
    ...p,
  } as Generation;
}

function shot(tiles: Generation[]): Shot {
  return {
    id: "v",
    promptSummary: "x",
    modelId: "m",
    createdAt: 1,
    tiles,
    status: "ready",
  };
}

describe("TileStateAnnouncer", () => {
  it("announces the active shot's status when shots are present", () => {
    const tiles = [gen({ id: "a", status: "completed" })];
    render(<TileStateAnnouncer shots={[shot(tiles)]} />);
    const region = screen.getByRole("status");
    expect(region.textContent).toMatch(/(ready|complete)/i);
  });
});
