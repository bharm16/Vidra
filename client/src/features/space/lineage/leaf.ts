import type { SpaceNode } from "./types";

/**
 * The ids that some LIVE node names as ancestor — i.e. the non-leaves. Archived
 * nodes are gone from the space, so they don't keep a parent alive. This
 * mirrors the server's leaf rule (SessionService.archiveGeneration) so the UI
 * only offers Remove where the server will honour it.
 */
export function nonLeafIds(nodes: SpaceNode[]): Set<string> {
  const ids = new Set<string>();
  for (const node of nodes) {
    if (node.archived) continue;
    if (node.ancestorId) ids.add(node.ancestorId);
  }
  return ids;
}

/**
 * A node is a removable leaf iff nothing live descends from it AND it is a
 * generation record (a picture or clip). Words-versions are not generation
 * records — removal soft-archives generations only (ADR-0012).
 */
export function isRemovableLeaf(
  node: SpaceNode,
  nonLeaves: Set<string>,
): boolean {
  return node.kind !== "words" && !nonLeaves.has(node.id);
}
