import { logger } from "@infrastructure/Logger";
import type { OwnedPictureResolver } from "@services/owned-media";
import type { SessionPromptKeyframe } from "@shared/types/session";

/**
 * Arming an already-admitted take as a session's first frame — issue #136.
 *
 * The handoffs (`acceptLiveOutput`, `returnStudioImage`) used to inline this
 * write as the last step of their ordering and swallow a failure into a log
 * line: the take was durable and in its session, so destroying it to punish a
 * missing arm was the wrong trade — but the failure also never reached the
 * response, so an attached-but-not-armed session reopened with no first frame
 * and the workspace fell back to choosing "an image" heuristically.
 *
 * One module now owns the whole fact, for three reasons:
 *
 *  - **One spelling.** The two handoffs wrote the same `keyframes[0]` shape
 *    with drifted comments; the repair door (`POST
 *    /sessions/:sessionId/first-frame/arm`) needs the exact same write. Three
 *    copies of an identity-bearing write is three chances to disagree about
 *    what an armed frame carries.
 *  - **The identity rule.** An armed frame is the explicit persisted identity
 *    of one take: `generationId` names the take, `assetId`/`storagePath`
 *    carry its durable handle (#125), and the URL is re-minted from that
 *    handle through the owner-checked resolver when one is wired. A take
 *    armed with only an expiring URL is NOT a completed handoff — the write
 *    refuses a record that carries no durable handle rather than arming a
 *    frame that dies within the hour.
 *  - **No readmission, no second take.** The take is read from the session it
 *    is already in. This module has no media store and no idempotency port —
 *    the missing ports are the proof: it cannot store bytes, mint a take, or
 *    touch a receipt. An attached-but-not-armed take is repaired by arming
 *    exactly the record the session already holds.
 *
 * `keyframes[0]` is the armed start frame (ADR-0011 D4): hydration re-arms
 * from the head of the array, which is what makes the frame a session fact
 * rather than a memory-only one — and what makes THIS write the thing a
 * reopened session selects by.
 */

const log = logger.child({ service: "armFirstFrame" });

/**
 * The session reads and writes arming needs — the same two capabilities the
 * handoffs already hold on `SessionService`, narrowed so the arm door can be
 * wired without dragging admission's ports along. The session read is the
 * defensively-opaque versions view admission itself uses: arming only reads
 * which takes are present, never the rest of the prompt.
 */
export interface ArmFirstFrameSessionPort {
  requireOwnedSession(
    userId: string,
    sessionId: string,
  ): Promise<{
    userId: string;
    prompt?:
      | {
          versions?:
            | ReadonlyArray<{
                generations?: ReadonlyArray<unknown> | undefined;
              }>
            | undefined;
        }
      | undefined;
  }>;
  updatePromptForUser(
    userId: string,
    sessionId: string,
    updates: { keyframes: SessionPromptKeyframe[] },
  ): Promise<unknown>;
}

export interface ArmFirstFrameDependencies {
  sessionService: ArmFirstFrameSessionPort;
  /**
   * Issue #125: re-mints the armed frame's `url` from the take's durable
   * handle so the identity never points at a dead signature. Optional —
   * without it the frame carries the record's stored URL, and the durable
   * handle it always carries is what the client re-mints from on expiry.
   */
  resolver?: OwnedPictureResolver | undefined;
}

export interface ArmFirstFrameInput {
  /** The authenticated creator. The session and the take are theirs. */
  userId: string;
  sessionId: string;
  /** The take to arm, by the identity admission minted for it. */
  generationId: string;
}

export type ArmFirstFrameResult =
  | { ok: true; frame: SessionPromptKeyframe }
  | { ok: false; reason: string };

