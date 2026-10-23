import type { SessionRecord } from "@server/domain/session/types";
import { z } from "zod";
import type { VideoJobRecord } from "@services/video-generation/runtime/types";
import { isLegacyApiKeyUid } from "@utils/apiKeyUser";

/**
 * A minted public share (ADR-0010 site-scope D8).
 *
 * Denormalized at mint time: it holds the clip's durable storage path (never
 * an expiring signed URL) plus the paired description, so the public read path
 * never touches user-scoped session data.
 */
export const ShareRecordSchema = z.strictObject({
  schemaVersion: z.literal("public-clip/v2"),
  shareId: z.string().uuid(),
  ownerId: z.string().min(1).max(128).refine(value => !isLegacyApiKeyUid(value)),
  sessionId: z.string().min(1).max(200),
  generationId: z.string().min(1).max(200),
  storagePath: z.string().min(1).max(2048),
  description: z.string(),
  model: z.string().nullable(),
  createdAt: z.iso.datetime(),
  resource: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("owner-path") }),
    z.strictObject({ kind: z.literal("video-job"), jobId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/), assetId: z.string().min(1).max(240) }),
  ]),
});
export type ShareRecord = z.infer<typeof ShareRecordSchema>;

export interface ShareRecordStore {
  save(record: ShareRecord): Promise<void>;
  get(shareId: string): Promise<ShareRecord | null>;
}

/** Owner-scoped session read used at mint time. */
export interface ShareSessionReader {
  getSession(sessionId: string): Promise<SessionRecord | null>;
}

export type ShareVideoJob = Pick<VideoJobRecord, "id" | "userId" | "sessionId" | "promptVersionId" | "status" | "result">;
export interface ShareJobReader {
  getJob(jobId: string): Promise<ShareVideoJob | null>;
  findJobByAssetId(assetId: string): Promise<ShareVideoJob | null>;
}

/**
 * Resolves a durable storage path to a fresh, time-limited view URL WITHOUT an
 * owner check — the minted share is the access grant (see ShareService).
 */
export interface ShareUrlResolver {
  getSharedViewUrl(
    storagePath: string,
  ): Promise<{ viewUrl: string; expiresAt: string }>;
}
