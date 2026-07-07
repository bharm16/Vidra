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
});
