import { describe, expect, it } from "vitest";
import { resolveWordsForNode } from "../resolveWordsForNode";
import type { SpaceNode } from "../types";

const nodes: SpaceNode[] = [
  { id: "words-v-1", kind: "words", ancestorId: null, label: "a calm harbor" },
  { id: "pic-1", kind: "picture", ancestorId: "words-v-1" },
  { id: "clip-1", kind: "clip", ancestorId: "pic-1" },
];

describe("resolveWordsForNode", () => {
  it("returns a words node's own label", () => {
    expect(resolveWordsForNode("words-v-1", nodes)).toBe("a calm harbor");
  });

  it("returns a picture's paired words via its words ancestor", () => {
    expect(resolveWordsForNode("pic-1", nodes)).toBe("a calm harbor");
  });

  it("walks a clip up through its picture to the words", () => {
    expect(resolveWordsForNode("clip-1", nodes)).toBe("a calm harbor");
  });

  it("returns null for an unknown node id", () => {
    expect(resolveWordsForNode("nope", nodes)).toBeNull();
  });

  it("returns null when the words node has no label", () => {
    expect(
      resolveWordsForNode("pic-1", [
        { id: "words-v-1", kind: "words", ancestorId: null },
        { id: "pic-1", kind: "picture", ancestorId: "words-v-1" },
      ]),
    ).toBeNull();
  });
});
