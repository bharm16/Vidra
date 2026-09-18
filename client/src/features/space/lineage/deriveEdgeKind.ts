import type { EdgeKind, LineageNode } from "./types";

/**
 * Derive the kind of the edge from a node to its immediate ancestor
 * (ADR-0013, extended by ADR-0022 decision 3). Pure and total over the
 * endpoints:
 * - the root (no ancestor) is the `spine`;
 * - a clip (ancestor is a picture) is always a `move`;
 * - a words-version off another words-version is a `reword`;
 * - a picture whose ancestor is another picture is a `refine` — drawn inside
 *   the picture column, however deep the chain runs;
 * - a picture that shares its parent words-version with a sibling is a `roll`;
 *   a lone picture is on the `spine`.
 *
 * Because the kind is computed from the endpoints, the drawn relationship can
 * never contradict the nodes it connects — there is no stored label to rot.
 * `refine` joins the set the same way `move` did: derived, not persisted.
 */
export function deriveEdgeKind(
  node: LineageNode,
  nodes: LineageNode[],
): EdgeKind {
  if (node.ancestorId === null) return "spine";
  if (node.kind === "clip") return "move";
  if (node.kind === "words") return "reword";
  // node.kind === "picture". Picture → picture is a refinement; roll and spine
  // describe pictures hanging off a words-version, so the ancestor's kind is
  // what separates the two cases.
  const ancestor = nodes.find((candidate) => candidate.id === node.ancestorId);
  if (ancestor?.kind === "picture") return "refine";
  // A roll when it shares its words-version with a sibling picture, otherwise
  // the main line (spine).
  const siblingPictures = nodes.filter(
    (candidate) =>
      candidate.kind === "picture" &&
      candidate.ancestorId === node.ancestorId &&
      !candidate.archived,
  );
  return siblingPictures.length >= 2 ? "roll" : "spine";
}
