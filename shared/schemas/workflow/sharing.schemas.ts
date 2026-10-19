import { z } from "zod";
import { OwnerIdSchema, ProjectIdSchema, TimestampSchema, VersionIdSchema } from "./identity.schemas";

export const WorkflowShareIdSchema = z.string().uuid();
export const PublishVersionSchema = z.strictObject({ id: WorkflowShareIdSchema, versionId: VersionIdSchema });
export const VersionShareSchema = z.strictObject({
  id: WorkflowShareIdSchema, ownerId: OwnerIdSchema, projectId: ProjectIdSchema, versionId: VersionIdSchema,
  sharingEpoch: z.number().int().nonnegative(), revoked: z.boolean(), createdAt: TimestampSchema,
  kind: z.enum(["image", "video", "export"]), label: z.string().min(1).max(300),
});
export type VersionShare = z.infer<typeof VersionShareSchema>;
export const PublicVersionSchema = z.strictObject({
  id: WorkflowShareIdSchema, kind: z.enum(["image", "video", "export"]), label: z.string().min(1).max(300),
  url: z.url(), expiresAt: TimestampSchema, createdAt: TimestampSchema,
});
export type PublicVersion = z.infer<typeof PublicVersionSchema>;
