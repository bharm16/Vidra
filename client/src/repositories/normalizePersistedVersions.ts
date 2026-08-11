import { normalizePersistedGenerations } from "@features/generations/utils/normalizePersistedGeneration";
import type { PromptVersionEntry } from "../hooks/types";

/**
 * Read the persisted `versions` array off a session into the client's domain
 * shape.
 *
 * The session contract keeps a version's `generations` as an open bag (see
 * `SessionGenerationRecordSchema`), so this is the boundary that turns those
 * bags into `Generation`s — deriving the fields the wire does not guarantee
 * rather than casting and hoping. Every other version field is carried through
 * untouched; this is a normalization, not a projection.
 *
 * Both repositories go through here, which is what makes it the single seam:
 * the space, the gallery, the timeline, and history all read versions that one
 * of the two produced.
 */
export function normalizePersistedVersions(
  versions: unknown,
): PromptVersionEntry[] {
  if (!Array.isArray(versions)) return [];

  return versions.map((version) => {
    const entry = version as PromptVersionEntry & {
      generations?: unknown;
      /** Pre-2026-08-10 spelling of `firstFrame`. */
      preview?: PromptVersionEntry["firstFrame"];
    };

    // Fold the retired `preview` spelling into `firstFrame` and drop it, so
    // exactly one name for the first frame exists past this boundary. A
    // session migrates to the new spelling the first time it is saved.
    const { preview, ...rest } = entry;
    const firstFrame = rest.firstFrame ?? preview;

    return {
      ...rest,
      ...(firstFrame ? { firstFrame } : {}),
      ...(entry.generations === undefined
        ? {}
        : { generations: normalizePersistedGenerations(entry.generations) }),
    };
  });
}
