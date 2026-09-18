import { describe, expect, it } from "vitest";
import { deriveEdgeKind } from "../deriveEdgeKind";
import type { LineageNode } from "../types";

/**
 * Edge kind is DERIVED from the two endpoints (ADR-0013), never stored, so the
 * drawn relationship can never fall out of sync with the nodes it connects.
 */
const node = (
  id: string,
  kind: LineageNode["kind"],
  ancestorId: string | null,
): LineageNode => ({ id, kind, ancestorId });

describe("deriveEdgeKind", () => {
  it("the root words-node is the spine", () => {
    const w = node("w", "words", null);
    expect(deriveEdgeKind(w, [w])).toBe("spine");
  });

  it("a picture→clip edge is always a move", () => {
    const nodes = [
      node("w", "words", null),
      node("p", "picture", "w"),
      node("c", "clip", "p"),
    ];
    expect(deriveEdgeKind(nodes[2]!, nodes)).toBe("move");
  });

  it("a words-version reworded from another is a reword", () => {
    const nodes = [node("w1", "words", null), node("w2", "words", "w1")];
    expect(deriveEdgeKind(nodes[1]!, nodes)).toBe("reword");
  });

  it("a picture that shares its words-version with a sibling is a roll", () => {
    const nodes = [
      node("w", "words", null),
      node("p1", "picture", "w"),
      node("p2", "picture", "w"),
    ];
    expect(deriveEdgeKind(nodes[1]!, nodes)).toBe("roll");
    expect(deriveEdgeKind(nodes[2]!, nodes)).toBe("roll");
  });

  it("a lone picture off its words-version is on the spine, not a roll", () => {
    const nodes = [node("w", "words", null), node("p", "picture", "w")];
    expect(deriveEdgeKind(nodes[1]!, nodes)).toBe("spine");
  });

  // ADR-0022 decision 3: repeated refinement produces picture → picture
  // chains, so the picture column has internal depth. The columns are media
  // types, not generations.
  it("a picture whose ancestor is a picture is a refine", () => {
    const nodes = [
      node("w", "words", null),
      node("p1", "picture", "w"),
      node("p2", "picture", "p1"),
    ];
    expect(deriveEdgeKind(nodes[2]!, nodes)).toBe("refine");
  });

  it("a refine chain stays refine at every link, however deep", () => {
    const nodes = [
      node("w", "words", null),
      node("p1", "picture", "w"),
      node("p2", "picture", "p1"),
      node("p3", "picture", "p2"),
    ];
    expect(deriveEdgeKind(nodes[2]!, nodes)).toBe("refine");
    expect(deriveEdgeKind(nodes[3]!, nodes)).toBe("refine");
  });

  it("a refined picture is a refine, not a roll, even beside a words-version sibling", () => {
    // p1 and p2 share the words-version (that pair is a roll); p3 descends
    // from p1. Sharing a parent is what makes a roll — p3 does not share one.
    const nodes = [
      node("w", "words", null),
      node("p1", "picture", "w"),
      node("p2", "picture", "w"),
      node("p3", "picture", "p1"),
    ];
    expect(deriveEdgeKind(nodes[1]!, nodes)).toBe("roll");
    expect(deriveEdgeKind(nodes[3]!, nodes)).toBe("refine");
  });

  it("a clip off a refined picture is still a move", () => {
    const nodes = [
      node("w", "words", null),
      node("p1", "picture", "w"),
      node("p2", "picture", "p1"),
      node("c", "clip", "p2"),
    ];
    expect(deriveEdgeKind(nodes[3]!, nodes)).toBe("move");
  });
});
