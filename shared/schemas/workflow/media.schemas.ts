import { z } from "zod";
import { ResolvedInputSchema } from "./draft.schemas";
import { OwnerIdSchema, ProjectIdSchema, RequestIdSchema, SlotIdSchema, TimestampSchema, VersionIdSchema, WorkflowSchemaVersion } from "./identity.schemas";

export const OwnedObjectSchema = z.discriminatedUnion("identity", [
  z.strictObject({ identity: z.literal("verified"), assetId: z.string().min(1), storagePath: z.string().min(1).refine(value => !value.includes("://") && !value.split("/").includes("..")), generation: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().positive() }),
  z.strictObject({ identity: z.literal("unknown"), assetId: z.string().min(1), storagePath: z.string().min(1).refine(value => !value.includes("://") && !value.split("/").includes("..")) }),
]);
export const MediaMetadataSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("pending") }),
  z.strictObject({ state: z.literal("failed"), reason: z.string().min(1) }),
  z.strictObject({
    state: z.literal("verified"),
    width: z.number().int().positive(), height: z.number().int().positive(),
    durationSeconds: z.number().nonnegative(),
    audio: z.enum(["present", "absent"]),
    framesPerSecond: z.number().positive().optional(),
    probeVersion: z.string().min(1),
  }),
]);
export type MediaMetadata = z.infer<typeof MediaMetadataSchema>;

export const MediaOriginSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("generated"), requestId: RequestIdSchema, slotId: SlotIdSchema }),
  z.strictObject({ kind: z.literal("upload") }),
  z.strictObject({ kind: z.literal("sketch"), requestId: RequestIdSchema, captureId: z.string().min(1) }),
  z.strictObject({ kind: z.literal("copy"), versionId: VersionIdSchema, projectId: ProjectIdSchema }),
  z.strictObject({ kind: z.literal("legacy"), system: z.enum(["session", "studio"]), recordId: z.string().min(1), mediaId: z.string().min(1), history: z.literal("unknown") }),
]);
export const MediaVersionSchema = z.strictObject({
  schemaVersion: WorkflowSchemaVersion,
  id: VersionIdSchema,
  ownerId: OwnerIdSchema,
  projectId: ProjectIdSchema,
  kind: z.enum(["image", "video", "audio", "export"]),
  label: z.string().min(1).max(300),
  origin: MediaOriginSchema,
  sourceInputs: z.array(ResolvedInputSchema).max(16),
  object: OwnedObjectSchema,
  metadata: MediaMetadataSchema,
  association: z.enum(["linked", "recovery"]),
  createdAt: TimestampSchema,
});
export type MediaVersion = z.infer<typeof MediaVersionSchema>;
