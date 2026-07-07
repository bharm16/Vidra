import { describe, expect, it } from "vitest";
import { buildSpaceNodes } from "../buildSpaceNodes";

/**
 * Maps the session's takes into the space's lineage nodes. Ancestor links are
 * supplied explicitly by the caller (derived from words-version identity today,
 * persisted per ADR-0013 later) — the mapper itself stays pure and total.
 */
describe("buildSpaceNodes", () => {
  it("builds a straight spine: one words-version, its picture, its clip", () => {
    const nodes = buildSpaceNodes({
      words: [{ versionId: "v1", label: "a cat on a couch" }],
      pictures: [{ id: "pic1", versionId: "v1", status: "ready" }],
      clips: [{ id: "clip1", pictureId: "pic1", status: "ready" }],
    });
    const w = nodes.find((n) => n.kind === "words");
    const p = nodes.find((n) => n.kind === "picture");
    const c = nodes.find((n) => n.kind === "clip");
    expect(w).toMatchObject({ ancestorId: null, label: "a cat on a couch" });
    expect(p).toMatchObject({ id: "pic1", ancestorId: w!.id });
    expect(c).toMatchObject({ id: "clip1", ancestorId: "pic1" });
  });

  it("links a reworded words-version to the version it came from", () => {
    const nodes = buildSpaceNodes({
      words: [
        { versionId: "v1", label: "first" },
        { versionId: "v2", label: "second", rewordedFrom: "v1" },
      ],
      pictures: [],
      clips: [],
    });
    const v1 = nodes.find((n) => n.label === "first")!;
    const v2 = nodes.find((n) => n.label === "second")!;
    expect(v1.ancestorId).toBeNull();
    expect(v2.ancestorId).toBe(v1.id);
  });

  it("carries the archived flag through so the render can skip it", () => {
    const nodes = buildSpaceNodes({
      words: [{ versionId: "v1", label: "x" }],
      pictures: [
        { id: "pic1", versionId: "v1", status: "ready", archived: true },
      ],
      clips: [],
    });
    expect(nodes.find((n) => n.id === "pic1")?.archived).toBe(true);
  });
});
