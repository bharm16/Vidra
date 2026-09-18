import type { LineageNode, LineageNodeKind } from "./types";

/**
 * The three columns (ADR-0012). They are MEDIA TYPES, not generations:
 * ADR-0022 decision 3 allows picture → picture refinement, so the picture
 * column has internal depth and "depth is bounded by the pipeline" no longer
 * describes it. The column a node lands in is still its media type.
 */
const COLUMN: Record<LineageNodeKind, number> = {
  words: 0,
  picture: 1,
  clip: 2,
};

/**
 * Derive the space's layout from the lineage graph (ADR-0012 / ADR-0013 /
 * ADR-0022). Column is the node's media type; row is its position among the
 * nodes stacked in that column. Archived nodes are excluded (they persist but
 * never render). Nothing spatial is stored — this runs every render.
 *
 * Rows stack in array order, including along a refine chain. ADR-0022 names
 * chain-aware row assignment as real work for the layout engine; it is left
 * for the ticket that first produces a chain (#88/#89), because a layout
 * tuned against no real chain is a layout tuned against a guess.
 *
 * Generic over the node type so a render node's extra fields (label, media,
 * status) survive the layout pass untouched.
 */
export function computeLineageLayout<T extends LineageNode>(
  nodes: T[],
): Array<T & { column: number; row: number }> {
  const rowByColumn = new Map<number, number>();
  const positioned: Array<T & { column: number; row: number }> = [];
  for (const node of nodes) {
    if (node.archived) continue;
    const column = COLUMN[node.kind];
    const row = rowByColumn.get(column) ?? 0;
    rowByColumn.set(column, row + 1);
    positioned.push({ ...node, column, row });
  }
  return positioned;
}
