import { resolveTakePosterUrl } from "@/features/workspace-shell/utils/takePosterUrl";
import { buildSpaceNodes, type LineageInput } from "./buildSpaceNodes";
import type { SpaceNode } from "./types";

function mapStatus(status: string): SpaceNode["status"] {
  if (status === "completed") return "ready";
  if (status === "failed") return "failed";
  return "forming"; // pending | generating | anything still in flight
}

interface ReadGeneration {
  id: string;
  mediaType: string;
  status: SpaceNode["status"];
  mediaUrl?: string;
  ancestorGenerationId: string | null;
  archived: boolean;
}

/**
 * The minimal structural shape this adapter needs from a persisted version.
 * Deliberately loose (`generations` is `unknown[]`) so both the shared
 * `SessionPromptVersionEntry` and the client `PromptVersionEntry` satisfy it
 * without coupling the space to either — the anti-corruption boundary.
 */
export interface VersionLineageInput {
  versionId: string;
  prompt: string;
  generations?: ReadonlyArray<unknown> | undefined;
}

/**
 * Read a persisted generation record (a loose bag) into a typed shape. Returns
 * null for anything without a usable id — it cannot be a node.
 */
function readGeneration(record: unknown): ReadGeneration | null {
  if (typeof record !== "object" || record === null) return null;
  const bag = record as Record<string, unknown>;
  const id = typeof bag.id === "string" ? bag.id : null;
  if (!id) return null;
  const mediaType = typeof bag.mediaType === "string" ? bag.mediaType : "";
  const status = typeof bag.status === "string" ? bag.status : "";
  // A clip's still is never its own video URL — the space renders mediaUrl into
  // an <img>, so resolveTakePosterUrl is the single place that rule lives.
  const media = resolveTakePosterUrl({
    mediaType,
    status,
    thumbnailUrl:
      typeof bag.thumbnailUrl === "string" ? bag.thumbnailUrl : undefined,
    mediaUrls: Array.isArray(bag.mediaUrls)
      ? bag.mediaUrls.filter((u): u is string => typeof u === "string")
      : [],
  });
  return {
    id,
    mediaType,
    status: mapStatus(status),
    ...(media ? { mediaUrl: media } : {}),
    ancestorGenerationId:
      typeof bag.ancestorGenerationId === "string"
        ? bag.ancestorGenerationId
        : null,
    archived: bag.archived === true,
  };
}

/**
 * Adapt the session's PERSISTED versions into the space's lineage nodes
 * (ADR-0013). It reads the durable `versions` array, so the space survives
 * reload and shows the full reword chain. Reword edges follow version order —
 * each version is reworded from the previous; a picture roots at its version;
 * a clip links to its
 * persisted source picture (`ancestorGenerationId`), falling back to the first
 * picture in the same version, then the words node. Pure and total.
 */
export function deriveSpaceNodesFromVersions(
  versions: ReadonlyArray<VersionLineageInput>,
): SpaceNode[] {
  const words: LineageInput["words"] = versions.map((version, index) => ({
    versionId: version.versionId,
    label: version.prompt,
    ...(index > 0 ? { rewordedFrom: versions[index - 1]!.versionId } : {}),
  }));

  const pictures: LineageInput["pictures"] = [];
  const clips: LineageInput["clips"] = [];

  for (const version of versions) {
    const generations = (version.generations ?? [])
      .map(readGeneration)
      .filter((gen): gen is ReadGeneration => gen !== null);
    const firstPictureId = generations.find(
      (gen) => gen.mediaType === "image",
    )?.id;

    for (const gen of generations) {
      if (gen.mediaType === "image") {
        pictures.push({
          id: gen.id,
          versionId: version.versionId,
          status: gen.status,
          ...(gen.mediaUrl ? { mediaUrl: gen.mediaUrl } : {}),
          ...(gen.archived ? { archived: true } : {}),
        });
      } else if (gen.mediaType === "video") {
        clips.push({
          id: gen.id,
          pictureId:
            gen.ancestorGenerationId ??
            firstPictureId ??
            `words-${version.versionId}`,
          status: gen.status,
          ...(gen.mediaUrl ? { mediaUrl: gen.mediaUrl } : {}),
          ...(gen.archived ? { archived: true } : {}),
        });
      }
    }
  }

  return buildSpaceNodes({ words, pictures, clips });
}
