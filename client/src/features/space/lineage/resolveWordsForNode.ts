import { wordsNodeId } from "./buildSpaceNodes";
import type { SpaceNode } from "./types";

/**
 * The associated words for a node — the take-restore contract (ADR-0012,
 * ADR-0022 decision 2). Returns the caption of the words-version the take is
 * FILED UNDER, carried explicitly on the node as `wordsVersionId`.
 *
 * It does NOT walk the display-ancestor chain: display ancestry (what the space
 * draws — a clip's source picture, a refined picture's origin) and associated
 * words (what returns to the input) are different relationships. A clip made
 * from a picture of an older words-version must restore its OWN words, not the
 * picture's, so the walk would restore the wrong version. A words node is its
 * own associated words. Null when no labelled words-version is found. Pure so
 * the restore wiring stays trivial.
 */
export function resolveWordsForNode(
  nodeId: string,
  nodes: SpaceNode[],
): string | null {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const node = byId.get(nodeId);
  if (!node) return null;
  if (node.kind === "words") return node.label ?? null;
  if (!node.wordsVersionId) return null;
  return byId.get(wordsNodeId(node.wordsVersionId))?.label ?? null;
}
