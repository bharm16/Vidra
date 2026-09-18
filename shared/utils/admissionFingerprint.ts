/**
 * The admission acceptance fingerprint — the immutable half of a take's
 * acceptance identity (ADR-0022 decision 6, issue #114).
 *
 * Two admissions are the same acceptance when, and only when, their admission
 * KEY and this fingerprint both agree. The key is the slot; the fingerprint is
 * what turns a reused key into a CONFLICT instead of a wrong replay. Before
 * this ticket the fingerprint hashed only the destination, origin and display
 * ancestor — so a different file retried under a retained key replayed the
 * earlier take instead of conflicting. The load-bearing addition is the media
 * digest.
 *
 * ## What identity means here, and why each field is or is not in it
 *
 *  - **media digest** — the bytes of the admitted picture. The one field that
 *    makes "a different file under the same key" a conflict. Passed in, never
 *    computed here: the server hashes a `Buffer` with `node:crypto` and the
 *    client (#129) hashes a `Blob` with Web Crypto, so the ONE place they must
 *    agree is the digest string, not the hashing. That is also why this module
 *    is pure — a `shared/` seam both sides compute, exactly like
 *    `wordsVersionSignature`.
 *  - **destination** (`sessionId`, `promptVersionId`) and **origin** — a take
 *    filed under a different version, or entering from a different door, is a
 *    different acceptance.
 *  - **production provenance** (ADR-0022 decision 2, including the sketch
 *    `seed`/`strength`/`steps` and the studio turn ids it carries) — the
 *    recorded fact of what produced the media.
 *  - **associated words** — the creator-confirmed words a newly minted session
 *    is filed under (ADR-0022 decision 2, issue #131). Present only when a
 *    caller sets them, which today is the studio return that mints a session
 *    around a standalone image: changing the confirmed description before a
 *    retry must be a DIFFERENT acceptance, never a replay that silently keeps
 *    the first words. A caller that files a take under a session's existing
 *    words omits it — the `sessionId`/`promptVersionId` already pin that
 *    identity — so their fingerprint is unchanged.
 *  - **contributing source inputs**, projected to their STABLE identity only:
 *    a `take` by its `generationId`, every other kind by its `kind` alone. The
 *    durable storage handles (`assetId`, `storagePath`) are deliberately
 *    dropped, because the live-editor accept re-stores its sketch snapshot on
 *    every re-press and so mints a fresh handle each time; hashing the handle
 *    would turn a legitimate retry of the SAME acceptance into a conflict. The
 *    take a source input points at is stable; the blob it was stored as this
 *    attempt is not.
 *  - **display ancestor** — the one relationship the space draws.
 *
 * Never in it: transient signed URLs. They are not passed in and no field
 * above carries one — a source input travels as a durable handle, provenance
 * as text and ids — so a reminted URL cannot change the acceptance.
 *
 * The returned object is a plain, order-stable value: the idempotency store
 * hashes it, and equal fingerprints must serialize identically.
 */
import type {
  TakeOrigin,
  TakeProductionProvenance,
  TakeSourceInput,
} from "../types/session.js";

/**
 * A source input reduced to what is stable across every retry of one
 * acceptance: its kind, and — for a `take` — the identity of the node it
 * points at. Never the storage handle it happened to be stored as this
 * attempt.
 */
export interface AdmissionSourceInputIdentity {
  kind: TakeSourceInput["kind"];
  generationId?: string;
}

export interface AdmissionAcceptanceFingerprintInput {
  sessionId: string;
  promptVersionId: string;
  origin: TakeOrigin;
  /**
   * Hex digest of the admitted media's bytes. Computed by the caller so this
   * module stays pure and platform-agnostic; the server and the client must
   * produce the same string for the same bytes.
   */
  mediaDigest: string;
  productionProvenance: TakeProductionProvenance;
  sourceInputs?: readonly TakeSourceInput[] | undefined;
  displayAncestorGenerationId: string | null;
  /**
   * The creator-confirmed associated words for a session this acceptance mints
   * (issue #131). Omitted when the take is filed under a session's own words —
   * the destination already pins that identity — so callers that do not set it
   * fingerprint exactly as before.
   */
  associatedWordsText?: string | undefined;
}

export interface AdmissionAcceptanceFingerprint {
  sessionId: string;
  promptVersionId: string;
  origin: TakeOrigin;
  mediaDigest: string;
  productionProvenance: TakeProductionProvenance;
  sourceInputs: AdmissionSourceInputIdentity[];
  displayAncestorGenerationId: string | null;
  associatedWordsText?: string;
}

function projectSourceInput(
  input: TakeSourceInput,
): AdmissionSourceInputIdentity {
  return input.generationId !== undefined
    ? { kind: input.kind, generationId: input.generationId }
    : { kind: input.kind };
}

/**
 * Assemble the immutable acceptance payload. Same inputs → same fingerprint;
 * a different digest, destination, provenance, source tuple or display
 * ancestor → a different one.
 */
export function buildAdmissionAcceptanceFingerprint(
  input: AdmissionAcceptanceFingerprintInput,
): AdmissionAcceptanceFingerprint {
  return {
    sessionId: input.sessionId,
    promptVersionId: input.promptVersionId,
    origin: input.origin,
    mediaDigest: input.mediaDigest,
    productionProvenance: input.productionProvenance,
    sourceInputs: (input.sourceInputs ?? []).map(projectSourceInput),
    displayAncestorGenerationId: input.displayAncestorGenerationId,
    // Placed last and only when set, so an admission that omits it serializes
    // byte-for-byte as it did before this field existed.
    ...(input.associatedWordsText !== undefined
      ? { associatedWordsText: input.associatedWordsText }
      : {}),
  };
}
