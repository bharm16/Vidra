import {
  deriveGenerationMediaType,
  deriveGenerationTier,
} from "../config/generationConfig";
import type { Generation, GenerationStatus } from "../types";

const GENERATION_STATUSES: ReadonlySet<string> = new Set<GenerationStatus>([
  "pending",
  "generating",
  "completed",
  "failed",
]);

const toEpochMs = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];

/**
 * Read one persisted generation record into a `Generation`.
 *
 * `SessionGenerationRecordSchema` is an open bag by contract — it validates the
 * three lineage fields and lets the rest ride along — so a record reaching the
 * client is `unknown` in everything but name. Before ADR-0021 the repositories
 * cast the bag straight to `Generation`, which made `tsc` believe four fields
 * the wire does not guarantee:
 *
 *  - `tier` was stamped `"draft"` by every writer regardless of model.
 *  - `mediaType` was absent on clips, so the space matched neither its picture
 *    nor its clip branch and dropped them.
 *  - `completedAt` arrives as an ISO string, not the epoch ms the type claims,
 *    so the gallery's `a.createdAt - b.createdAt` sort produced NaN.
 *  - `createdAt` is not written at all.
 *
 * This is the one place that gap is closed. Tier and media type are derived
 * from `model`, so records written before their writers were fixed read
 * correctly with no backfill. Returns null for a record with no usable id — it
 * cannot be a take.
 */
export function normalizePersistedGeneration(
  record: unknown,
): Generation | null {
  if (typeof record !== "object" || record === null) return null;
  const bag = record as Record<string, unknown>;

  const id = typeof bag.id === "string" && bag.id.length > 0 ? bag.id : null;
  if (!id) return null;

  const model = typeof bag.model === "string" ? bag.model : "unknown";
  const persistedMediaType =
    typeof bag.mediaType === "string" ? bag.mediaType : null;

  const completedAt = toEpochMs(bag.completedAt);

  return {
    // Deliberate passthrough: the contract keeps this bag open, so fields the
    // UI reads opportunistically (thumbnailUrl, isFavorite, storagePath,
    // ancestorGenerationId, generationSettings, …) must survive. Every field
    // the wire cannot guarantee is overridden below.
    ...(bag as unknown as Generation),
    id,
    model,
    tier: deriveGenerationTier(model),
    // A persisted media type always wins. Otherwise derive it, and fall back to
    // "video": the clip writer is the only one that ever omitted the field.
    mediaType:
      (persistedMediaType as Generation["mediaType"] | null) ??
      deriveGenerationMediaType(model) ??
      "video",
    status:
      typeof bag.status === "string" && GENERATION_STATUSES.has(bag.status)
        ? (bag.status as GenerationStatus)
        : "completed",
    prompt: typeof bag.prompt === "string" ? bag.prompt : "",
    promptVersionId:
      typeof bag.promptVersionId === "string" ? bag.promptVersionId : null,
    mediaUrls: toStringArray(bag.mediaUrls),
    createdAt: toEpochMs(bag.createdAt) ?? completedAt ?? 0,
    completedAt,
  };
}

/**
 * Read a version's persisted `generations` array, dropping records that cannot
 * be takes. Total and pure.
 */
export function normalizePersistedGenerations(value: unknown): Generation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizePersistedGeneration)
    .filter((gen): gen is Generation => gen !== null);
}
