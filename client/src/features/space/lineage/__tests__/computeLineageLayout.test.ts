import { describe, expect, it } from "vitest";
import { computeLineageLayout } from "../computeLineageLayout";
import type { LineageNode } from "../types";

/**
 * The space's layout is DERIVED, never stored (ADR-0012 / ADR-0013): three
 * fixed generations as columns (words → pictures → clips), siblings as computed
 * rows. Zero branches is a straight line; only breadth grows.
 */
const node = (
  id: string,
  kind: LineageNode["kind"],
  ancestorId: string | null,
  archived = false,
): LineageNode => ({ id, kind, ancestorId, archived });

describe("computeLineageLayout", () => {
  it("lays a zero-branch lineage out as a straight line (one row per column)", () => {
    const layout = computeLineageLayout([
      node("w", "words", null),
      node("p", "picture", "w"),
      node("c", "clip", "p"),
    ]);
    const byId = Object.fromEntries(layout.map((n) => [n.id, n]));
    expect(byId.w).toMatchObject({ column: 0, row: 0 });
    expect(byId.p).toMatchObject({ column: 1, row: 0 });
    expect(byId.c).toMatchObject({ column: 2, row: 0 });
  });

  it("stacks sibling pictures as separate rows in the pictures column", () => {
    const layout = computeLineageLayout([
      node("w", "words", null),
      node("p1", "picture", "w"),
      node("p2", "picture", "w"),
    ]);
    const pictures = layout
      .filter((n) => n.column === 1)
      .sort((a, b) => a.row - b.row);
    expect(pictures.map((n) => n.id)).toEqual(["p1", "p2"]);
    expect(pictures.map((n) => n.row)).toEqual([0, 1]);
  });

  it("excludes archived nodes from the layout (nothing vanishes, but the render skips them)", () => {
    const layout = computeLineageLayout([
      node("w", "words", null),
      node("p1", "picture", "w"),
      node("p2", "picture", "w", true),
    ]);
    expect(layout.map((n) => n.id)).not.toContain("p2");
    expect(layout).toHaveLength(2);
  });
});
