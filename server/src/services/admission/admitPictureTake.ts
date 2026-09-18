import { createHash, randomUUID } from "node:crypto";
import { logger } from "@infrastructure/Logger";
import { buildAdmissionAcceptanceFingerprint } from "@shared/utils/admissionFingerprint";
import { buildCompletedTakeRecord } from "@services/sessions/takeRecord";
import {
  attachTakeToSession,
  type SessionAppendPort,
} from "@services/sessions/attachTakeToSession";
import type { TakeAttachment } from "@shared/schemas/attachment.schemas";
import type {
  TakeOrigin,
  TakeProductionProvenance,
  TakeSourceInput,
} from "@shared/types/session";

/**
 * The one boundary through which a picture the session's own words did NOT
 * generate becomes a take in that session — ADR-0022 decisions 1, 2 and 3.
 *
 * Upload is its first caller. The live editor's "Use this" (#87) and the
 * studio's return bridge (#89) call the same function rather than each
 * inventing a path; a fourth entry point that writes `version.generations`
 * itself is a bug, not a feature. What varies between them is data — the
 * origin, the provenance, the source inputs — never the sequence below.
 *
 * The sequence, and why it is in this order:
 *
 *  1. **Ownership first.** The destination session is verified before anything
 *     is stored, claimed, or minted. `appendGenerationToVersion` re-checks it
 *     inside its transaction, so this is not the security boundary — it is the
 *     one that keeps a refusal free of side effects.
 *  2. **Idempotency claim.** A retry after a lost response must return the
 *     SAME take, and a double-fire must not mint a second one. The claim is
 *     what makes both true, and it is taken before the media is stored so the
 *     stored bytes are never orphaned by a replay.
 *  3. **Durable media.** The bytes land in the creator's own asset store, so
 *     the take outlives the browser tab that admitted it and the signed URL it
 *     was admitted with. Admission never generates: nothing here calls a
 *     provider, and a retry re-stores nothing.
 *  4. **Identity, then record, then attach.** The take id is minted before the
 *     append can fail, and attachment reports rather than throws
 *     (`attachTakeToSession`) — a failed attach is "made but not saved", with
 *     the record riding back out for the creator's retry.
 *
 * Deliberately NOT here: HTTP. The boundary returns a result; each caller's
 * route decides status codes. That is what lets three different routes reuse
 * it without agreeing on a response envelope.
 */

/**
 * ADR-0022 decision 1 — the origins that reach this boundary. A `generated`
 * take is produced by the session's own words and is never admitted, so the
 * type excludes it rather than leaving it to a runtime guard.
 */
export type AdmittedTakeOrigin = Exclude<TakeOrigin, "generated">;

/**
 * The source-input kind the admitted media itself contributes. A total map
 * over a closed enum — the origin already says what the media is, so nothing
 * here inspects the bytes, the name, or the URL to decide.
 */
const MEDIA_INPUT_KIND: Record<AdmittedTakeOrigin, TakeSourceInput["kind"]> = {
  upload: "upload",
  sketchpad: "sketch",
  studio: "studio-image",
};

/**
 * The bytes to make durable. Buffer-only on purpose: `storeFromBuffer` is the
 * one door every current caller can reach, and an untested URL branch in a
 * boundary three tickets depend on is worse than a `fetch` at the call site.
 */
export interface AdmissionMedia {
  buffer: Buffer;
  contentType: string;
}

export interface StoredAdmissionAsset {
  id: string;
  storagePath: string;
  url: string;
}

/** The creator-owned image store. `ImageAssetStore` satisfies this. */
export interface AdmissionMediaStore {
  storeFromBuffer(
    buffer: Buffer,
    contentType: string,
    userId: string,
  ): Promise<StoredAdmissionAsset>;
}

export type AdmissionIdempotencyClaim =
  | { state: "claimed"; recordId: string }
  | {
      state: "replay";
      recordId: string;
      snapshot: { statusCode: number; body: Record<string, unknown> };
    }
  | { state: "in_progress"; recordId: string }
  | { state: "conflict"; recordId: string };

/** `RequestIdempotencyService` satisfies this (ADR-0022 decision 6 permits it
 * for the per-admission key, and for nothing else in the frozen stack). */
export interface AdmissionIdempotencyPort {
  claimRequest(input: {
    userId: string;
    route: string;
    key: string;
    payload: unknown;
  }): Promise<AdmissionIdempotencyClaim>;
  markCompleted(input: {
    recordId: string;
    snapshot: { statusCode: number; body: Record<string, unknown> };
  }): Promise<void>;
  markFailed(recordId: string, reason: string): Promise<void>;
}

