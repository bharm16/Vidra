import { logger } from "@infrastructure/Logger";
import { storagePathForBasename } from "@services/storage/utils/pathUtils";
import type { SessionRecord } from "@server/domain/session/types";
import {
  SessionAccessDeniedError,
  SessionNotFoundError,
} from "./SessionService";

/**
 * The read behind "Refine in the studio" — ADR-0022 decision 4, issue #88.
 *
 * Given a creator, a session, and a take identity, it answers where that
 * picture lives: the words-version it is filed under, and a DURABLE handle to
 * its media. Nothing here writes: opening the studio must leave the source
 * take and its paired words exactly as they were.
 *
 * Why the words-version is resolved here rather than sent by the caller: a
 * take lives in exactly one version's `generations`, and the session record is
 * the only thing that knows which. A client-supplied version would be a second
 * copy of that fact, free to disagree with the first.
 */

const log = logger.child({ service: "sessionPictureLookup" });

export interface SessionPicture {
  /** The take's associated words (ADR-0022 decision 2). */
  promptVersionId: string;
  /** The take identity — `node.id` in the space. */
  generationId: string;
  /**
   * A path, never a URL. The record's `mediaUrls` are signed and expire in an
   * hour (`signedUrlPolicy`); the path is what outlives the moment.
   */
  storagePath: string;
  /** The asset basename session records carry, when the take has one. */
  assetId?: string | undefined;
}

export interface SessionPictureLookup {
  /**
   * The picture, or `null` when the creator may not have it — a foreign or
   * missing session, a take this session does not hold, a clip, or a picture
   * with no durable handle. Refusal reads as absence, the studio's own
   * ownership posture, so a session id never becomes an existence oracle.
   */
  findOwnedSessionPicture(
    userId: string,
    sessionId: string,
    generationId: string,
  ): Promise<SessionPicture | null>;
}

/** The one method of `SessionService` this read needs. */
export interface OwnedSessionReader {
  requireOwnedSession(
    userId: string,
    sessionId: string,
  ): Promise<SessionRecord>;
}

function readString(
  record: Record<string, unknown>,
  field: string,
): string | undefined {
  const value = record[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * The take's durable handle. An admitted take records `storagePath` outright;
 * a generated one records only the asset basename, which is exactly what
 * `storagePathForBasename` exists to rebuild — from the OWNER's uid, so a
 * rebuilt path can never address another creator's object.
 */
function resolveStoragePath(
  record: Record<string, unknown>,
  userId: string,
): { storagePath: string; assetId?: string | undefined } | null {
  const recorded = readString(record, "storagePath");
  const assetIds = record.mediaAssetIds;
  const assetId = Array.isArray(assetIds)
    ? assetIds.find(
        (candidate): candidate is string =>
          typeof candidate === "string" && candidate.length > 0,
      )
    : undefined;

  if (recorded) {
    return { storagePath: recorded, ...(assetId ? { assetId } : {}) };
  }
  if (assetId) {
    return {
      storagePath: storagePathForBasename(userId, "preview-image", assetId),
      assetId,
    };
  }
  return null;
}

export function createSessionPictureLookup(
  sessionService: OwnedSessionReader,
): SessionPictureLookup {
  return {
    async findOwnedSessionPicture(
      userId: string,
      sessionId: string,
      generationId: string,
    ): Promise<SessionPicture | null> {
      let session: SessionRecord;
      try {
        session = await sessionService.requireOwnedSession(userId, sessionId);
      } catch (error) {
        // Only the two ownership outcomes collapse to absence. Anything else
        // (a store that could not answer) is a real failure and must surface.
        if (
          error instanceof SessionAccessDeniedError ||
          error instanceof SessionNotFoundError
        ) {
          log.warn("Studio bridge refused: session is not the creator's", {
            userId,
            sessionId,
            generationId,
          });
          return null;
        }
        throw error;
      }

      for (const version of session.prompt?.versions ?? []) {
        for (const generation of version.generations ?? []) {
          const record = generation as Record<string, unknown>;
          if (readString(record, "id") !== generationId) continue;
          // Pictures only. A clip is moved from, never refined.
          if (record.mediaType !== "image") return null;

          const media = resolveStoragePath(record, session.userId);
          if (!media) {
            log.warn("Studio bridge refused: take has no durable media", {
              sessionId,
              generationId,
            });
            return null;
          }
          return {
            promptVersionId: version.versionId,
            generationId,
            ...media,
          };
        }
      }
      return null;
    },
  };
}
