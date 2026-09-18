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
 * reload and shows the full reword chain. `ancestorGenerationId` is the
 * DISPLAY ANCESTOR (ADR-0022 decision 3) and is read the same way for both
 * media types: a clip links to its source picture (a `move` edge), a picture
 * to the picture it was refined from (a `refine` edge, inside the picture
 * column). When none was recorded a picture roots at its words-version, and a
 * clip hangs from the words node with its picture ancestry marked explicitly
 * unknown. Pure and total.
 *
 * Separately from that display ancestor, every take is stamped with its
 * ASSOCIATED words-version (ADR-0022 decision 2) — the words restored into the
 * input on selection or arming. That is the take's OWN `promptVersionId`, not
 * the words its display ancestor descends from: a clip made from a picture of
 * an older words-version restores its own version, never the picture's. The
 * two are different relationships, so restore never walks the ancestor chain.
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

  // The set of words-versions that exist in this session, so a take's own
  // words-version can only ever point at a words node that gets built.
  const versionIds = new Set(versions.map((v) => v.versionId));

  for (const version of versions) {
    const generations = version.generations ?? [];

    for (const gen of generations) {
      // ADR-0022 decision 2 (issue #111): the take's ASSOCIATED words-version —
      // the words restored on selection or arming — is the version the take is
      // filed under (`promptVersionId`), NOT the enclosing version array it is
      // listed in and NOT its display ancestor's words. Fall back to the
      // enclosing version when the record names no own version, or names one
      // this session no longer holds.
      const wordsVersionId =
        gen.promptVersionId && versionIds.has(gen.promptVersionId)
          ? gen.promptVersionId
          : version.versionId;
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
        // ADR-0022 decision 3: a picture may name a picture as its display
        // ancestor (a studio refinement). When it does, the edge is drawn
        // inside the picture column; when it does not — a generated picture,
        // an admitted upload — it roots at its words-version as before.
        const pictureAncestorId = readAncestorGenerationId(gen);
        pictures.push({
          id: gen.id,
          versionId: version.versionId,
          wordsVersionId,
          status,
          ...(mediaUrl ? { mediaUrl } : {}),
          ...(archived ? { archived: true } : {}),
          ...(pictureAncestorId
            ? { ancestorPictureId: pictureAncestorId }
            : {}),
        });
      } else if (gen.mediaType === "video") {
        const ancestorId = readAncestorGenerationId(gen);
        clips.push({
          id: gen.id,
          pictureId: ancestorId ?? wordsNodeId(version.versionId),
          wordsVersionId,
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
