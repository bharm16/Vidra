import { resolveTakePosterUrl } from "@/features/workspace-shell/utils/takePosterUrl";
import { wordsNodeId } from "./buildSpaceNodes";
import type { Generation } from "@features/generations/types";
import {
  readAncestorGenerationId,
  readArchived,
  readMediaAssetId,
  readStoragePath,
  readViewUrlExpiresAt,
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
  /**
   * ADR-0013 / issue #116: the PERSISTED reword parent — the words-version
   * this one was reworded from. The reword edge is drawn from this recorded
   * fact, never from array order. Absent = the root or a legacy version, which
   * draws no reword edge (an explicit unknown, not a chain).
   */
  rewordedFromVersionId?: string | undefined;
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
 * The REWORD edge between words-versions is persisted the same way (issue
 * #116, closing the ADR-0013 M4 gap): each words-version carries the version
 * it was reworded FROM in `rewordedFromVersionId`, so a reword of an OLDER
 * version branches off that older version and neither reordering nor
 * concurrent creation can move the edge. Array position is no longer read. A
 * version with no recorded parent — the root, or a legacy entry written
 * before the field existed — draws no reword edge rather than being chained to
 * the preceding array entry: an honest unknown, not a fabricated line.
 */
export function deriveSpaceNodesFromVersions(
  versions: ReadonlyArray<VersionLineageInput>,
): SpaceNode[] {
  // The set of words-versions that exist in this session, so neither a reword
  // edge nor a take's own words-version can ever point at a words node that
  // does not get built.
  const versionIds = new Set(versions.map((v) => v.versionId));

  const words: LineageInput["words"] = versions.map((version) => {
    // ADR-0013 / issue #116: the reword edge comes from the PERSISTED parent,
    // never array order. A parent that names this same version, or one absent
    // from this session, draws no edge rather than a wrong one.
    const rewordedFrom =
      version.rewordedFromVersionId &&
      version.rewordedFromVersionId !== version.versionId &&
      versionIds.has(version.rewordedFromVersionId)
        ? version.rewordedFromVersionId
        : undefined;
    return {
      versionId: version.versionId,
      label: version.prompt,
      ...(rewordedFrom ? { rewordedFrom } : {}),
    };
  });

  const pictures: LineageInput["pictures"] = [];
  const clips: LineageInput["clips"] = [];

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
        // Issue #125: the durable media handle, carried onto the node beside
        // the URL. Read straight off the record — never fabricated when a take
        // records none (a picture with neither handle is simply unrecoverable
        // once its URL dies, which is the honest state, not a namespace guess).
        const storagePath = readStoragePath(gen);
        const assetId = readMediaAssetId(gen);
        const viewUrlExpiresAt = readViewUrlExpiresAt(gen);
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
          ...(storagePath ? { storagePath } : {}),
          ...(assetId ? { assetId } : {}),
          ...(viewUrlExpiresAt ? { viewUrlExpiresAt } : {}),
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
