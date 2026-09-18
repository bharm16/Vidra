import { SessionGenerationRecordSchema } from "@shared/schemas/session.schemas";
import type {
  TakeOrigin,
  TakeProductionProvenance,
  TakeSourceInput,
} from "@shared/types/session";

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
  /**
   * ADR-0022 decision 1. Defaults to `generated`, which is what the three
   * generating writers are and lets them stay untouched; an admitted take
   * names its own door.
   */
  origin?: TakeOrigin | undefined;
  /**
   * ADR-0022 decision 2. Defaults to the generating case — the prompt and
   * model that ran ARE the provenance there. An admission must pass its own,
   * including the explicit `{ state: "unknown" }` an upload records.
   */
  productionProvenance?: TakeProductionProvenance | undefined;
  /** ADR-0022 decision 3. Omitted from the record when absent or empty. */
  sourceInputs?: readonly TakeSourceInput[] | undefined;
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
 * - `origin` and `productionProvenance` are always present (ADR-0022
 *   decisions 1 and 2). Their defaults describe the generating case exactly,
 *   so the three generating writers need not name them and cannot record a
 *   lie by omission; an admitted take overrides both.
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
    origin: input.origin ?? "generated",
    productionProvenance: input.productionProvenance ?? {
      state: "known",
      instruction: input.prompt,
      model: input.model,
    },
    ...(input.sourceInputs?.length
      ? { sourceInputs: [...input.sourceInputs] }
      : {}),
    completedAt: new Date().toISOString(),
  };
  return SessionGenerationRecordSchema.parse(record);
}
