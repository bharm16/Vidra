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
    versionId: string;
    status?: SpaceNode["status"];
    mediaUrl?: string;
    archived?: boolean;
  }>;
  clips: Array<{
    id: string;
    pictureId: string;
    status?: SpaceNode["status"];
    mediaUrl?: string;
    archived?: boolean;
  }>;
}

const wordsNodeId = (versionId: string): string => `words-${versionId}`;

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
      ancestorId: wordsNodeId(picture.versionId),
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
      ...(clip.status ? { status: clip.status } : {}),
      ...(clip.mediaUrl ? { mediaUrl: clip.mediaUrl } : {}),
      ...(clip.archived ? { archived: true } : {}),
    });
  }

  return nodes;
}
