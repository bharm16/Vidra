import { describe, expect, it } from "vitest";
import type { SessionPromptVersionEntry } from "@shared/types/session";
import type { Generation } from "@features/generations/types";
import { normalizePersistedGenerations } from "@features/generations/utils/normalizePersistedGeneration";
import { deriveSpaceNodesFromVersions } from "../deriveSpaceNodes";
import { deriveEdgeKind } from "../deriveEdgeKind";
import { computeLineageLayout } from "../computeLineageLayout";
import { resolveWordsForNode } from "../resolveWordsForNode";

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
      // The PERSISTED reword parent travels the same path as every other
      // version field — carried, never derived from this array's order.
      ...(v.rewordedFromVersionId
        ? { rewordedFromVersionId: v.rewordedFromVersionId }
        : {}),
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
        // The associated words-version the take is filed under (ADR-0022
        // decision 2) — carried explicitly, distinct from the display ancestor.
        wordsVersionId: "v-1",
        status: "ready",
        mediaUrl: "https://img/pic1.webp",
      },
    ]);
  });

  it("draws the reword chain from each version's recorded parent (survives reload)", () => {
    const nodes = lineageOf([
      version({ versionId: "v-1", prompt: "first wording" }),
      version({
        versionId: "v-2",
        prompt: "second wording",
        rewordedFromVersionId: "v-1",
      }),
      version({
        versionId: "v-3",
        prompt: "third wording",
        rewordedFromVersionId: "v-2",
      }),
    ]);

    const words = nodes.filter((n) => n.kind === "words");
    // A linear spine up the words column — but drawn edge-for-edge from each
    // version's PERSISTED parent, not from the array's order (issue #116).
    // This is the multi-version chain the live adapter couldn't show.
    expect(words.map((n) => ({ id: n.id, ancestorId: n.ancestorId }))).toEqual([
      { id: "words-v-1", ancestorId: null },
      { id: "words-v-2", ancestorId: "words-v-1" },
      { id: "words-v-3", ancestorId: "words-v-2" },
    ]);
  });

  // Issue #116 (ADR-0013 M4): a reword records the version it came from, so a
  // reword of an OLDER version branches off that older version rather than the
  // immediately-preceding array entry.
  it("branches off the OLDER version a reword recorded as its parent", () => {
    const nodes = lineageOf([
      version({ versionId: "v-1", prompt: "first" }),
      version({
        versionId: "v-2",
        prompt: "second",
        rewordedFromVersionId: "v-1",
      }),
      // Reworded from the OLDER v-1, NOT the immediately-preceding v-2.
      version({
        versionId: "v-3",
        prompt: "third",
        rewordedFromVersionId: "v-1",
      }),
    ]);

    const words = nodes.filter((n) => n.kind === "words");
    expect(words.map((n) => ({ id: n.id, ancestorId: n.ancestorId }))).toEqual([
      { id: "words-v-1", ancestorId: null },
      { id: "words-v-2", ancestorId: "words-v-1" },
      // The branch: v-3 hangs off v-1, not v-2.
      { id: "words-v-3", ancestorId: "words-v-1" },
    ]);
    // And the branch is a genuine reword edge.
    expect(
      deriveEdgeKind(nodes.find((n) => n.id === "words-v-3")!, nodes),
    ).toBe("reword");
  });

  // Issue #116: two versions created concurrently each carry their own
  // recorded parent, and array order — which concurrent writes race to
  // determine — cannot move either edge.
  it("keeps each version's recorded parent regardless of array order", () => {
    // v-1 root; v-2 reworded from v-1. Then two versions are created
    // concurrently: v-3a from v-2 and v-3b from v-1.
    const branched = [
      version({ versionId: "v-1", prompt: "first" }),
      version({
        versionId: "v-2",
        prompt: "second",
        rewordedFromVersionId: "v-1",
      }),
      version({
        versionId: "v-3a",
        prompt: "branch a",
        rewordedFromVersionId: "v-2",
      }),
      version({
        versionId: "v-3b",
        prompt: "branch b",
        rewordedFromVersionId: "v-1",
      }),
    ];

    const ancestryOf = (versions: ReturnType<typeof version>[]) =>
      Object.fromEntries(
        lineageOf(versions)
          .filter((n) => n.kind === "words")
          .map((n) => [n.id, n.ancestorId]),
      );

    const expected = {
      "words-v-1": null,
      "words-v-2": "words-v-1",
      "words-v-3a": "words-v-2",
      "words-v-3b": "words-v-1",
    };

    // Two correct parents…
    expect(ancestryOf(branched)).toEqual(expected);
    // …and reversing the array (a different concurrent-write outcome) yields
    // the identical ancestry — order is not evidence.
    expect(ancestryOf([...branched].reverse())).toEqual(expected);
  });

  // Issue #116: a session written before the field existed carries no recorded
  // parent on any entry. The old derivation chained each to the previous array
  // entry; now each reads as an explicit unknown (no reword edge) rather than a
  // fabricated linear history.
  it("renders legacy versions with no recorded parent as unknown, never chained", () => {
    const nodes = lineageOf([
      version({ versionId: "v-1", prompt: "first" }),
      version({ versionId: "v-2", prompt: "second" }),
      version({ versionId: "v-3", prompt: "third" }),
    ]);

    const words = nodes.filter((n) => n.kind === "words");
    expect(words.map((n) => ({ id: n.id, ancestorId: n.ancestorId }))).toEqual([
      { id: "words-v-1", ancestorId: null },
      { id: "words-v-2", ancestorId: null },
      { id: "words-v-3", ancestorId: null },
    ]);
    // Explicitly NOT chained to the preceding entry.
    expect(nodes.find((n) => n.id === "words-v-2")!.ancestorId).not.toBe(
      "words-v-1",
    );
    expect(nodes.find((n) => n.id === "words-v-3")!.ancestorId).not.toBe(
      "words-v-2",
    );
  });

  // Issue #116: a parent that names a version this session no longer holds is a
  // dangling reference — it draws no edge rather than a wrong one, the same
  // discipline the take's own words-version already applies.
  it("ignores a reword parent that names a version absent from the session", () => {
    const nodes = lineageOf([
      version({
        versionId: "v-2",
        prompt: "second",
        rewordedFromVersionId: "v-gone",
      }),
    ]);

    expect(nodes.find((n) => n.id === "words-v-2")!.ancestorId).toBeNull();
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

  // ADR-0022 decision 2 (issue #111): a take's associated words-version — the
  // words restored on selection or arming — is what the take is FILED UNDER,
  // never what its display ancestor descends from. The full production path
  // (normalize → derive → resolve) proves it end to end.
  it("stamps each take with its own associated words-version", () => {
    const nodes = lineageOf([
      version({
        versionId: "v-1",
        prompt: "words one",
        generations: [
          { id: "pic-1", mediaType: "image", status: "completed" },
          {
            id: "clip-1",
            mediaType: "video",
            status: "completed",
            ancestorGenerationId: "pic-1",
          },
        ],
      }),
    ]);

    expect(nodes.find((n) => n.id === "pic-1")).toMatchObject({
      wordsVersionId: "v-1",
    });
    expect(nodes.find((n) => n.id === "clip-1")).toMatchObject({
      wordsVersionId: "v-1",
    });
    // A words node is the words-version, not a take filed under one.
    expect(nodes.find((n) => n.id === "words-v-1")).not.toHaveProperty(
      "wordsVersionId",
    );
  });

  it("restores a clip's OWN words-version, not its source picture's (P1/W1/W2/C2)", () => {
    // P1 belongs to W1. The creator changes the motion into W2 and makes clip
    // C2 from P1. C2's display ancestor is P1 (a `move` edge, drawn unchanged),
    // but C2 is filed under W2 — so selecting C2 must restore W2's words, not
    // the W1 words the old display-ancestor walk returned.
    const nodes = lineageOf([
      version({
        versionId: "v-w1",
        prompt: "a harbor at dawn, slow push in",
        generations: [
          {
            id: "P1",
            mediaType: "image",
            status: "completed",
            promptVersionId: "v-w1",
          },
        ],
      }),
      version({
        versionId: "v-w2",
        prompt: "a harbor at dawn, orbit left",
        generations: [
          {
            id: "C2",
            mediaType: "video",
            status: "completed",
            promptVersionId: "v-w2",
            ancestorGenerationId: "P1",
          },
        ],
      }),
    ]);

    const c2 = nodes.find((n) => n.id === "C2")!;
    // Display ancestor unchanged: the space still draws C2 → P1.
    expect(c2).toMatchObject({ kind: "clip", ancestorId: "P1" });
    expect(deriveEdgeKind(c2, nodes)).toBe("move");
    // But its words are its own version's, not P1's.
    expect(c2.wordsVersionId).toBe("v-w2");
    expect(resolveWordsForNode("C2", nodes)).toBe(
      "a harbor at dawn, orbit left",
    );
    // And P1 still restores W1 — the older words are not lost.
    expect(resolveWordsForNode("P1", nodes)).toBe(
      "a harbor at dawn, slow push in",
    );
  });

  it("restores a refined picture's OWN words-version, not its ancestor picture's", () => {
    // A studio refinement of P1 that belongs to a later words-version: the
    // refine edge draws P2 → P1, but P2's words are W2's.
    const nodes = lineageOf([
      version({
        versionId: "v-w1",
        prompt: "a brass lamp on oak",
        generations: [
          {
            id: "P1",
            mediaType: "image",
            status: "completed",
            origin: "generated",
            promptVersionId: "v-w1",
          },
        ],
      }),
      version({
        versionId: "v-w2",
        prompt: "a brass lamp on oak, warmer light",
        generations: [
          {
            id: "P2",
            mediaType: "image",
            status: "completed",
            origin: "studio",
            promptVersionId: "v-w2",
            ancestorGenerationId: "P1",
          },
        ],
      }),
    ]);

    const p2 = nodes.find((n) => n.id === "P2")!;
    expect(p2).toMatchObject({ kind: "picture", ancestorId: "P1" });
    expect(deriveEdgeKind(p2, nodes)).toBe("refine");
    expect(p2.wordsVersionId).toBe("v-w2");
    expect(resolveWordsForNode("P2", nodes)).toBe(
      "a brass lamp on oak, warmer light",
    );
  });

  it("files a take under its own words-version, not the enclosing version it is listed under", () => {
    // A take can be listed under a version array that is not its own
    // words-version (the timeline's mismatch handling defends against exactly
    // this). The associated words-version is the take's own `promptVersionId`
    // when that is a real version — not the array it happens to sit in.
    const nodes = lineageOf([
      version({
        versionId: "v-w1",
        prompt: "W1 words",
        generations: [
          {
            id: "cross",
            mediaType: "image",
            status: "completed",
            promptVersionId: "v-w2",
          },
        ],
      }),
      version({ versionId: "v-w2", prompt: "W2 words" }),
    ]);

    expect(nodes.find((n) => n.id === "cross")?.wordsVersionId).toBe("v-w2");
    expect(resolveWordsForNode("cross", nodes)).toBe("W2 words");
  });

  // Issue #125: the durable media handle travels from the persisted record
  // onto the space node, read once through normalizePersistedGenerations.
  it("carries a picture take's durable handle and expiry onto the node", () => {
    const nodes = lineageOf([
      version({
        versionId: "v-1",
        prompt: "a lighthouse at dusk",
        generations: [
          {
            id: "gen-pic-1",
            mediaType: "image",
            status: "completed",
            thumbnailUrl: "https://img/pic1.webp",
            storagePath: "image-previews/owner/gen-pic-1",
            mediaAssetIds: ["asset-1"],
            viewUrlExpiresAt: "2026-09-18T12:00:00.000Z",
          },
        ],
      }),
    ]);

    expect(nodes.find((n) => n.id === "gen-pic-1")).toMatchObject({
      kind: "picture",
      mediaUrl: "https://img/pic1.webp",
      storagePath: "image-previews/owner/gen-pic-1",
      assetId: "asset-1",
      viewUrlExpiresAt: "2026-09-18T12:00:00.000Z",
    });
  });

  // Negative path: a record with no durable handle is never given a fabricated
  // one — an unrecoverable picture reads as such, not as a namespace guess.
  it("never fabricates a durable handle for a picture that records none", () => {
    const nodes = lineageOf([
      version({
        versionId: "v-1",
        generations: [
          {
            id: "gen-pic-1",
            mediaType: "image",
            status: "completed",
            thumbnailUrl: "https://img/pic1.webp",
          },
        ],
      }),
    ]);

    const pic = nodes.find((n) => n.id === "gen-pic-1")!;
    expect(pic).not.toHaveProperty("storagePath");
    expect(pic).not.toHaveProperty("assetId");
    expect(pic).not.toHaveProperty("viewUrlExpiresAt");
  });

  it("falls back to the enclosing version when a take's own words-version is absent", () => {
    // No `promptVersionId` on the record (a legacy take): the take is filed
    // under the version it is listed in, and restore keeps working.
    const nodes = lineageOf([
      version({
        versionId: "v-1",
        prompt: "the only words",
        generations: [
          { id: "legacy", mediaType: "image", status: "completed" },
        ],
      }),
    ]);

    expect(nodes.find((n) => n.id === "legacy")?.wordsVersionId).toBe("v-1");
    expect(resolveWordsForNode("legacy", nodes)).toBe("the only words");
  });
});
