import type {
  TakeOrigin,
  TakeProductionProvenance,
  TakeSourceInput,
} from "@shared/types/session";
import type { Generation } from "../types";

/**
 * Fields the server writes onto a persisted take record that the client's
 * runtime `Generation` never carries.
 *
 * They live on the record rather than the type: `SessionGenerationRecordSchema`
 * validates them and passes them through, and
 * `normalizePersistedGeneration`'s bag passthrough keeps them on the object.
 * Reading them anywhere means reaching past `Generation`, so the reach happens
 * here once instead of at each site.
 *
 * `ancestorGenerationId` is the display ancestor — the picture→clip `move`
 * edge and the picture→picture `refine` edge (ADR-0013, ADR-0022 decision 3);
 * `archived` is the soft-removal flag the space honours. The admission trio
 * (`origin`, `productionProvenance`, `sourceInputs`, ADR-0022 decisions 1-3)
 * is here for a sharper reason than convenience: the client's merges pick
 * whole records, so a field absent from this list is dropped the first time a
 * local record wins — the wire would validate it and the client would still
 * lose it.
 *
 * The durable media handles (`storagePath`, `mediaAssetIds`, issue #125) are
 * here for that same reason. They are the server-owned, immutable identity of
 * the take's media (server side, `SERVER_OWNED_TAKE_FACTS`); a merge that
 * dropped them would strand the space node without the handle it needs to
 * re-arm or re-mint an expired URL. The ephemeral signed URLs (`mediaUrls`,
 * `thumbnailUrl`, `viewUrlExpiresAt`) are deliberately NOT here — they expire,
 * the server re-mints them on read, and the freshest one always wins.
 */
export const SERVER_OWNED_RECORD_FIELDS = [
  "ancestorGenerationId",
  "archived",
  "origin",
  "productionProvenance",
  "sourceInputs",
  "storagePath",
  "mediaAssetIds",
] as const;

const asBag = (gen: Generation): Record<string, unknown> =>
  gen as unknown as Record<string, unknown>;

export function readAncestorGenerationId(gen: Generation): string | null {
  const value = asBag(gen).ancestorGenerationId;
  return typeof value === "string" ? value : null;
}

export function readArchived(gen: Generation): boolean {
  return asBag(gen).archived === true;
}

/**
 * ADR-0022 decision 1. `undefined` for a take written before the contract —
 * read as "not recorded", never defaulted to `generated`, because inferring an
 * origin is exactly what the closed set exists to prevent.
 */
export function readTakeOrigin(gen: Generation): TakeOrigin | undefined {
  const value = asBag(gen).origin;
  return typeof value === "string" ? (value as TakeOrigin) : undefined;
}

/** ADR-0022 decision 2. Never conflated with the take's associated words. */
export function readProductionProvenance(
  gen: Generation,
): TakeProductionProvenance | undefined {
  const value = asBag(gen).productionProvenance;
  if (typeof value !== "object" || value === null) return undefined;
  return value as TakeProductionProvenance;
}

/** ADR-0022 decision 3: every contributing input, not just the drawn one. */
export function readSourceInputs(gen: Generation): TakeSourceInput[] {
  const value = asBag(gen).sourceInputs;
  return Array.isArray(value) ? (value as TakeSourceInput[]) : [];
}

/**
 * Issue #125: the take's durable storage path, when it records one. Read off
 * the bag because the runtime `Generation` never declared it — an admitted
 * take carries it outright, a generated take often does too.
 */
export function readStoragePath(gen: Generation): string | undefined {
  const value = asBag(gen).storagePath;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Issue #125: the take's durable asset id — the first of `mediaAssetIds`. The
 * one asset id the owner-checked resolver needs when there is no storage path.
 */
export function readMediaAssetId(gen: Generation): string | undefined {
  const value = asBag(gen).mediaAssetIds;
  if (!Array.isArray(value)) return undefined;
  const first = value.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.length > 0,
  );
  return first;
}

/**
 * Issue #125: when the server last minted this take's view URL expires. Stamped
 * by the read-path re-mint; a bag field the runtime `Generation` never
 * declared. A hint for the refresh loop, never an identity fact.
 */
export function readViewUrlExpiresAt(gen: Generation): string | undefined {
  const value = asBag(gen).viewUrlExpiresAt;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * The server-owned fields to re-apply after a merge that picks whole records:
 * whichever side still has them, preferring the incoming one.
 */
export function preserveServerOwnedFields(
  incoming: Generation,
  persisted: Generation,
): Record<string, unknown> {
  const restored: Record<string, unknown> = {};
  for (const field of SERVER_OWNED_RECORD_FIELDS) {
    const value = asBag(incoming)[field] ?? asBag(persisted)[field];
    if (value !== undefined) restored[field] = value;
  }
  return restored;
}
