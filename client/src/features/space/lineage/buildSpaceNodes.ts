import type { SpaceNode } from "./types";

/**
 * The session's takes, with ancestor links supplied explicitly by the caller.
 * Today those links are derived from words-version identity; ADR-0013 persists
 * them. Either way the mapper is a pure, total transform over this shape.
 */
export interface LineageInput {
  words: Array<{
    versionId: string;
    label: string;
    /** The words-version this one was reworded from; absent for the root. */
    rewordedFrom?: string | null;
  }>;
  pictures: Array<{
    id: string;
    /**
     * The enclosing version this picture is listed under — the words-node it
     * hangs from for DRAWING when it has no picture ancestor. Distinct from
     * `wordsVersionId`, which is what restore reads.
     */
    versionId: string;
    /**
     * ADR-0022 decision 2: the words-version this take is FILED UNDER — its
     * associated words, the restore target. Defaults to `versionId` when the
     * caller does not distinguish them (the common same-version case).
     */
    wordsVersionId?: string;
    status?: SpaceNode["status"];
    mediaUrl?: string;
    archived?: boolean;
    /**
     * ADR-0022 decision 3: the picture this one was refined from, when one was
     * RECORDED. Absent means the picture roots at its words-version — which is
     * the truth for a generated picture and for an upload alike, not a
     * fallback. The caller decides; nothing here reads sibling order.
     */
    ancestorPictureId?: string;
  }>;
  clips: Array<{
    id: string;
    /**
     * The clip's immediate ancestor: its source picture, or — when no picture
     * ancestor was ever recorded — its words-node, paired with
     * `pictureAncestryUnknown`.
     */
    pictureId: string;
    /**
     * ADR-0022 decision 2: the words-version this take is FILED UNDER — its
     * associated words, the restore target. A clip's source picture may belong
     * to an older words-version, so this is never derived from `pictureId`.
     */
    wordsVersionId?: string;
    status?: SpaceNode["status"];
    mediaUrl?: string;
    archived?: boolean;
    pictureAncestryUnknown?: boolean;
    unattached?: boolean;
  }>;
}

/** The words-node id convention. Exported so derivers never restate the
 * format — a hand-built `words-…` string that drifts from this breaks the
 * clip→words fallback edge silently. */
export const wordsNodeId = (versionId: string): string => `words-${versionId}`;

export function buildSpaceNodes(input: LineageInput): SpaceNode[] {
  const nodes: SpaceNode[] = [];

  for (const words of input.words) {
    nodes.push({
      id: wordsNodeId(words.versionId),
      kind: "words",
      ancestorId: words.rewordedFrom ? wordsNodeId(words.rewordedFrom) : null,
      label: words.label,
    });
  }

  for (const picture of input.pictures) {
    nodes.push({
      id: picture.id,
      kind: "picture",
      ancestorId: picture.ancestorPictureId ?? wordsNodeId(picture.versionId),
      // Associated words (restore) is a separate relationship from the display
      // ancestor above; it defaults to the enclosing version when undistinguished.
      wordsVersionId: picture.wordsVersionId ?? picture.versionId,
      ...(picture.status ? { status: picture.status } : {}),
      ...(picture.mediaUrl ? { mediaUrl: picture.mediaUrl } : {}),
      ...(picture.archived ? { archived: true } : {}),
    });
  }

  for (const clip of input.clips) {
    nodes.push({
      id: clip.id,
      kind: "clip",
      ancestorId: clip.pictureId,
      ...(clip.wordsVersionId ? { wordsVersionId: clip.wordsVersionId } : {}),
      ...(clip.status ? { status: clip.status } : {}),
      ...(clip.mediaUrl ? { mediaUrl: clip.mediaUrl } : {}),
      ...(clip.archived ? { archived: true } : {}),
      ...(clip.pictureAncestryUnknown ? { pictureAncestryUnknown: true } : {}),
      ...(clip.unattached ? { unattached: true } : {}),
    });
  }

  return nodes;
}