/**
 * The session reads and writes admission needs. Both halves are already public
 * on `SessionService`; naming them here keeps the boundary testable without a
 * Firestore-backed service and documents exactly how much of the session
 * domain admission is allowed to touch.
 */
export interface AdmissionSessionPort extends SessionAppendPort {
  requireOwnedSession(
    userId: string,
    sessionId: string,
  ): Promise<{
    userId: string;
    /**
     * Read for one reason: the admitting version's own text, which is the
     * take's associated words. A caller cannot supply it — it belongs to the
     * session, and reading it from the record the ownership check already
     * fetched is cheaper and truer than asking three callers to pass it.
     */
    prompt?:
      | {
          versions?:
            | ReadonlyArray<{ versionId: string; prompt: string }>
            | undefined;
        }
      | undefined;
  }>;
}

export interface AdmitPictureTakeDependencies {
  sessionService: AdmissionSessionPort;
  mediaStore: AdmissionMediaStore;
  idempotency: AdmissionIdempotencyPort;
}

export interface AdmitPictureTakeRequest {
  /** The authenticated creator. Both the destination and the media are theirs. */
  userId: string;
  /** Destination session. Verified owned before anything is stored. */
  sessionId: string;
  /**
   * The words-version the take is filed under — its ASSOCIATED WORDS
   * (ADR-0022 decision 2). Explicit by contract: the take binds to the version
   * the request named, never to whichever version is current when the response
   * lands.
   */
  promptVersionId: string;
  origin: AdmittedTakeOrigin;
  media: AdmissionMedia;
  /**
   * ADR-0022 decision 2. An upload passes `{ state: "unknown" }`; it does not
   * get to invent one.
   */
  productionProvenance: TakeProductionProvenance;
  /** ADR-0022 decision 3: every contributing input. The uploaded/accepted
   * media itself is appended by this boundary once it is durable. */
  sourceInputs?: readonly TakeSourceInput[] | undefined;
  /**
   * ADR-0022 decision 3: the ONE relationship the space draws. A recorded
   * choice among `sourceInputs`, never a positional guess; `null` means the
   * take has no picture ancestor and hangs from its words-version.
   */
  displayAncestorGenerationId: string | null;
  /** Stable across every retry of this one admission. */
  idempotencyKey: string;
  /**
   * Overrides the associated words text. Omit it — uploads do — and the
   * admitting version's own text is used, which is what "filed under these
   * words" means. Never the production provenance: that is a separate field
   * for a separate fact (decision 2).
   */
  associatedWordsText?: string | undefined;
  /** Recorded on the take so the tier stays derived (ADR-0021). */
  model?: string | null | undefined;
}

export interface AdmittedPictureTake {
  generationId: string;
  sessionId: string;
  promptVersionId: string;
  origin: AdmittedTakeOrigin;
  imageUrl: string;
  assetId: string;
  storagePath: string;
  record: Record<string, unknown>;
  attachment: TakeAttachment;
}

export type AdmitPictureTakeResult =
  | { state: "admitted"; take: AdmittedPictureTake; replayed: boolean }
  /** The destination session is not this creator's. Nothing was stored. */
  | { state: "refused"; reason: string }
  /** A matching admission is already running. Never a second take. */
  | { state: "in_progress" }
  /** The same key was used for different media. */
  | { state: "conflict" };

const ADMISSION_ROUTE = "picture-admission";

const log = logger.child({ service: "admitPictureTake" });

function readAdmittedTake(body: Record<string, unknown>): AdmittedPictureTake {
  // Written by this module and read back by this module through the
  // idempotency store's `Record<string, unknown>` snapshot slot, so the shape
  // is ours. Replayed as-is, exactly as the quick-picture handler replays its
  // own snapshot; the take's RECORD was validated against
  // `SessionGenerationRecordSchema` before it was ever written.
  return body as unknown as AdmittedPictureTake;
}

/**
 * ADR-0022 decision 3: the display ancestor is a recorded CHOICE among the
 * source inputs. A caller that names one it did not record as an input is
 * drawing a relationship nothing performed — the exact failure the positional
 * guess used to produce, moved up a layer. Checked before any side effect,
 * and thrown rather than returned: it is a bug at the call site, not a state
 * the creator can be in.
 */
export class DisplayAncestorNotASourceInputError extends Error {
  constructor(readonly displayAncestorGenerationId: string) {
    super(
      `Display ancestor ${displayAncestorGenerationId} is not among the take's source inputs`,
    );
    this.name = "DisplayAncestorNotASourceInputError";
  }
}

