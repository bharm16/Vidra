import type { EdgeKind, LineageNode } from "./types";

/**
 * Derive the kind of the edge from a node to its immediate ancestor (ADR-0013).
 * Pure and total over the endpoints:
 * - the root (no ancestor) is the `spine`;
 * - a clip (ancestor is a picture) is always a `move`;
 * - a words-version off another words-version is a `reword`;
 * - a picture that shares its parent words-version with a sibling is a `roll`;
 *   a lone picture is on the `spine`.
 *
 * Because the kind is computed from the endpoints, the drawn relationship can
 * never contradict the nodes it connects — there is no stored label to rot.
 */
export function deriveEdgeKind(
  node: LineageNode,
  nodes: LineageNode[],
): EdgeKind {
  if (node.ancestorId === null) return "spine";
  if (node.kind === "clip") return "move";
  if (node.kind === "words") return "reword";
  // node.kind === "picture": a roll when it shares its words-version with a
  // sibling picture, otherwise the main line (spine).
  const siblingPictures = nodes.filter(
    (candidate) =>
      candidate.kind === "picture" &&
      candidate.ancestorId === node.ancestorId &&
      !candidate.archived,
  );
  return siblingPictures.length >= 2 ? "roll" : "spine";
}
