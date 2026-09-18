import { resolveTakePosterUrl } from "@/features/workspace-shell/utils/takePosterUrl";
import { wordsNodeId } from "./buildSpaceNodes";
import type { Generation } from "@features/generations/types";
import {
  readAncestorGenerationId,
  readArchived,
} from "@features/generations/utils/serverOwnedRecordFields";
import { buildSpaceNodes, type LineageInput } from "./buildSpaceNodes";
import type { SpaceNode } from "./types";

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
 * reload and shows the full reword chain. A picture roots at its version; a
 * clip links to its persisted source picture (`ancestorGenerationId`), and
 * when none was recorded it hangs from the words node with its picture
 * ancestry marked explicitly unknown (ADR-0022 decision 3). Pure and total.
 *
 * The clip's fallback used to be "whichever picture this version lists first",
 * which drew a relationship nobody performed and which the space rendered
 * exactly like a real one. Derived ancestry is out; recorded ancestry, or an
 * honest gap.
 *
 * NOT fixed here, and deliberately: the REWORD edge between words-versions is
 * still derived from array order below. That is the open ADR-0013 M4 gap —
 * out of scope for take ancestry, noted so the next reader does not mistake
 * it for the same bug.
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
        const ancestorId = readAncestorGenerationId(gen);
        clips.push({
          id: gen.id,
          pictureId: ancestorId ?? wordsNodeId(version.versionId),
          status,
          ...(mediaUrl ? { mediaUrl } : {}),
          ...(archived ? { archived: true } : {}),
          ...(ancestorId ? {} : { pictureAncestryUnknown: true }),
          // ADR-0022 decision 6: a clip whose session write did not resolve is
          // drawn as made-but-not-saved rather than as a settled node that
          // disappears on the next refresh. Only clips carry this here — an
          // unattached first frame is surfaced on the frame stage, where the
          // creator is already looking at it.
          ...(gen.attachment === "failed" ? { unattached: true } : {}),
        });
      }
      // "image-sequence" (storyboards) is deliberately not a node: the space
      // shows words → pictures → clips, and a storyboard is neither.
    }
  }

  return buildSpaceNodes({ words, pictures, clips });
}
