import { logger } from "@infrastructure/Logger";
import type { OwnedPictureResolver } from "@services/owned-media";
import type { SessionRecord } from "@server/domain/session/types";
import {
  SessionAccessDeniedError,
  SessionNotFoundError,
} from "./SessionService";

/**
 * The read behind "Refine in the studio" — ADR-0022 decision 4, issue #88.
 *
 * Given a creator, a session, and a take identity, it answers where that
 * picture lives: the words-version it is filed under, and a DURABLE, owner-
 * verified handle to its media. Nothing here writes: opening the studio must
 * leave the source take and its paired words exactly as they were.
 *
 * Why the words-version is resolved here rather than sent by the caller: a
 * take lives in exactly one version's `generations`, and the session record is
 * the only thing that knows which. A client-supplied version would be a second
 * copy of that fact, free to disagree with the first.
 *
 * The media handle is resolved through the shared `OwnedPictureResolver`, which
 * understands both stores (issue #109) — the generated take's user-scoped
 * basename and the admitted take's `image-previews/` path alike — so this read
 * never assumes a namespace and never returns a handle the creator does not own.
 */

const log = logger.child({ service: "sessionPictureLookup" });

export interface SessionPicture {
  /** The take's associated words (ADR-0022 decision 2). */
  promptVersionId: string;
  /** The take identity — `node.id` in the space. */
  generationId: string;
  /**
   * A path, never a URL — the object's actual stored path, owner-verified. The
   * record's `mediaUrls` are signed and expire in an hour (`signedUrlPolicy`);
   * the path is what outlives the moment.
   */
  storagePath: string;
  /**
   * A freshly minted read URL for the same object, so the caller can copy the
   * bytes without re-resolving which store holds them.
   */
  viewUrl: string;
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
 * The take's durable handle, straight from the record: an admitted take records
 * `storagePath` outright; a generated one records only the asset basename. Both
 * kinds are handed to the resolver, which picks the store and proves ownership
 * from the OWNER's uid — a rebuilt path can never address another creator's
 * object.
 */
function readHandle(record: Record<string, unknown>): {
  storagePath?: string | undefined;
  assetId?: string | undefined;
} {
  const assetIds = record.mediaAssetIds;
  const assetId = Array.isArray(assetIds)
    ? assetIds.find(
        (candidate): candidate is string =>
          typeof candidate === "string" && candidate.length > 0,
      )
    : undefined;
  return {
    storagePath: readString(record, "storagePath"),
    assetId,
  };
}

export function createSessionPictureLookup(
  sessionService: OwnedSessionReader,
  resolver: OwnedPictureResolver,
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

          const handle = readHandle(record);
          const resolved = await resolver.resolveOwnedPicture(
            session.userId,
            handle,
          );
          if (!resolved) {
            log.warn("Studio bridge refused: take has no owned durable media", {
              sessionId,
              generationId,
            });
            return null;
          }
          return {
            promptVersionId: version.versionId,
            generationId,
            storagePath: resolved.storagePath,
            viewUrl: resolved.viewUrl,
            ...(handle.assetId ? { assetId: handle.assetId } : {}),
          };
        }
      }
      return null;
    },
  };
}
