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
 * `ancestorGenerationId` is the picture→clip edge (ADR-0013); `archived` is the
 * soft-removal flag the space honours.
 */
export const SERVER_OWNED_RECORD_FIELDS = [
  "ancestorGenerationId",
  "archived",
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
