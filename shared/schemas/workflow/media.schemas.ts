import { z } from "zod";
import { ResolvedInputSchema } from "./draft.schemas";
import { EditIdSchema, OwnerIdSchema, ProjectIdSchema, RequestIdSchema, RevisionSchema, SlotIdSchema, TimestampSchema, VersionIdSchema, WorkflowSchemaVersion } from "./identity.schemas";
import { ImportContentTypeSchema } from "./import.schemas";

export const OwnedObjectSchema = z.discriminatedUnion("identity", [
  z.strictObject({ identity: z.literal("verified"), assetId: z.string().min(1), storagePath: z.string().min(1).refine(value => !value.includes("://") && !value.split("/").includes("..")), generation: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().positive() }),
  z.strictObject({ identity: z.literal("unknown"), assetId: z.string().min(1), storagePath: z.string().min(1).refine(value => !value.includes("://") && !value.split("/").includes("..")) }),
]);
export const MediaMetadataSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("pending") }),
  z.strictObject({ state: z.literal("failed"), reason: z.string().min(1) }),
  z.strictObject({
    state: z.literal("verified"),
    width: z.number().int().positive().optional(), height: z.number().int().positive().optional(),
    durationSeconds: z.number().nonnegative(),
    audio: z.enum(["present", "absent"]),
    contentType: ImportContentTypeSchema.optional(),
    framesPerSecond: z.number().positive().optional(),
    probeVersion: z.string().min(1),
  }),
]);
export type MediaMetadata = z.infer<typeof MediaMetadataSchema>;

export const MediaOriginSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("generated"), requestId: RequestIdSchema, slotId: SlotIdSchema }),
  z.strictObject({ kind: z.literal("upload") }),
  z.strictObject({ kind: z.literal("export"), exportId: z.string().regex(/^export_[A-Za-z0-9_-]+$/), editId: EditIdSchema, revision: RevisionSchema }),
  z.strictObject({ kind: z.literal("frame"), versionId: VersionIdSchema, timestampSeconds: z.number().nonnegative() }),
  z.strictObject({ kind: z.literal("sketch-capture"), captureId: z.string().min(1).max(160) }),
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
  hidden: z.boolean().optional(),
  preferred: z.boolean().optional(),
  favorite: z.boolean().optional(),
  createdAt: TimestampSchema,
}).superRefine((version, ctx) => {
  if (version.metadata.state !== "verified") return;
  const contentKind = version.kind === "export" ? "video" : version.kind;
  if (version.metadata.contentType !== undefined && !version.metadata.contentType.startsWith(`${contentKind}/`)) ctx.addIssue({ code: "custom", path: ["metadata", "contentType"], message: "Verified content type must match the media kind" });
  if (version.kind === "audio") {
    if (version.metadata.width !== undefined || version.metadata.height !== undefined || version.metadata.framesPerSecond !== undefined || version.metadata.audio !== "present" || version.metadata.durationSeconds <= 0) ctx.addIssue({ code: "custom", path: ["metadata"], message: "Audio metadata must describe a playable audio stream without invented visual geometry" });
  } else if (version.metadata.width === undefined || version.metadata.height === undefined) {
    ctx.addIssue({ code: "custom", path: ["metadata"], message: "Verified visual media requires its actual pixel dimensions" });
  }
});
export type MediaVersion = z.infer<typeof MediaVersionSchema>;
