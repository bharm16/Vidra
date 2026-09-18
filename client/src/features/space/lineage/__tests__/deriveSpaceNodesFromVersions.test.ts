import { describe, expect, it } from "vitest";
import type { SessionPromptVersionEntry } from "@shared/types/session";
import type { Generation } from "@features/generations/types";
import { normalizePersistedGenerations } from "@features/generations/utils/normalizePersistedGeneration";
import { deriveSpaceNodesFromVersions } from "../deriveSpaceNodes";
import { deriveEdgeKind } from "../deriveEdgeKind";
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

  it("never attaches a clip to a sibling picture by position", () => {
    const nodes = lineageOf([
      version({
        versionId: "v-1",
        generations: [
          { id: "gen-pic-1", mediaType: "image", status: "completed" },
          { id: "gen-pic-2", mediaType: "image", status: "completed" },
          { id: "gen-clip-1", mediaType: "video", status: "completed" },
        ],
      }),
    ]);

    // ADR-0022 decision 3: a clip with no PERSISTED picture ancestor hangs
    // from its words-version, and says so. Array order is not evidence — the
    // old fallback drew an edge to whichever picture happened to be listed
    // first, which the space then rendered as a relationship the creator
    // performed. A guessed edge is worse than an absent one.
    expect(nodes.find((n) => n.id === "gen-clip-1")).toMatchObject({
      ancestorId: "words-v-1",
      pictureAncestryUnknown: true,
    });
  });

  it("files a clip under its words without claiming those words were its full ancestry", () => {
    const nodes = lineageOf([
      version({
        versionId: "v-1",
        prompt: "a dancer at dusk",
        generations: [
          { id: "gen-clip-1", mediaType: "video", status: "completed" },
        ],
      }),
    ]);

    // "We know which words this clip belongs to" — not "these words were its
    // complete production ancestry". The flag is what keeps the second
    // reading off the screen.
    expect(nodes.find((n) => n.id === "gen-clip-1")).toMatchObject({
      kind: "clip",
      ancestorId: "words-v-1",
      pictureAncestryUnknown: true,
    });
  });

  it("marks nothing unknown when the clip's ancestor is persisted", () => {
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

    expect(nodes.find((n) => n.id === "gen-clip-1")).not.toHaveProperty(
      "pictureAncestryUnknown",
    );
  });

  it("draws a clip whose session write did not resolve as made-but-not-saved", () => {
    // A LIVE take, straight from the generation run — not a persisted record.
    // Only the run knows the attachment failed; the session cannot, because
    // the take never reached it.
    const nodes = deriveSpaceNodesFromVersions([
      {
        versionId: "v-1",
        prompt: "a dancer at dusk",
        generations: [
          {
            id: "gen-clip-1",
            model: "wan-2.2",
            tier: "draft",
            mediaType: "video",
            status: "completed",
            prompt: "a dancer at dusk",
            mediaUrls: ["https://cdn.example.com/clip.mp4"],
            thumbnailUrl: "https://img/last.webp",
            createdAt: 0,
            attachment: "failed",
          } as unknown as Generation,
        ],
      },
    ]);

    // ADR-0022 decision 6: real media, no row in the session. Drawn as such
    // rather than as a settled node that vanishes on the next refresh.
    expect(nodes.find((n) => n.id === "gen-clip-1")).toMatchObject({
      kind: "clip",
      unattached: true,
    });
  });

  it("carries no unattached marker off a record read back from the session", () => {
    const nodes = lineageOf([
      version({
        versionId: "v-1",
        generations: [
          {
            id: "gen-clip-1",
            mediaType: "video",
            status: "completed",
            ancestorGenerationId: "gen-pic-1",
            // A stale marker that somehow reached storage. The record came OUT
            // of the session, so it IS in the session — the reader drops it and
            // "not saved" cannot outlive the save.
            attachment: "failed",
          },
        ],
      }),
    ]);

    expect(nodes.find((n) => n.id === "gen-clip-1")).not.toHaveProperty(
      "unattached",
    );
  });

  // ADR-0022 decision 3 — the refine edge. Nothing in #86 produces one (an
  // upload has no picture ancestor); the plumbing exists so #88/#89 record a
  // relationship rather than inventing a second way to draw it.
  it("hangs a picture that names a picture ancestor from that picture", () => {
    const nodes = lineageOf([
      version({
        versionId: "v-1",
        generations: [
          { id: "gen-pic-1", mediaType: "image", status: "completed" },
          {
            id: "gen-pic-2",
            mediaType: "image",
            status: "completed",
            ancestorGenerationId: "gen-pic-1",
            origin: "studio",
          },
        ],
      }),
    ]);

    expect(nodes.find((n) => n.id === "gen-pic-2")).toMatchObject({
      kind: "picture",
      ancestorId: "gen-pic-1",
    });
  });

  // ADR-0022 decision 4, issue #89: a refresh renders the returned picture
  // from server records alone. The record below is exactly what the studio's
  // return bridge writes — nothing here is reconstructed client-side.
  it("draws a refine edge for a studio take returned onto the picture it was refined from", () => {
    const nodes = lineageOf([
      version({
        versionId: "v-1",
        prompt: "a brass desk lamp on an oak table",
        generations: [
          {
            id: "take-1",
            mediaType: "image",
            status: "completed",
            origin: "generated",
            ancestorGenerationId: null,
          },
          {
            id: "take-2",
            mediaType: "image",
            status: "completed",
            origin: "studio",
            productionProvenance: {
              state: "known",
              instruction: "warm the light",
              model: "nano-banana-2",
              studio: {
                projectId: "project-1",
                turnId: "turn-1",
                imageId: "img-1",
              },
            },
            sourceInputs: [
              { kind: "take", generationId: "take-1", storagePath: "p/take-1" },
              { kind: "studio-image", storagePath: "p/returned" },
            ],
            ancestorGenerationId: "take-1",
            thumbnailUrl: "https://img/returned.png",
          },
        ],
      }),
    ]);

    const returned = nodes.find((node) => node.id === "take-2")!;
    expect(returned).toMatchObject({ kind: "picture", ancestorId: "take-1" });
    // Inside the picture column, not a second roll off the words-version.
    expect(deriveEdgeKind(returned, nodes)).toBe("refine");
    expect(deriveEdgeKind(nodes.find((n) => n.id === "take-1")!, nodes)).toBe(
      "spine",
    );
  });

  it("keeps an admitted upload rooted at the words-version it was admitted under", () => {
    const nodes = lineageOf([
      version({
        versionId: "v-1",
        prompt: "a runner on a rain-slicked street",
        generations: [
          {
            id: "gen-upload-1",
            mediaType: "image",
            status: "completed",
            origin: "upload",
            productionProvenance: { state: "unknown" },
            sourceInputs: [{ kind: "upload", assetId: "asset-1" }],
            ancestorGenerationId: null,
            thumbnailUrl: "https://img/uploaded.webp",
          },
        ],
      }),
    ]);

    // An upload has no picture ancestor and earns no refine edge: it hangs
    // from its associated words, which is the truth, not a fallback.
    expect(nodes.find((n) => n.id === "gen-upload-1")).toMatchObject({
      kind: "picture",
      ancestorId: "words-v-1",
      mediaUrl: "https://img/uploaded.webp",
    });
  });

  it("links a clip to an uploaded picture the same way it links to a generated one", () => {
    const nodes = lineageOf([
      version({
        versionId: "v-1",
        generations: [
          {
            id: "gen-upload-1",
            mediaType: "image",
            status: "completed",
            origin: "upload",
            ancestorGenerationId: null,
          },
          {
            id: "gen-clip-1",
            mediaType: "video",
            status: "completed",
            ancestorGenerationId: "gen-upload-1",
          },
        ],
      }),
    ]);

    expect(nodes.find((n) => n.id === "gen-clip-1")).toMatchObject({
      kind: "clip",
      ancestorId: "gen-upload-1",
    });
    expect(nodes.find((n) => n.id === "gen-clip-1")).not.toHaveProperty(
      "pictureAncestryUnknown",
    );
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
