import { resolveTakePosterUrl } from "@/features/workspace-shell/utils/takePosterUrl";
import type { Generation } from "@features/generations/types";
import { buildSpaceNodes, type LineageInput } from "./buildSpaceNodes";
import type { SpaceNode } from "./types";

/**
 * ADR-0013 lineage and the soft-removal flag are written by the server and ride
 * `SessionGenerationRecordSchema`'s passthrough; they are not on the client's
 * runtime `Generation`, so they are read off the record here.
 */
function readAncestorGenerationId(gen: Generation): string | null {
  const value = (gen as { ancestorGenerationId?: unknown })
    .ancestorGenerationId;
  return typeof value === "string" ? value : null;
}

function readArchived(gen: Generation): boolean {
  return (gen as { archived?: unknown }).archived === true;
}

function mapStatus(status: string): SpaceNode["status"] {
  if (status === "completed") return "ready";
  if (status === "failed") return "failed";
  return "forming"; // pending | generating | anything still in flight
}

/**
 * The minimal structural shape this adapter needs from a persisted version.
 *
 * `generations` are already-typed takes: `normalizePersistedGeneration` is the
 * one place a persisted record is read out of its open bag, and it runs before
 * this (`normalizePersistedVersions` on load, `buildGeneration` at runtime).
 * This used to re-parse each record from `unknown` a second time — and because
 * that second read did no derivation, a clip persisted without `mediaType`
 * matched neither branch below and vanished from the space, even though the
 * first read had already healed it from the model.
 */
export interface VersionLineageInput {
  versionId: string;
  prompt: string;
  generations?: ReadonlyArray<Generation> | undefined;
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
    const generations = version.generations ?? [];
    const firstPictureId = generations.find(
      (gen) => gen.mediaType === "image",
    )?.id;

    for (const gen of generations) {
      // A clip's still is never its own video URL — the space renders mediaUrl
      // into an <img>, so resolveTakePosterUrl is the single place that rule
      // lives.
      const mediaUrl = resolveTakePosterUrl({
        mediaType: gen.mediaType,
        status: gen.status,
        ...(gen.thumbnailUrl ? { thumbnailUrl: gen.thumbnailUrl } : {}),
        mediaUrls: gen.mediaUrls,
      });
      const status = mapStatus(gen.status);
      const archived = readArchived(gen);

      if (gen.mediaType === "image") {
        pictures.push({
          id: gen.id,
          versionId: version.versionId,
          status,
          ...(mediaUrl ? { mediaUrl } : {}),
          ...(archived ? { archived: true } : {}),
        });
      } else if (gen.mediaType === "video") {
        clips.push({
          id: gen.id,
          pictureId:
            readAncestorGenerationId(gen) ??
            firstPictureId ??
            `words-${version.versionId}`,
          status,
          ...(mediaUrl ? { mediaUrl } : {}),
          ...(archived ? { archived: true } : {}),
        });
      }
      // "image-sequence" (storyboards) is deliberately not a node: the space
      // shows words → pictures → clips, and a storyboard is neither.
    }
  }

  return buildSpaceNodes({ words, pictures, clips });
}
