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
import type { OwnedPictureResolver } from "@services/owned-media";

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
 *     stored bytes are never orphaned by a replay. A replay whose attachment is
 *     still owed is RESUMED, not merely returned (step 5).
 *  3. **Relationship validation — on a fresh claim only.** Every relationship
 *     this take will RECORD is proven against the owned session read in step 1
 *     (issue #122, ADR-0022 decision 3): the words-version it is filed under
 *     already exists — never auto-created from the session's current text — and
 *     the display ancestor is a LIVE, non-archived PICTURE take that is
 *     genuinely a node in THIS session, not a phantom id, a clip, or a take
 *     from another session's space. Run after the claim on purpose: replaying
 *     an already successful acceptance returns its original take even after a
 *     source it named was later archived, so initial validation is never
 *     re-litigated on the way back out. A failure marks the claim failed and
 *     refuses, before a single byte is stored.
 *  4. **Durable media.** The bytes land in the creator's own asset store, so
 *     the take outlives the browser tab that admitted it and the signed URL it
 *     was admitted with. Admission never generates: nothing here calls a
 *     provider, and a retry re-stores nothing.
 *  5. **Identity and durable resume record, then attach.** The take id is
 *     minted BEFORE the side effects that could otherwise duplicate it, and the
 *     completion snapshot is written once with the attachment still `pending` —
 *     carrying that id, the durable media handle, and the record — BEFORE the
 *     append is attempted (issue #128). That snapshot is the authoritative
 *     resume record: a crash after it re-attaches THIS take from the persisted
 *     record rather than storing new bytes or minting a second take, exactly as
 *     the clip half does (`attachCompletedJobToSession`). Attachment reports
 *     rather than throws (`attachTakeToSession`) — a failed attach is "made but
 *     not saved", and the snapshot is rewritten with the resolved outcome, so a
 *     replay always reads the CURRENT attachment state, never a stale failure a
 *     later repair has since fixed (ADR-0022 decision 6).
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
  /**
   * Read one claim's settled snapshot WITHOUT claiming it — the discovery half
   * of the attachment boundary (ADR-0022 decision 6: the attachment's persisted
   * state, and the client polling that treats a return as terminal only once
   * its attachment resolves). A reloaded caller reads this receipt to find a
   * return whose attachment is still owed. Optional: without it a caller can
   * still claim, resume and replay — it just cannot discover an unresolved
   * attachment before pressing again. Strictly a read: no claim, no lock, no
   * TTL, no retry orchestration.
   */
  getResponseSnapshot?(input: {
    userId: string;
    route: string;
    key: string;
  }): Promise<{ statusCode: number; body: Record<string, unknown> } | null>;
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
     * Read for two reasons, both from the record the ownership check already
     * fetched — no caller supplies either, because both belong to the session:
     *
     *  - the admitting version's own text, which is the take's ASSOCIATED
     *    words (ADR-0022 decision 2); and
     *  - the takes already filed under each version (`generations`), which is
     *    how admission PROVES a display ancestor is a live picture take that is
     *    genuinely a node in this destination (issue #122). The entries are
     *    read defensively as opaque records — admission only needs each take's
     *    id, media type and archive flag, never its full shape.
     */
    prompt?:
      | {
          versions?:
            | ReadonlyArray<{
                versionId: string;
                prompt: string;
                generations?: ReadonlyArray<unknown> | undefined;
              }>
            | undefined;
        }
      | undefined;
  }>;
}

export interface AdmitPictureTakeDependencies {
  sessionService: AdmissionSessionPort;
  mediaStore: AdmissionMediaStore;
  idempotency: AdmissionIdempotencyPort;
  /**
   * Issue #125: the owner-checked resolver used to re-mint a REPLAYED take's
   * `imageUrl` from its durable handle. Optional: without it a replay returns
   * the URL frozen at first admission (the prior behavior), which expires ~1h
   * later. With it, a repeated acceptance answers with a fresh URL and the
   * same identity. Never used on a first admission — that URL is already fresh
   * from the store — and never to re-store or re-run anything.
   */
  resolver?: OwnedPictureResolver | undefined;
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

/**
 * The route name every admission claim goes by in the idempotency store.
 * Exported because the recovery readers (#134's sketch discovery and #135's
 * return-recovery read) must address the receipts the boundary wrote under
 * the SAME route name they were claimed with — a second spelling here would
 * quietly miss them.
 */
export const ADMISSION_ROUTE = "picture-admission";

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
 * Issue #125: freshen a replayed take's `imageUrl` from its durable handle.
 *
 * The identity (generation id, asset id, storage path) is left exactly as the
 * snapshot recorded it; only the signed URL is re-minted, and only through the
 * owner-checked resolver, which rebuilds the object's path from the caller's
 * uid. Without a resolver, or when it refuses (the object is gone or not the
 * caller's), the snapshot's own URL flows through — a repeated acceptance never
 * fails for want of a fresh signature. The take record inside the snapshot is
 * left untouched: it carries the same immutable handle and its own refreshable
 * URLs, and it is not what the acceptance callers read back.
 */
async function remintReplayedImageUrl(
  take: AdmittedPictureTake,
  userId: string,
  resolver: OwnedPictureResolver | undefined,
): Promise<AdmittedPictureTake> {
  if (!resolver) return take;
  const resolved = await resolver.resolveOwnedPicture(userId, {
    storagePath: take.storagePath,
    assetId: take.assetId,
  });
  if (!resolved) {
    log.warn(
      "Admission replay kept its stored URL: media could not be reminted",
      {
        generationId: take.generationId,
        sessionId: take.sessionId,
      },
    );
    return take;
  }
  return { ...take, imageUrl: resolved.viewUrl };
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

type AdmissionSessionRead = Awaited<
  ReturnType<AdmissionSessionPort["requireOwnedSession"]>
>;

/** Narrow one opaque generation entry to a readable record, or skip it. */
function asGenerationRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * ADR-0022 decision 3 / issue #122: a source input must be well formed for the
 * KIND it declares. `take` names a node by id — it is the only kind that is
 * itself a node in this session's space, and so the only kind eligible to be
 * the display ancestor. Every other kind is owner-authorized MEDIA, carried by
 * a durable handle (its bytes were stored under this creator at the call site,
 * and the boundary's own appended media is stored under `userId` too) and never
 * a bare generation id. A media input wearing a take's id — or a take with none
 * — is a mislabelled reference the space would later read as a relationship
 * nobody performed, so it is refused before anything is stored.
 *
 * This is the whole of admission's rule for NON-display source inputs: they are
 * recorded provenance, not drawn edges, so they are checked for kind and shape
 * and are deliberately NOT held to the display ancestor's live/in-session rule
 * (they need not be nodes in this session at all). Archiving one later cannot
 * disturb the admitted take, because provenance is a recorded fact rather than
 * a live relationship the space keeps re-reading.
 */
function checkSourceInputKinds(
  sourceInputs: readonly TakeSourceInput[],
): { ok: true } | { ok: false; reason: string } {
  for (const input of sourceInputs) {
    const generationId =
      typeof input.generationId === "string" && input.generationId.length > 0
        ? input.generationId
        : undefined;
    if (input.kind === "take") {
      if (!generationId) {
        return {
          ok: false,
          reason: "a take source input carries no generation id",
        };
      }
      continue;
    }
    const hasHandle =
      (typeof input.assetId === "string" && input.assetId.length > 0) ||
      (typeof input.storagePath === "string" && input.storagePath.length > 0);
    if (!hasHandle) {
      return {
        ok: false,
        reason: `a ${input.kind} source input carries no durable media handle`,
      };
    }
    if (generationId) {
      return {
        ok: false,
        reason: `a ${input.kind} source input must not carry a take generation id`,
      };
    }
  }
  return { ok: true };
}

/**
 * Issue #122: the display ancestor — the ONE relationship the space draws
 * (ADR-0022 decision 3) — must be a live picture take that is genuinely a node
 * in THIS destination session. This single read rejects every way the drawn
 * edge could be a lie:
 *
 *  - a phantom id, or a take that lives in ANOTHER session's space: not found
 *    here, because a take is a node in exactly one session and this reads only
 *    this one;
 *  - a clip: a `move` edge is drawn from a picture and `refine` never reaches
 *    one, so a non-`image` node is refused (the same picture test
 *    `sessionPictureLookup` applies);
 *  - an archived take: gone from the rendered space, so an edge to it would
 *    point at nothing the creator can see.
 *
 * A self-link or a cycle cannot be expressed here and so needs no separate
 * check: the take being admitted has no id until step 5 mints one AFTER this
 * runs, so a caller cannot name it as its own ancestor, and it has no
 * descendants yet for an ancestor to descend from. The only relationship a
 * caller can draw is to a picture that already exists — which is what this
 * proves.
 */
function checkDisplayAncestorIsLivePicture(
  session: AdmissionSessionRead,
  displayAncestorGenerationId: string,
): { ok: true } | { ok: false; reason: string } {
  for (const version of session.prompt?.versions ?? []) {
    for (const entry of version.generations ?? []) {
      const record = asGenerationRecord(entry);
      if (!record || record.id !== displayAncestorGenerationId) continue;
      if (record.archived === true) {
        return {
          ok: false,
          reason: `display ancestor ${displayAncestorGenerationId} is archived`,
        };
      }
      if (record.mediaType !== "image") {
        return {
          ok: false,
          reason: `display ancestor ${displayAncestorGenerationId} is not a picture take`,
        };
      }
      return { ok: true };
    }
  }
  return {
    ok: false,
    reason: `display ancestor ${displayAncestorGenerationId} is not a live picture take in the destination session`,
  };
}

/**
 * Prove every relationship the take will record, against the owned session read
 * before the claim (issue #122). Pure and total: it reads, never writes, so the
 * caller decides what a failure means — a side-effect-free `refused`.
 */
function validateAdmissionRelationships(
  session: AdmissionSessionRead,
  request: AdmitPictureTakeRequest,
): { ok: true } | { ok: false; reason: string } {
  // The words-version must already exist. A missing one is REJECTED, never
  // created from the session's current text: a take filed under words nobody
  // authored is a fabricated association (ADR-0022 decision 2). The generic
  // `appendGenerationToVersion` still upserts a version for the generating
  // writers' draft-to-persisted transition; admission refuses BEFORE it can
  // reach that branch, which is the explicit choice issue #122 asks of this
  // boundary — the branch stays for its own writers, closed to admission.
  const versionExists = (session.prompt?.versions ?? []).some(
    (version) => version.versionId === request.promptVersionId,
  );
  if (!versionExists) {
    return {
      ok: false,
      reason: `destination words-version ${request.promptVersionId} does not exist in the session`,
    };
  }

  const kinds = checkSourceInputKinds(request.sourceInputs ?? []);
  if (!kinds.ok) return kinds;

  if (request.displayAncestorGenerationId !== null) {
    return checkDisplayAncestorIsLivePicture(
      session,
      request.displayAncestorGenerationId,
    );
  }

  return { ok: true };
}

export async function admitPictureTake(
  deps: AdmitPictureTakeDependencies,
  request: AdmitPictureTakeRequest,
): Promise<AdmitPictureTakeResult> {
  const { sessionService, mediaStore, idempotency, resolver } = deps;

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
    // inputs, display ancestor, and, when a caller confirms them for a session
    // it mints, the associated words (issues #114, #131). The digest is
    // computed here, before the bytes are stored, so no transient signed URL
    // can enter it.
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
      // Only the callers that override the associated words (the studio return
      // that mints a session — issue #131) move the fingerprint; one that files
      // under a session's own words omits it and fingerprints as before.
      associatedWordsText: request.associatedWordsText,
    }),
  });

  if (claim.state === "replay") {
    // Issues #125 and #128, merged. A replay is never a bare snapshot echo.
    // The resume path decides what the settled snapshot means: an acceptance
    // whose append was interrupted is re-attached — same take, never re-stored,
    // never a re-minted identity (#128) — and the take's `imageUrl`, likely
    // expired since first admission, is re-minted from its durable handle
    // through the owner-checked resolver (#125), leaving its identity untouched.
    return await resumeAdmittedTake(
      { sessionService, idempotency },
      request,
      claim.recordId,
      claim.snapshot,
      resolver,
    );
  }
  if (claim.state === "in_progress") return { state: "in_progress" };
  if (claim.state === "conflict") return { state: "conflict" };

  const recordId = claim.recordId;

  // Issue #122: the claim says this is a fresh acceptance, not a replay, so now
  // — and only now — prove the relationships this take will record against the
  // session read in step 1. A replay already returned above, which is what
  // keeps an archived source from ever rewriting a settled acceptance. A
  // failure refuses before any byte is stored, and marks the claim failed so a
  // corrected retry (un-archived source, real version) can re-claim.
  const relationships = validateAdmissionRelationships(session, request);
  if (!relationships.ok) {
    await idempotency.markFailed(recordId, relationships.reason);
    log.warn("Admission refused: a recorded relationship is not valid", {
      userId: request.userId,
      sessionId: request.sessionId,
      origin: request.origin,
      reason: relationships.reason,
    });
    return { state: "refused", reason: relationships.reason };
  }

  // Established BEFORE the side effects that could otherwise duplicate it
  // (issue #128): the take's name is not the append's to lose, is persisted at
  // the checkpoint below, and is reused by every resume rather than re-minted.
  const generationId = randomUUID();

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

  // The durable resume record (issue #128, ADR-0022 decision 6): the completion
  // snapshot itself, written NOW — with the attachment still `pending` and
  // carrying the id, the durable media handle, and the record — BEFORE the
  // append is attempted. The idempotency record is the authoritative owner of
  // this attachment state. A crash after this point resumes THIS take (same
  // identity, same media, re-attached) instead of storing new bytes and minting
  // a second one, mirroring the clip half (`attachCompletedJobToSession`),
  // which likewise checkpoints before its append.
  const pending: AdmittedPictureTake = {
    generationId,
    sessionId: request.sessionId,
    promptVersionId: request.promptVersionId,
    origin: request.origin,
    imageUrl: stored.url,
    assetId: stored.id,
    storagePath: stored.storagePath,
    record,
    attachment: {
      state: "pending",
      generationId,
      sessionId: request.sessionId,
      promptVersionId: request.promptVersionId,
      record,
    },
  };
  await persistAdmissionSnapshot(idempotency, recordId, pending);

  const take = await attachAndComplete(
    { sessionService, idempotency },
    request,
    recordId,
    pending,
  );

  return { state: "admitted", take, replayed: false };
}

/** The reads and writes the attach-and-resume steps need. */
interface AdmissionAttachDeps {
  sessionService: AdmissionSessionPort;
  idempotency: AdmissionIdempotencyPort;
}

/**
 * Write the completion snapshot — the authoritative resume record. Reused for
 * every write of it: the pre-append `pending` checkpoint and each resolved
 * outcome after it. `markCompleted` settles the idempotency record, so a later
 * claim `replay`s this exact snapshot; the attachment state inside it, not the
 * record's status, is what says whether the take still owes its session a write.
 */
async function persistAdmissionSnapshot(
  idempotency: AdmissionIdempotencyPort,
  recordId: string,
  take: AdmittedPictureTake,
): Promise<void> {
  await idempotency.markCompleted({
    recordId,
    snapshot: {
      statusCode: 201,
      body: take as unknown as Record<string, unknown>,
    },
  });
}

/**
 * Attach the take's already-built record and rewrite the snapshot with the
 * outcome. Never a generation retry (ADR-0022 decision 6): it re-sends the SAME
 * record under the SAME identity to the de-duplicating session append, so a
 * resumed or repaired attach writes one take rather than a second, and reruns
 * no generation and no refund. Attachment reports rather than throws, so a
 * failure comes back as a `failed` snapshot the next replay can resume, not an
 * exception that strands the take.
 */
async function attachAndComplete(
  deps: AdmissionAttachDeps,
  request: AdmitPictureTakeRequest,
  recordId: string,
  base: AdmittedPictureTake,
): Promise<AdmittedPictureTake> {
  const attachment = await attachTakeToSession({
    sessionService: deps.sessionService,
    userId: request.userId,
    sessionId: request.sessionId,
    promptVersionId: request.promptVersionId,
    record: base.record,
    logLabel: `Admitted picture (${request.origin})`,
  });
  const take: AdmittedPictureTake = { ...base, attachment };
  await persistAdmissionSnapshot(deps.idempotency, recordId, take);
  return take;
}

/**
 * Resume (or replay) an acceptance the claim reported as already settled
 * (issue #128), then freshen its signed URL (issue #125).
 *
 * An `attached` snapshot is the finished take, returned as-is: the ordinary
 * replay, which deliberately re-runs NO relationship validation, so a source
 * archived after the fact never rewrites a settled acceptance. An unresolved
 * snapshot (`pending` or `failed`) is a take whose identity and media are
 * durable but whose append was interrupted or has not yet landed; it is
 * re-attached from the persisted record — never re-stored, never re-minted —
 * and the snapshot is rewritten with the fresh outcome. This is what makes a
 * receipt fetched after a later successful repair report `attached` rather than
 * the stale failure that first settled the record.
 *
 * Either way the returned take's `imageUrl` — minted at first admission and
 * likely expired — is re-minted from its durable handle through the
 * owner-checked resolver (#125); identity is left exactly as the snapshot
 * recorded it, and the persisted snapshot keeps its own frozen handle.
 */
async function resumeAdmittedTake(
  deps: AdmissionAttachDeps,
  request: AdmitPictureTakeRequest,
  recordId: string,
  snapshot: { statusCode: number; body: Record<string, unknown> },
  resolver: OwnedPictureResolver | undefined,
): Promise<AdmitPictureTakeResult> {
  const take = readAdmittedTake(snapshot.body);
  const settled =
    take.attachment.state === "attached"
      ? take
      : await attachAndComplete(deps, request, recordId, take);
  const fresh = await remintReplayedImageUrl(settled, request.userId, resolver);
  return { state: "admitted", take: fresh, replayed: true };
}