/** Narrow one opaque generation entry to a readable record, or skip it. */
function asGenerationRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(
  record: Record<string, unknown>,
  field: string,
): string | undefined {
  const value = record[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** The record's first media URL, or `undefined` when it has none usable. */
function firstMediaUrl(record: Record<string, unknown>): string | undefined {
  const mediaUrls = record.mediaUrls;
  if (!Array.isArray(mediaUrls)) return undefined;
  const first = mediaUrls.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.length > 0,
  );
  return first;
}

/**
 * Find the take in THIS session — the attachment truth. An id present here
 * means the take reached its session; one absent means the arming is ahead of
 * the attachment, which is the attachment retry's to settle first.
 */
function findAttachedTake(
  session: Awaited<
    ReturnType<ArmFirstFrameSessionPort["requireOwnedSession"]>
  >,
  generationId: string,
): Record<string, unknown> | undefined {
  for (const version of session.prompt?.versions ?? []) {
    for (const entry of version.generations ?? []) {
      const record = asGenerationRecord(entry);
      if (record?.id === generationId) return record;
    }
  }
  return undefined;
}

/**
 * Arm `generationId` — a take already attached to this session — as the
 * session's first frame, from the take's own persisted record.
 *
 * Refusals are answers, never partial writes: the frame is written only when
 * the take is here, is a picture, and carries the durable handle that makes
 * the arm survive URL expiry. The write replaces `keyframes` with the one
 * frame — the same shape the handoffs' fresh arm has always written, because
 * a repair is the same fact as the arm it repairs.
 */
export async function armFirstFrame(
  deps: ArmFirstFrameDependencies,
  input: ArmFirstFrameInput,
): Promise<ArmFirstFrameResult> {
  const { userId, sessionId, generationId } = input;

  let session: Awaited<
    ReturnType<ArmFirstFrameSessionPort["requireOwnedSession"]>
  >;
  try {
    session = await deps.sessionService.requireOwnedSession(userId, sessionId);
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  const take = findAttachedTake(session, generationId);
  if (!take) {
    // Never a readmission: a take that is not in the session is the
    // attachment boundary's debt (ADR-0022 decision 6), not one this write
    // could settle by re-storing media or minting an identity.
    return {
      ok: false,
      reason: "that picture is not saved in this session yet",
    };
  }

  // A clip cannot be a first frame; the frame and the clip pipeline
  // downstream of it are picture-only.
  if (take.mediaType !== "image") {
    return { ok: false, reason: "only a picture can be the first frame" };
  }

  // The durable handle is what makes this a completed handoff: it is what a
  // reopened session re-mints the frame's URL from after the signature dies
  // (issue #125). A record with neither a storage path nor an asset id could
  // only arm a URL that is already dying, so the arm refuses.
  const assetIds = take.mediaAssetIds;
  const assetId = Array.isArray(assetIds)
    ? assetIds.find(
        (candidate): candidate is string =>
          typeof candidate === "string" && candidate.length > 0,
      )
    : undefined;
  const storagePath = readString(take, "storagePath");
  if (storagePath === undefined && assetId === undefined) {
    return {
      ok: false,
      reason:
        "this picture has no durable media handle — a first frame armed with only an expiring URL is not a completed handoff",
    };
  }

  // The frame's URL, fresh from the handle when the resolver is wired. A
  // refusal degrades to the record's stored URL — the handle rides the frame
  // either way, so the client can still re-mint (issue #125).
  const storedUrl = firstMediaUrl(take) ?? readString(take, "thumbnailUrl");
  let url = storedUrl;
  if (deps.resolver) {
    try {
      const resolved = await deps.resolver.resolveOwnedPicture(userId, {
        ...(storagePath !== undefined ? { storagePath } : {}),
        ...(assetId !== undefined ? { assetId } : {}),
      });
      if (resolved) url = resolved.viewUrl;
    } catch (error) {
      log.warn("Armed frame kept its stored URL: re-mint threw", {
        userId,
        sessionId,
        generationId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (url === undefined) {
    return {
      ok: false,
      reason: "this picture has no readable view URL to arm",
    };
  }

  // The frame's words are the take's ASSOCIATED words (ADR-0022 decision 2) —
  // what selecting the frame restores — never the production provenance.
  const sourcePrompt = readString(take, "prompt");

  const frame: SessionPromptKeyframe = {
    id: generationId,
    url,
    source: "generation",
    generationId,
    ...(sourcePrompt !== undefined ? { sourcePrompt } : {}),
    ...(storagePath !== undefined ? { storagePath } : {}),
    ...(assetId !== undefined ? { assetId } : {}),
  };

  await deps.sessionService.updatePromptForUser(userId, sessionId, {
    // keyframes[0] is the armed first frame (ADR-0011 D4): hydration re-arms
    // from the head of the array, and the identity riding on it is what a
    // reopened session selects — this exact picture, not whichever image is
    // newest.
    keyframes: [frame],
  });

  return { ok: true, frame };
}
