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

  // ADR-0022 decision 3: a picture may descend from another picture. The
  // ancestor is a recorded choice the caller supplies, never a positional
  // guess made here.
  it("hangs a refined picture from its source picture, not from the words-version", () => {
    const nodes = buildSpaceNodes({
      words: [{ versionId: "v1", label: "a cat on a couch" }],
      pictures: [
        { id: "pic1", versionId: "v1", status: "ready" },
        {
          id: "pic2",
          versionId: "v1",
          status: "ready",
          ancestorPictureId: "pic1",
        },
      ],
      clips: [],
    });

    expect(nodes.find((n) => n.id === "pic1")).toMatchObject({
      ancestorId: "words-v1",
    });
    expect(nodes.find((n) => n.id === "pic2")).toMatchObject({
      kind: "picture",
      ancestorId: "pic1",
    });
  });

  it("still roots a picture at its words-version when no picture ancestor was recorded", () => {
    const nodes = buildSpaceNodes({
      words: [{ versionId: "v1", label: "x" }],
      pictures: [{ id: "pic1", versionId: "v1", status: "ready" }],
      clips: [],
    });
    expect(nodes.find((n) => n.id === "pic1")?.ancestorId).toBe("words-v1");
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

  // ADR-0022 decision 2 (issue #111): each take carries the words-version it is
  // filed under explicitly, so restore never has to walk the display ancestor.
  it("stamps each take's associated words-version, keeping it distinct from the display ancestor", () => {
    const nodes = buildSpaceNodes({
      words: [
        { versionId: "w1", label: "first" },
        { versionId: "w2", label: "second", rewordedFrom: "w1" },
      ],
      pictures: [
        // Refined from a W1 picture but filed under W2: ancestor draws the
        // refine edge, wordsVersionId carries the restore target.
        {
          id: "pic2",
          versionId: "w1",
          ancestorPictureId: "pic1",
          wordsVersionId: "w2",
        },
      ],
      clips: [{ id: "clip2", pictureId: "pic1", wordsVersionId: "w2" }],
    });

    expect(nodes.find((n) => n.id === "pic2")).toMatchObject({
      ancestorId: "pic1",
      wordsVersionId: "w2",
    });
    expect(nodes.find((n) => n.id === "clip2")).toMatchObject({
      ancestorId: "pic1",
      wordsVersionId: "w2",
    });
  });

  it("defaults a picture's associated words-version to its enclosing version when none is supplied", () => {
    const nodes = buildSpaceNodes({
      words: [{ versionId: "v1", label: "x" }],
      pictures: [{ id: "pic1", versionId: "v1" }],
      clips: [],
    });
    expect(nodes.find((n) => n.id === "pic1")?.wordsVersionId).toBe("v1");
  });

  // Issue #125: the durable media handle rides onto the picture node beside the
  // URL, so an expired URL stays recoverable.
  it("carries a picture's durable handle and view-URL expiry onto the node", () => {
    const nodes = buildSpaceNodes({
      words: [{ versionId: "v1", label: "x" }],
      pictures: [
        {
          id: "pic1",
          versionId: "v1",
          mediaUrl: "https://signed/pic1?exp",
          storagePath: "image-previews/owner/pic1",
          assetId: "asset-pic1",
          viewUrlExpiresAt: "2026-09-18T12:00:00.000Z",
        },
      ],
      clips: [],
    });
    expect(nodes.find((n) => n.id === "pic1")).toMatchObject({
      mediaUrl: "https://signed/pic1?exp",
      storagePath: "image-previews/owner/pic1",
      assetId: "asset-pic1",
      viewUrlExpiresAt: "2026-09-18T12:00:00.000Z",
    });
  });

  it("omits durable-handle fields for a picture that records none", () => {
    const nodes = buildSpaceNodes({
      words: [{ versionId: "v1", label: "x" }],
      pictures: [{ id: "pic1", versionId: "v1" }],
      clips: [],
    });
    const pic = nodes.find((n) => n.id === "pic1")!;
    expect(pic).not.toHaveProperty("storagePath");
    expect(pic).not.toHaveProperty("assetId");
    expect(pic).not.toHaveProperty("viewUrlExpiresAt");
  });
});
