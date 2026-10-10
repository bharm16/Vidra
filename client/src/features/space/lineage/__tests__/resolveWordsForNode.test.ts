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