export async function admitPictureTake(
  deps: AdmitPictureTakeDependencies,
  request: AdmitPictureTakeRequest,
): Promise<AdmitPictureTakeResult> {
  const { sessionService, mediaStore, idempotency } = deps;

  const displayAncestor = request.displayAncestorGenerationId;
  if (
    displayAncestor !== null &&
    !(request.sourceInputs ?? []).some(
      (input) =>
        input.kind === "take" && input.generationId === displayAncestor,
    )
  ) {
    throw new DisplayAncestorNotASourceInputError(displayAncestor);
  }

  let session: Awaited<ReturnType<AdmissionSessionPort["requireOwnedSession"]>>;
  try {
    session = await sessionService.requireOwnedSession(
      request.userId,
      request.sessionId,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.warn("Admission refused: destination session is not the creator's", {
      userId: request.userId,
      sessionId: request.sessionId,
      origin: request.origin,
    });
    return { state: "refused", reason };
  }

  const claim = await idempotency.claimRequest({
    userId: request.userId,
    route: ADMISSION_ROUTE,
    key: request.idempotencyKey,
    // The key alone does not make two different admissions the same request;
    // this fingerprint is what turns a reused key into a conflict instead of a
    // wrong replay. It is built over the digest of the media bytes — so a
    // different file retried under a retained key conflicts rather than
    // replaying — plus the destination, origin, provenance, contributing
    // inputs and display ancestor (issue #114). The digest is computed here,
    // before the bytes are stored, so no transient signed URL can enter it.
    payload: buildAdmissionAcceptanceFingerprint({
      sessionId: request.sessionId,
      promptVersionId: request.promptVersionId,
      origin: request.origin,
      mediaDigest: createHash("sha256")
        .update(request.media.buffer)
        .digest("hex"),
      productionProvenance: request.productionProvenance,
      sourceInputs: request.sourceInputs,
      displayAncestorGenerationId: request.displayAncestorGenerationId,
    }),
  });

  if (claim.state === "replay") {
    return {
      state: "admitted",
      take: readAdmittedTake(claim.snapshot.body),
      replayed: true,
    };
  }
  if (claim.state === "in_progress") return { state: "in_progress" };
  if (claim.state === "conflict") return { state: "conflict" };

  const recordId = claim.recordId;

  let stored: StoredAdmissionAsset;
  try {
    stored = await mediaStore.storeFromBuffer(
      request.media.buffer,
      request.media.contentType,
      request.userId,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await idempotency.markFailed(recordId, reason);
    throw error;
  }

  // Minted before anything else can fail: the take's name is not the append's
  // to lose, and a retry re-attaches THIS take rather than minting a second.
  const generationId = randomUUID();

  const sourceInputs: TakeSourceInput[] = [
    ...(request.sourceInputs ?? []),
    {
      kind: MEDIA_INPUT_KIND[request.origin],
      assetId: stored.id,
      storagePath: stored.storagePath,
    },
  ];

  let record: Record<string, unknown>;
  try {
    record = buildCompletedTakeRecord({
      id: generationId,
      model: request.model ?? null,
      mediaType: "image",
      prompt:
        request.associatedWordsText ??
        session.prompt?.versions?.find(
          (version) => version.versionId === request.promptVersionId,
        )?.prompt ??
        "",
      promptVersionId: request.promptVersionId,
      mediaUrls: [stored.url],
      mediaAssetIds: [stored.id],
      thumbnailUrl: stored.url,
      storagePath: stored.storagePath,
      origin: request.origin,
      productionProvenance: request.productionProvenance,
      sourceInputs,
      ancestorGenerationId: request.displayAncestorGenerationId,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await idempotency.markFailed(recordId, reason);
    throw error;
  }

  const attachment = await attachTakeToSession({
    sessionService,
    userId: request.userId,
    sessionId: request.sessionId,
    promptVersionId: request.promptVersionId,
    record,
    logLabel: `Admitted picture (${request.origin})`,
  });

  const take: AdmittedPictureTake = {
    generationId,
    sessionId: request.sessionId,
    promptVersionId: request.promptVersionId,
    origin: request.origin,
    imageUrl: stored.url,
    assetId: stored.id,
    storagePath: stored.storagePath,
    record,
    attachment,
  };

  // Completed even when the attachment failed: the take exists, its media is
  // durable, and its identity is settled. A retry of the ADMISSION must return
  // this same take rather than store the bytes again — re-attaching it is a
  // different verb, and the failed attachment carries the record for it.
  await idempotency.markCompleted({
    recordId,
    snapshot: {
      statusCode: 201,
      body: take as unknown as Record<string, unknown>,
    },
  });

  return { state: "admitted", take, replayed: false };
}
