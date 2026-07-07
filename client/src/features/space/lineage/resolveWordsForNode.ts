import type { SpaceNode } from "./types";

/**
 * The paired words for a node — the take-restore contract (ADR-0012). Walks
 * the immediate-ancestor chain up to the words node and returns its caption
 * (the prompt text). A words node returns its own label; a picture/clip returns
 * the words it descends from. Null when there is no labelled words ancestor.
 * Pure so the restore wiring stays trivial.
 */
export function resolveWordsForNode(
  nodeId: string,
  nodes: SpaceNode[],
): string | null {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  let current = byId.get(nodeId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.kind === "words") {
      return current.label ?? null;
    }
    current = current.ancestorId ? byId.get(current.ancestorId) : undefined;
  }
  return null;
}
