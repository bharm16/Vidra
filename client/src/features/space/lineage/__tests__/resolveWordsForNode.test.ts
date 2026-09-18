import { describe, expect, it } from "vitest";
import { resolveWordsForNode } from "../resolveWordsForNode";
import { wordsNodeId } from "../buildSpaceNodes";
import type { SpaceNode } from "../types";

/**
 * The take-restore contract (ADR-0012, ADR-0022 decision 2): a node restores
 * the words-version it is FILED UNDER — its associated words — carried
 * explicitly on the node as `wordsVersionId`. Resolution never walks the
 * display-ancestor chain: display ancestry (what the space draws) and
 * associated words (what returns to the input) are different relationships.
 */
describe("resolveWordsForNode", () => {
  it("returns a words node's own label", () => {
    const nodes: SpaceNode[] = [
      {
        id: wordsNodeId("v-1"),
        kind: "words",
        ancestorId: null,
        label: "a calm harbor",
      },
    ];
    expect(resolveWordsForNode(wordsNodeId("v-1"), nodes)).toBe(
      "a calm harbor",
    );
  });

  it("returns a picture's associated words via its explicit wordsVersionId", () => {
    const nodes: SpaceNode[] = [
      {
        id: wordsNodeId("v-1"),
        kind: "words",
        ancestorId: null,
        label: "a calm harbor",
      },
      {
        id: "pic-1",
        kind: "picture",
        ancestorId: wordsNodeId("v-1"),
        wordsVersionId: "v-1",
      },
    ];
    expect(resolveWordsForNode("pic-1", nodes)).toBe("a calm harbor");
  });

  it("restores a same-version clip's words (the existing spine case stays green)", () => {
    // A clip generated from a picture of the SAME words-version: display
    // ancestor (its picture) and associated words agree. The old walk and the
    // explicit lookup give the same answer here — that is the case that must
    // not regress.
    const nodes: SpaceNode[] = [
      {
        id: wordsNodeId("v-1"),
        kind: "words",
        ancestorId: null,
        label: "a calm harbor",
      },
      {
        id: "pic-1",
        kind: "picture",
        ancestorId: wordsNodeId("v-1"),
        wordsVersionId: "v-1",
      },
      {
        id: "clip-1",
        kind: "clip",
        ancestorId: "pic-1",
        wordsVersionId: "v-1",
      },
    ];
    expect(resolveWordsForNode("clip-1", nodes)).toBe("a calm harbor");
  });

  it("restores a clip's OWN words-version, never its display ancestor's (P1/W1/W2/C2)", () => {
    // C2 is a clip made from P1, a picture of the OLDER words-version W1, but
    // filed under W2 after the creator changed the motion. Its DISPLAY ancestor
    // is P1, so walking that chain would wrongly restore W1. Its associated
    // words is W2, and that is what selection must restore.
    const nodes: SpaceNode[] = [
      {
        id: wordsNodeId("w1"),
        kind: "words",
        ancestorId: null,
        label: "W1 words",
      },
      {
        id: wordsNodeId("w2"),
        kind: "words",
        ancestorId: wordsNodeId("w1"),
        label: "W2 words",
      },
      {
        id: "p1",
        kind: "picture",
        ancestorId: wordsNodeId("w1"),
        wordsVersionId: "w1",
      },
      { id: "c2", kind: "clip", ancestorId: "p1", wordsVersionId: "w2" },
    ];
    // The display ancestor is untouched — the space still draws C2 → P1 — but
    // words come from C2's own version, not the picture's.
    expect(nodes.find((n) => n.id === "c2")?.ancestorId).toBe("p1");
    expect(resolveWordsForNode("c2", nodes)).toBe("W2 words");
  });

  it("restores a refined picture's OWN words-version, not its ancestor picture's (refine edge)", () => {
    // P2 was refined from P1 (a refine edge, drawn inside the picture column)
    // but belongs to the later words-version W2. The old walk restored P1's W1.
    const nodes: SpaceNode[] = [
      {
        id: wordsNodeId("w1"),
        kind: "words",
        ancestorId: null,
        label: "W1 words",
      },
      {
        id: wordsNodeId("w2"),
        kind: "words",
        ancestorId: wordsNodeId("w1"),
        label: "W2 words",
      },
      {
        id: "p1",
        kind: "picture",
        ancestorId: wordsNodeId("w1"),
        wordsVersionId: "w1",
      },
      { id: "p2", kind: "picture", ancestorId: "p1", wordsVersionId: "w2" },
    ];
    expect(nodes.find((n) => n.id === "p2")?.ancestorId).toBe("p1");
    expect(resolveWordsForNode("p2", nodes)).toBe("W2 words");
  });

  it("returns null for an unknown node id", () => {
    const nodes: SpaceNode[] = [
      { id: wordsNodeId("v-1"), kind: "words", ancestorId: null, label: "x" },
    ];
    expect(resolveWordsForNode("nope", nodes)).toBeNull();
  });

  it("returns null when the take's words-version node has no label", () => {
    const nodes: SpaceNode[] = [
      { id: wordsNodeId("v-1"), kind: "words", ancestorId: null },
      {
        id: "pic-1",
        kind: "picture",
        ancestorId: wordsNodeId("v-1"),
        wordsVersionId: "v-1",
      },
    ];
    expect(resolveWordsForNode("pic-1", nodes)).toBeNull();
  });

  it("returns null when a take carries no associated words-version", () => {
    const nodes: SpaceNode[] = [
      { id: "pic-1", kind: "picture", ancestorId: null },
    ];
    expect(resolveWordsForNode("pic-1", nodes)).toBeNull();
  });
});
