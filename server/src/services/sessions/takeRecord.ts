import { SessionGenerationRecordSchema } from "@shared/schemas/session.schemas";

/**
 * What a server writer must decide about a completed take; everything else the
 * record carries is stamped here.
 *
 * `ancestorGenerationId` is required on purpose (ADR-0013): `null` says "this
 * take roots at its words-version", a string names the source picture. The
 * storyboard writer used to omit the field entirely, which read the same as
 * null but left the decision invisible at the call site.
 */
export interface CompletedTakeRecordInput {
  id: string;
  model: string | null;
  mediaType: "image" | "image-sequence" | "video";
  prompt: string;
  promptVersionId: string;
  mediaUrls: string[];
  ancestorGenerationId: string | null;
  /** Omitted from the record when absent or empty. */
  mediaAssetIds?: string[] | undefined;
  /** `null` is meaningful — "this take has no still" — and is kept. */
  thumbnailUrl?: string | null | undefined;
  storagePath?: string | undefined;
}

/**
 * Build the persisted record for a completed take.
 *
 * The one writer-side counterpart to `normalizePersistedGeneration` (the one
 * reader): the picture route, the storyboard route, and the video worker each
 * assembled this record inline, which is why af16e933 had to fix
 * mediaType/tier/completedAt one writer at a time.
 *
 * Rules the shape carries by construction rather than by convention:
 * - `status`/`completedAt` are stamped — a record built here is a finished take.
 * - No `tier` field exists to forget: it is derived from `model` at read time
 *   (ADR-0021).
 * - The output is parsed against `SessionGenerationRecordSchema`, the same
 *   contract the sessions route holds client writes to — both writers of
 *   `version.generations` now answer to one schema.
 */
export function buildCompletedTakeRecord(
  input: CompletedTakeRecordInput,
): Record<string, unknown> {
  const record: Record<string, unknown> = {
    id: input.id,
    model: input.model,
    mediaType: input.mediaType,
    prompt: input.prompt,
    status: "completed",
    mediaUrls: input.mediaUrls,
    ...(input.mediaAssetIds?.length
      ? { mediaAssetIds: input.mediaAssetIds }
      : {}),
    ...(input.thumbnailUrl !== undefined
      ? { thumbnailUrl: input.thumbnailUrl }
      : {}),
    ...(input.storagePath ? { storagePath: input.storagePath } : {}),
    promptVersionId: input.promptVersionId,
    ancestorGenerationId: input.ancestorGenerationId,
    completedAt: new Date().toISOString(),
  };
  return SessionGenerationRecordSchema.parse(record);
}
