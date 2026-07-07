import { buildSpaceNodes } from "./buildSpaceNodes";
import type { SpaceNode } from "./types";

/** A live generation, as the workspace knows it, before it becomes a node. */
export interface SpaceSourceGeneration {
  id: string;
  mediaType: string;
  status: string;
  thumbnailUrl?: string;
  mediaUrls?: string[];
  /** The picture this clip was generated from, when known. */
  sourcePictureId?: string;
}

function mapStatus(status: string): SpaceNode["status"] {
  if (status === "completed") return "ready";
  if (status === "failed") return "failed";
  return "forming"; // pending | generating | anything still in flight
}

function mediaOf(gen: SpaceSourceGeneration): string | undefined {
  return gen.thumbnailUrl ?? gen.mediaUrls?.[0];
}

/**
 * Adapt the session's live generations into the space's lineage nodes.
 *
 * Ancestors are derived for the current session — every picture rolls off the
 * one words-version, and a clip links to its source picture (or, absent an
 * explicit source, the first picture). ADR-0013 persists these links later; the
 * adapter stays a pure transform so the mapping is fully testable.
 */
export function deriveSpaceNodes(input: {
  prompt: string;
  promptVersionId: string;
  generations: SpaceSourceGeneration[];
}): SpaceNode[] {
  const pictures = input.generations.filter((g) => g.mediaType === "image");
  const clips = input.generations.filter((g) => g.mediaType === "video");
  const rootWordsId = `words-${input.promptVersionId}`;
  const fallbackPictureId = pictures[0]?.id ?? rootWordsId;

  return buildSpaceNodes({
    words: [{ versionId: input.promptVersionId, label: input.prompt }],
    pictures: pictures.map((picture) => {
      const media = mediaOf(picture);
      return {
        id: picture.id,
        versionId: input.promptVersionId,
        status: mapStatus(picture.status),
        ...(media ? { mediaUrl: media } : {}),
      };
    }),
    clips: clips.map((clip) => {
      const media = mediaOf(clip);
      return {
        id: clip.id,
        pictureId: clip.sourcePictureId ?? fallbackPictureId,
        status: mapStatus(clip.status),
        ...(media ? { mediaUrl: media } : {}),
      };
    }),
  });
}
