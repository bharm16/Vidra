import { describe, expect, it } from "vitest";
import type { SessionPromptVersionEntry } from "@shared/types/session";
import { normalizePersistedGenerations } from "@features/generations/utils/normalizePersistedGeneration";
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

/**
 * Persisted records reach the space the way they reach it in production: read
 * once by `normalizePersistedGenerations`, then adapted. The space no longer
 * carries a second reader of the open bag.
 */
const lineageOf = (versions: ReturnType<typeof version>[]) =>
  deriveSpaceNodesFromVersions(
    versions.map((v) => ({
      versionId: v.versionId,
      prompt: v.prompt,
      generations: normalizePersistedGenerations(v.generations),
    })),
  );

describe("deriveSpaceNodesFromVersions", () => {
  it("maps a single version with one picture to a words node and a picture node", () => {
    const nodes = lineageOf([
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
    const nodes = lineageOf([
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
    const nodes = lineageOf([
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
    const nodes = lineageOf([
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
    const nodes = lineageOf([
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

  it("shows a clip persisted before its writer stamped mediaType", () => {
    // The space used to read persisted records a second time, straight off the
    // bag and with no derivation — so a clip written before af16e933 (no
    // `mediaType`) matched neither the picture nor the clip branch and was
    // dropped, despite normalizePersistedGeneration already healing it from
    // the model. One reader, one answer.
    const nodes = lineageOf([
      version({
        versionId: "v-1",
        prompt: "a dancer",
        generations: [
          {
            id: "gen-clip-legacy",
            model: "wan-2.2",
            status: "completed",
            thumbnailUrl: "https://img/last.webp",
          },
        ],
      }),
    ]);

    expect(nodes.find((n) => n.id === "gen-clip-legacy")).toMatchObject({
      kind: "clip",
      status: "ready",
    });
  });
});
