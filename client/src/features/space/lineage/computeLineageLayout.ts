import type { LineageNode, LineageNodeKind } from "./types";

/** The three fixed generations, as columns (ADR-0012). Depth is bounded here. */
const COLUMN: Record<LineageNodeKind, number> = {
  words: 0,
  picture: 1,
  clip: 2,
};

/**
 * Derive the space's layout from the lineage graph (ADR-0012 / ADR-0013).
 * Column is the node's generation; row is its position among the nodes stacked
 * in that column. Archived nodes are excluded (they persist but never render).
 * Nothing spatial is stored — this runs every render.
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
