import type { Readable } from "node:stream";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { OwnedObjectSchema, MediaMetadataSchema } from "@shared/schemas/workflow/media.schemas";
import { VersionShareSchema } from "@shared/schemas/workflow/sharing.schemas";
import { OwnerIdSchema, ProjectIdSchema, TimestampSchema, VersionIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { z } from "zod";

export const StoredShareSchema = VersionShareSchema.extend({ object: OwnedObjectSchema });
export type StoredShare = z.infer<typeof StoredShareSchema>;
export const FrameOperationSchema = z.strictObject({ ownerId: OwnerIdSchema, projectId: ProjectIdSchema, sourceVersionId: VersionIdSchema, id: VersionIdSchema, timestampSeconds: z.number().finite().nonnegative(), payloadHash: z.string().regex(/^[a-f0-9]{64}$/), token: z.string().uuid(), leaseUntil: TimestampSchema, createdAt: TimestampSchema });
export type FrameOperation = z.infer<typeof FrameOperationSchema>;
export const StoredFrameSchema = z.strictObject({ object: OwnedObjectSchema, metadata: MediaMetadataSchema });
export type StoredFrame = z.infer<typeof StoredFrameSchema>;
export interface ByteRange { start: number; end: number; }
export interface WorkflowContent { stream: Readable; contentType: string; bytes: number; range?: ByteRange; }
export interface WorkflowManagementStorage {
  content(share: StoredShare, range?: string): Promise<WorkflowContent>;
  downloadAccess(ownerId: string, version: MediaVersion): Promise<{ url: string; expiresAt: string }>;
  downloadSource(ownerId: string, source: MediaVersion, target: string, signal: AbortSignal): Promise<void>;
  existingFrame(operation: FrameOperation): Promise<StoredFrame | undefined>;
  storeFrame(operation: FrameOperation, path: string, evidence: { sha256: string; bytes: number; width: number; height: number }, signal?: AbortSignal): Promise<StoredFrame>;
}

export class UnsatisfiableRangeError extends Error { constructor(readonly bytes: number) { super("This byte range is unavailable."); } }

/** One bounded byte range; multiple ranges never allocate or fetch the full file. */
export function parseByteRange(value: string | undefined, bytes: number): ByteRange | undefined {
  if (value === undefined) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) throw new UnsatisfiableRangeError(bytes);
  let start: number; let end: number;
  if (!match[1]) { const suffix = Number(match[2]); if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new UnsatisfiableRangeError(bytes); start = Math.max(0, bytes - suffix); end = bytes - 1; }
  else { start = Number(match[1]); end = match[2] ? Math.min(bytes - 1, Number(match[2])) : bytes - 1; }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= bytes || end < start) throw new UnsatisfiableRangeError(bytes);
  return { start, end };
}
