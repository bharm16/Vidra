import { describe, expect, it } from "vitest";
import type { SessionPromptVersionEntry } from "@shared/types/session";
import { deriveSpaceNodesFromVersions } from "../deriveSpaceNodes";
import { computeLineageLayout } from "../computeLineageLayout";

const version = (
  over: Partial<SessionPromptVersionEntry> & { versionId: string },
): SessionPromptVersionEntry => ({
  signature: "sig",
  prompt: "a prompt",
  timestamp: "2026-07-07T00:00:00.000Z",
  ...over,
});

describe("deriveSpaceNodesFromVersions", () => {
  it("maps a single version with one picture to a words node and a picture node", () => {
    const nodes = deriveSpaceNodesFromVersions([
      version({
        versionId: "v-1",
        prompt: "a cozy coffee shop ad",
        generations: [
          {
            id: "gen-pic-1",
            mediaType: "image",
            status: "completed",
            thumbnailUrl: "https://img/pic1.webp",
            ancestorGenerationId: null,
          },
        ],
      }),
    ]);

    expect(nodes).toEqual([
      {
        id: "words-v-1",
        kind: "words",
        ancestorId: null,
        label: "a cozy coffee shop ad",
      },
      {
        id: "gen-pic-1",
        kind: "picture",
        ancestorId: "words-v-1",
        status: "ready",
        mediaUrl: "https://img/pic1.webp",
      },
    ]);
  });

  it("chains reword edges across versions in array order (survives reload)", () => {
    const nodes = deriveSpaceNodesFromVersions([
      version({ versionId: "v-1", prompt: "first wording" }),
      version({ versionId: "v-2", prompt: "second wording" }),
      version({ versionId: "v-3", prompt: "third wording" }),
    ]);

    const words = nodes.filter((n) => n.kind === "words");
    // Each version is reworded from the previous — a linear spine up the words
    // column. This is the multi-version branch the live adapter couldn't show.
    expect(words.map((n) => ({ id: n.id, ancestorId: n.ancestorId }))).toEqual([
      { id: "words-v-1", ancestorId: null },
      { id: "words-v-2", ancestorId: "words-v-1" },
      { id: "words-v-3", ancestorId: "words-v-2" },
    ]);
  });

  it("links a clip to its persisted source picture via ancestorGenerationId", () => {
    const nodes = deriveSpaceNodesFromVersions([
      version({
        versionId: "v-1",
        generations: [
          { id: "gen-pic-1", mediaType: "image", status: "completed" },
          {
            id: "gen-clip-1",
            mediaType: "video",
            status: "completed",
            ancestorGenerationId: "gen-pic-1",
          },
        ],
      }),
    ]);

    const clip = nodes.find((n) => n.id === "gen-clip-1");
    expect(clip).toMatchObject({ kind: "clip", ancestorId: "gen-pic-1" });
  });

  it("falls back to the first picture when a clip has no persisted source", () => {
    const nodes = deriveSpaceNodesFromVersions([
      version({
        versionId: "v-1",
        generations: [
          { id: "gen-pic-1", mediaType: "image", status: "completed" },
          { id: "gen-clip-1", mediaType: "video", status: "completed" },
        ],
      }),
    ]);

    // Clip source threading is not wired yet; the clip still connects to
    // something renderable rather than dangling.
    expect(nodes.find((n) => n.id === "gen-clip-1")).toMatchObject({
      ancestorId: "gen-pic-1",
    });
  });

  it("marks archived generations so the layout excludes them (leaf removal)", () => {
    const nodes = deriveSpaceNodesFromVersions([
      version({
        versionId: "v-1",
        generations: [
          { id: "gen-pic-live", mediaType: "image", status: "completed" },
          {
            id: "gen-pic-gone",
            mediaType: "image",
            status: "completed",
            archived: true,
          },
        ],
      }),
    ]);

    expect(nodes.find((n) => n.id === "gen-pic-gone")).toMatchObject({
      archived: true,
    });
    // The render pass drops it entirely.
    const laidOut = computeLineageLayout(nodes);
    expect(laidOut.some((n) => n.id === "gen-pic-gone")).toBe(false);
    expect(laidOut.some((n) => n.id === "gen-pic-live")).toBe(true);
  });

  it("returns no nodes for an empty version list", () => {
    expect(deriveSpaceNodesFromVersions([])).toEqual([]);
  });
});
