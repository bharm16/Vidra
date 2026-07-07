import { describe, expect, it } from "vitest";
import { nonLeafIds, isRemovableLeaf } from "../leaf";
import type { SpaceNode } from "../types";

const nodes: SpaceNode[] = [
  { id: "words-v-1", kind: "words", ancestorId: null, label: "w" },
  { id: "pic-1", kind: "picture", ancestorId: "words-v-1" },
  { id: "clip-1", kind: "clip", ancestorId: "pic-1" },
  { id: "pic-2", kind: "picture", ancestorId: "words-v-1" },
];

describe("space leaf rules", () => {
  it("collects the ids that a live node names as ancestor", () => {
    // words-v-1 (parent of pics) and pic-1 (parent of clip-1) are non-leaves.
    expect(nonLeafIds(nodes)).toEqual(new Set(["words-v-1", "pic-1"]));
  });

  it("ignores archived nodes when deciding parenthood", () => {
    const withArchivedClip: SpaceNode[] = [
      { id: "pic-1", kind: "picture", ancestorId: "words-v-1" },
      {
        id: "clip-1",
        kind: "clip",
        ancestorId: "pic-1",
        archived: true,
      },
    ];
    // The archived clip no longer keeps pic-1 alive → pic-1 is now a leaf.
    expect(nonLeafIds(withArchivedClip).has("pic-1")).toBe(false);
  });

  it("treats a childless picture/clip as a removable leaf", () => {
    const nonLeaves = nonLeafIds(nodes);
    expect(
      isRemovableLeaf(
        { id: "clip-1", kind: "clip", ancestorId: "pic-1" },
        nonLeaves,
      ),
    ).toBe(true);
    expect(
      isRemovableLeaf(
        { id: "pic-2", kind: "picture", ancestorId: "words-v-1" },
        nonLeaves,
      ),
    ).toBe(true);
  });

  it("never treats a parent picture as removable", () => {
    const nonLeaves = nonLeafIds(nodes);
    expect(
      isRemovableLeaf(
        { id: "pic-1", kind: "picture", ancestorId: "words-v-1" },
        nonLeaves,
      ),
    ).toBe(false);
  });

  it("never treats a words-version as removable (it is not a generation)", () => {
    // Even a childless words node isn't archivable via generation removal.
    expect(
      isRemovableLeaf(
        { id: "words-orphan", kind: "words", ancestorId: null },
        new Set(),
      ),
    ).toBe(false);
  });
});
