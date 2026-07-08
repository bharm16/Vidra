import type { SessionRecord } from "@server/domain/session/types";

/**
 * A minted public share (ADR-0010 site-scope D8).
 *
 * Denormalized at mint time: it holds the clip's durable storage path (never
 * an expiring signed URL) plus the paired description, so the public read path
 * never touches user-scoped session data.
 */
export interface ShareRecord {
  shareId: string;
  storagePath: string;
  description: string;
  model: string | null;
  createdAt: string;
}

export interface ShareRecordStore {
  save(record: ShareRecord): Promise<void>;
  get(shareId: string): Promise<ShareRecord | null>;
}

/** Owner-scoped session read used at mint time. */
export interface ShareSessionReader {
  getSession(sessionId: string): Promise<SessionRecord | null>;
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
