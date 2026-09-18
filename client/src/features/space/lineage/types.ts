/**
 * The lineage model behind "the space" (ADR-0012 / ADR-0013 / ADR-0022).
 *
 * Each take is a node in one of three columns — words, pictures, clips. The
 * columns are MEDIA TYPES, not generations (ADR-0022 decision 3): a picture
 * may descend from another picture, so the picture column has internal depth.
 * The edge SET is persisted as an immediate-ancestor reference; the edge KIND
 * and the LAYOUT are derived, never stored.
 */
export type LineageNodeKind = "words" | "picture" | "clip";

/**
 * The verb that made the edge — derived from the two endpoints, never stored.
 * `refine` is the picture → picture relationship ADR-0022 decision 3 allows,
 * drawn inside the picture column.
 */
export type EdgeKind = "spine" | "roll" | "reword" | "move" | "refine";

export interface LineageNode {
  id: string;
  kind: LineageNodeKind;
  /** Immediate ancestor (ADR-0013); null for the root words-node. */
  ancestorId: string | null;
  /**
   * ADR-0022 decision 2: the words-version this TAKE is filed under — its
   * associated words, restored into the input on selection or arming. Carried
   * explicitly because it is a DIFFERENT relationship from `ancestorId`: the
   * display ancestor is what the space draws (a clip's source picture, a
   * refined picture's origin), and a clip made from a picture of an older
   * words-version must restore its own words, not the picture's. Absent on
   * words nodes, which ARE the words-version rather than a take filed under one.
   */
  wordsVersionId?: string;
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
