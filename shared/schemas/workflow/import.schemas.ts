import { z } from "zod";
import { OwnerIdSchema, ProjectIdSchema, TimestampSchema, VersionIdSchema, type VersionId } from "./identity.schemas";

export const ImportIdSchema = z.string().regex(/^import_[A-Za-z0-9_-]+$/).max(160);
/** A finished import's media version reuses the import's identity. */
export function importedVersionId(importId: string): VersionId {
  return VersionIdSchema.parse(`version_${ImportIdSchema.parse(importId).slice("import_".length)}`);
}
export const AUDIO_IMPORT_LIMITS = Object.freeze({ maxBytes: 100 * 1024 * 1024, maxDurationSeconds: 300 });
export const ImportContentTypeSchema = z.enum(["image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm", "audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4"]);
/** Browser and byte-sniffer aliases normalize to one recorded wire type. */
export function canonicalImportContentType(value: string): string {
  const mime = value.toLowerCase().split(";")[0]?.trim() ?? "";
  if (mime === "audio/x-wav" || mime === "audio/wave" || mime === "audio/vnd.wave") return "audio/wav";
  if (mime === "audio/x-m4a" || mime === "audio/m4a") return "audio/mp4";
  if (mime === "audio/mp3" || mime === "audio/x-mp3") return "audio/mpeg";
  if (mime === "audio/opus") return "audio/ogg";
  return mime;
}
export const ImportCommandSchema = z.strictObject({
  id: ImportIdSchema,
  filename: z.string().trim().min(1).max(300),
  contentType: ImportContentTypeSchema,
  bytes: z.number().int().positive().max(500 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).refine(value => !value.contentType.startsWith("image/") || value.bytes <= 10 * 1024 * 1024, "Pictures must be 10 MB or smaller")
  .refine(value => !value.contentType.startsWith("audio/") || value.bytes <= AUDIO_IMPORT_LIMITS.maxBytes, "Audio must be 100 MB or smaller");
export type ImportCommand = z.infer<typeof ImportCommandSchema>;
/** Generated pictures may exceed the 10 MB upload limit (4K and PNG results); verification still bounds their pixels. */
export const GENERATED_PICTURE_MAX_BYTES = 100 * 1024 * 1024;
export const GeneratedOutputCommandSchema = z.strictObject(ImportCommandSchema.shape)
  .refine(value => !value.contentType.startsWith("image/") || value.bytes <= GENERATED_PICTURE_MAX_BYTES, "Generated pictures must be 100 MB or smaller")
  .refine(value => !value.contentType.startsWith("audio/") || value.bytes <= AUDIO_IMPORT_LIMITS.maxBytes, "Audio must be 100 MB or smaller");
export const ImportRecordSchema = z.strictObject({
  ...ImportCommandSchema.shape,
  ownerId: OwnerIdSchema, projectId: ProjectIdSchema,
  storagePath: z.string().min(1),
  state: z.enum(["uploading", "ready", "cancelled", "rejected"]),
  versionId: VersionIdSchema,
  createdAt: TimestampSchema,
  reason: z.string().optional(),
});
export type ImportRecord = z.infer<typeof ImportRecordSchema>;
export const ImportSessionSchema = z.strictObject({
  record: ImportRecordSchema,
  uploadUrl: z.url().optional(),
  offset: z.number().int().nonnegative(),
});
export const CopyMediaCommandSchema = z.strictObject({ targetProjectId: ProjectIdSchema, id: VersionIdSchema });
