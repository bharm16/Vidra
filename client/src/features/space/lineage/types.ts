/**
 * The lineage model behind "the space" (ADR-0012 / ADR-0013).
 *
 * Each take is a node in three fixed generations — words → pictures → clips.
 * The edge SET is persisted as an immediate-ancestor reference; the edge KIND
 * and the LAYOUT are derived, never stored.
 */
export type LineageNodeKind = "words" | "picture" | "clip";

/** The verb that made the edge — derived from the two endpoints, never stored. */
export type EdgeKind = "spine" | "roll" | "reword" | "move";

export interface LineageNode {
  id: string;
  kind: LineageNodeKind;
  /** Immediate ancestor (ADR-0013); null for the root words-node. */
  ancestorId: string | null;
  /** A removed leaf persists but is excluded from the render (ADR-0012). */
  archived?: boolean;
  /**
   * ADR-0022 decision 3: this take has no persisted picture ancestor, so it
   * hangs from its words-version instead. The edge means "we know which words
   * this belongs to" — NOT "these words were its complete production
   * ancestry". Recorded rather than guessed: sibling order is not evidence,
   * and an edge the creator never performed is worse than an absent one.
   */
  pictureAncestryUnknown?: boolean;
  /**
   * ADR-0022 decision 6: the media exists, and the session does not have it.
   * Drawn as "made but not saved" with a retry, never as a settled node.
   */
  unattached?: boolean;
}

export interface PositionedNode extends LineageNode {
  /** 0 = words, 1 = pictures, 2 = clips. */
  column: number;
  row: number;
}

/** A lineage node enriched for rendering in the space. */
export interface SpaceNode extends LineageNode {
  /** Caption — the paired words text, or a short label. */
  label?: string;
  /** A ready still, or a clip poster, shown inside the node. */
  mediaUrl?: string;
  /** Lifecycle state — drives the waiting / failed treatments. */
  status?: "forming" | "ready" | "failed";
}
