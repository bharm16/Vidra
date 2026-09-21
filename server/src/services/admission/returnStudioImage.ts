import { v4 as uuidv4 } from "uuid";
import { logger } from "@infrastructure/Logger";
import {
  fetchRemoteMedia,
  type OwnedPictureResolver,
} from "@services/owned-media";
import {
  STORAGE_CONFIG,
  STORAGE_TYPES,
} from "@services/storage/config/storageConfig";
import { getTypeFromPath } from "@services/storage/utils/pathUtils";
import {
  SessionAccessDeniedError,
  SessionNotFoundError,
} from "@services/sessions/SessionService";
import type { StudioProducedImage } from "@services/studio/StudioService";
import { wordsVersionSignature } from "@shared/utils/wordsVersionSignature";
import type {
  SessionGenerationRecord,
  SessionPrompt,
  SessionPromptKeyframe,
  TakeSourceInput,
} from "@shared/types/session";
import type { StudioUseInSessionResult } from "@shared/schemas/studio.schemas";
import {
  admitPictureTake,
  type AdmissionIdempotencyPort,
  type AdmissionMediaStore,
  type AdmissionSessionPort,
} from "./admitPictureTake";
import {
  discardMintedSessionIfUncommitted,
  ensureAcceptanceSession,
  type AcceptanceSessionRead,
} from "./acceptanceSessionOwnership";

/**
 * "Use this in the session": the studio's return door — ADR-0022 decisions 2,
 * 3 and 4, issue #89.
 *
 * A studio image becomes a picture take in a session through the same
 * admission boundary as an upload and an accepted live output. Nothing here
 * generates, and nothing here writes to the studio: the project, its turns and
 * the source take all survive the press untouched.
 *
 * ## The rule this module exists to enforce
 *
 * A studio project can hold an edit of the bridged session picture and an
 * unrelated generation side by side. The project's `origin` says only that the
 * PROJECT came from a session picture — it says nothing about which of the
 * project's images did. So ancestry is derived from the PRODUCING TURN and
 * that turn's ACTUAL inputs (`StudioProducedImage.sourceImages`, resolved at
 * dispatch and persisted since this ticket), and the test is a single identity
 * comparison: did the turn consume an image that is a TAKE of the destination
 * session? If yes, the returning take's display ancestor is that take, and the
 * space draws a `refine` edge. If no — and a `generate` has no image inputs at
 * all — the take is admitted with no picture ancestor, which is an answer
 * rather than a gap.
 *
 * Two kinds of consumed image are takes of the destination session. The first
 * is the project's bridged picture, whose mapping the ORIGIN record captured
 * at bridge time. The second (issue #132, the owner-approved generalization of
 * ADR-0022 decision 4) is an image this return pipeline already admitted
 * here: its take's production provenance names the producing project, turn
 * and image identities, and `findTakeAdmittedFromStudioImage` looks that
 * identity up in the destination session — the session-side twin of the
 * studio store's identity-based produced-image retrieval (#121). This is the
 * session-owns decision: the take record is the ONLY place the relationship
 * "image X became take T in this session" lives, so there is no second
 * studio-side mapping to disagree with it or to outlive the session it points
 * at — deleting the destination session deletes the relationship with it, and
 * nothing can redirect a later return. The mapping WRITE is admission's own
 * (source inputs and display ancestor ride the take record): interrupted, the
 * #128 receipt replays to the same take and the resumed attach repairs the
 * relationship; replayed, the same derivation from the same records answers
 * identically, so a retry conflicts or resumes but never invents a rival.
 *
 * Only a DIRECT consumption earns the edge, and only to a take of THIS
 * destination session. An edit of an edit consumed studio images that are not
 * takes here — a bridged picture of another (gone) session, an image never
 * returned — and those are recorded as ordinary studio-image inputs with no
 * display ancestor; ADR-0022 decision 3 settles that case as "no display
 * ancestor" rather than reaching further up a chain the session never saw.
 *
 * ## The ordering, and why nothing half-created survives a failure
 *
 * 1. **Read the studio.** Ownership reads as absence, and the read tells us
 *    the turn, its real inputs and the project's origin.
 * 2. **Resolve the destination, read-only.** A foreign or vanished origin
 *    session refuses here, before a byte moves.
 * 3. **Read the bytes.** The one gate on what can be armed: a first frame must
 *    be storable raster media, and a failure here happens while there is still
 *    nothing to clean up.
 * 4. **Mint the session, if one is owed.** Last write before admission — one
 *    atomic create-if-absent on a deterministic id, so a second press lands on
 *    the first press's session rather than minting a rival (issue #130).
 * 5. **Admit through the shared boundary**, which owns ownership, idempotency,
 *    the picture's bytes and the take record.
 * 6. **Discard the minted session ONLY if it is still uncommitted** — never one
 *    that gained a take because a completion write failed after the attach, and
 *    only ever a session this call minted (issue #130).
 * 7. **Arm the first frame.** Last, because it needs the take identity, and
 *    non-fatal: by then the picture is durable and in its session, and a
 *    failed arm costs a click rather than a picture.
 *
 * Unlike the live editor's accept (#87), this arms the frame in a destination
 * the creator already had. There, no surface names a destination, so replacing
 * an existing first frame would have been a decision nobody made. Here the
 * destination IS the session the creator bridged out of and pressed "Use this
 * in the session" to return to; arming is the point of the press.
 */

export interface ReturnStudioImageStudioPort {
  findProducedImage(
    userId: string,
    projectId: string,
    imageId: string,
  ): Promise<StudioProducedImage | null>;
}

/**
 * The session capabilities this bridge needs beyond admission's own: minting
 * the session atomically (which also returns the one a re-press already minted),
 * removing it when it is still uncommitted, and arming the first frame.
 */
export interface ReturnStudioImageSessionPort extends AdmissionSessionPort {
  /**
   * Mint the session for this return, or return the one an earlier press
   * minted — one atomic step keyed on a deterministic id, so racing presses of
   * the same image converge on one session (issue #130).
   */
  createPromptSessionAtomically(
    userId: string,
    sessionId: string,
    request: { name?: string; prompt: SessionPrompt },
  ): Promise<{ created: boolean; session: AcceptanceSessionRead }>;
  updatePromptForUser(
    userId: string,
    sessionId: string,
    updates: { keyframes: SessionPromptKeyframe[] },
  ): Promise<unknown>;
  deleteSessionForUser(userId: string, sessionId: string): Promise<void>;
  /**
   * The session-side twin of the studio store's produced-image lookup (#121):
   * the take THIS destination session admitted a studio image as, found by the
   * provenance identity the take itself carries — or `null` when none is.
   * Resolution is exact (one identity match) and scoped to the destination, so
   * an image admitted to a session other than this one, or to one since
   * deleted, reads as `null` rather than as a cross-session edge.
   */
  findTakeAdmittedFromStudioImage(
    userId: string,
    sessionId: string,
    studioImage: { projectId: string; imageId: string },
  ): Promise<SessionGenerationRecord | null>;
}

export interface ReturnStudioImageDependencies {
  studio: ReturnStudioImageStudioPort;
  sessionService: ReturnStudioImageSessionPort;
  mediaStore: AdmissionMediaStore;
  idempotency: AdmissionIdempotencyPort;
  /**
   * Issue #125: forwarded to the admission boundary so a repeated "Use this in
   * the session" (replay) answers with a freshly minted `imageUrl` and the same
   * identity. Optional — without it a replay keeps its stored URL.
   */
  resolver?: OwnedPictureResolver | undefined;
}

export interface ReturnStudioImageRequest {
  /** The authenticated creator. The project, the session and the bytes are theirs. */
  userId: string;
  projectId: string;
  /** The image inside that project, by the id the project addresses it with. */
  imageId: string;
  /**
   * The creator's answer when the project's origin session no longer exists.
   * Defaults to refusing: a session recreated without being asked for is
   * exactly the silent recreation ADR-0022 decision 4 forbids.
   */
  onMissingOriginSession?: "refuse" | "new-session" | undefined;
  /**
   * The creator-confirmed associated words for a session this return mints
   * (ADR-0022 decision 2, issue #131). Read only when a new session is owed —
   * a return into an existing origin session files the take under that
   * session's own words and ignores this. Never the edit instruction or
   * transform label: those become production provenance, and confirming them as
   * a session's words is the fabrication decision 2 forbids. Absent (or blank)
   * on the first press of a standalone return, which is answered with
   * `needs-confirmed-words` rather than a guess.
   */
  confirmedWords?: string | undefined;
}

export type ReturnStudioImageResult =
  | { state: "returned"; result: StudioUseInSessionResult }
  /** No such produced image in a project this creator can see. */
  | { state: "not-found" }
  /** The destination session is not this creator's. Nothing happened. */
  | { state: "refused"; reason: string }
  /**
   * The project's origin session is gone. Recoverable: the creator can choose
   * to start a new session instead. Never resolved by guessing.
   */
  | { state: "origin-session-missing"; sessionId: string }
  /**
   * A new session is owed but its associated words have not been confirmed
   * (ADR-0022 decision 2, issue #131). Recoverable: the creator confirms the
   * words and re-presses. `suggestion` is offered ONLY when the image has a
   * standalone description to prefill — a from-scratch generate's prompt — and
   * is absent for an edit or a transform, whose producing text is an
   * instruction, not a description. Nothing has been minted or stored.
   */
  | { state: "needs-confirmed-words"; suggestion?: string | undefined }
  /** The stored image is not media a first frame can be armed from. */
  | { state: "unusable-media"; reason: string }
  /** Storage or the session store could not answer. Nothing was left behind. */
  | { state: "unavailable"; reason: string }
  /** A matching return is already running. Never a second take. */
  | { state: "in_progress" }
  /** The same image is already returning somewhere else. */
  | { state: "conflict" };

const log = logger.child({ service: "returnStudioImage" });

/**
 * What a first frame can be armed from, which is also everything this pipeline
 * can store: `STORAGE_CONFIG.allowedContentTypes.previewImage` is the rule the
 * studio's own images already passed on the way in. Read from there rather
 * than restated, so the bridge cannot drift into accepting media storage would
 * refuse — or refusing media it would take.
 *
 * This is why a vector result cannot come back through here. It is also why
 * one cannot reach this gate today: `image/svg+xml` is absent from that list,
 * so an SVG generation fails `saveFromUrl` and settles as a failed call with
 * no image record at all. The gate states the requirement where the creator
 * meets it, and would refuse a vector with an explanation the day storage
 * learns to keep one.
 */
const ARMABLE_CONTENT_TYPES = STORAGE_CONFIG.allowedContentTypes.previewImage;

/** The ceiling `preview-image` storage already enforces. */
const MAX_IMAGE_BYTES = STORAGE_CONFIG.maxFileSize.previewImage;

/**
 * The name this one return goes by, everywhere it needs a stable one: the
 * admission's idempotency key, and the prompt uuid of a session it mints.
 *
 * Derived rather than supplied, because the creator's press carries no key and
 * the two facts that make a return the same return — which project, which
 * image — are both already in the request. A second press from another tab
 * therefore replays the first rather than minting a rival take.
 */
const returnKey = (projectId: string, imageId: string): string =>
  `studio-return:${projectId}:${imageId}`;

/**
 * The creator's confirmed words, or undefined when none usable was supplied.
 * Blank or whitespace-only input is not a confirmation — it is answered with a
 * fresh request for words, never treated as "the creator chose empty words".
 */
function normalizeConfirmedWords(
  value: string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * The editable words offered as a prefill when a new session needs its
 * associated words (ADR-0022 decision 2, issue #131), or undefined when there
 * is nothing honest to offer.
 *
 * Only a from-scratch `generate` produced a standalone description of its
 * image, so only a generate's `sourcePrompt` prefills the field. An `edit` or a
 * `transform` produced its image through an instruction or an operation label —
 * production provenance, not a description of the result — and a multi-input
 * composition has no unique original prompt to pick from, so both return
 * nothing and the creator's words are required (rule 2). The classification is
 * the producing turn's ACTION, never the prompt text or `sourceImages` alone,
 * so a corrupted edit record can never leak its instruction as a suggestion.
 */
function suggestedAssociatedWords(
  produced: StudioProducedImage,
): string | undefined {
  if (produced.producingAction !== "generate") return undefined;
  const prompt = produced.image.sourcePrompt.trim();
  return prompt.length > 0 ? prompt : undefined;
}

/** The root words-node of a session born from a returned picture: one only. */
function buildRootPrompt(
  promptText: string,
  promptUuid: string,
): { prompt: SessionPrompt; versionId: string } {
  const versionId = `v-${Date.now()}-${uuidv4().slice(0, 6)}`;
  return {
    versionId,
    prompt: {
      uuid: promptUuid,
      title: promptText,
      input: promptText,
      output: promptText,
      versions: [
        {
          versionId,
          label: "v1",
          // Agreed with the client's own version dedupe, so the creator's
          // first action in this session does not fork a second words-node
          // carrying the very same text.
          signature: wordsVersionSignature(promptText),
          prompt: promptText,
          timestamp: new Date().toISOString(),
          generations: [],
        },
      ],
    },
  };
}

/**
 * ADR-0022 decision 3: every input the producing turn consumed, plus the ONE
 * that is a take of the DESTINATION session.
 *
 * A consumed image is a take of this session in exactly two ways, both identity
 * comparisons — nothing inspects prompts, filenames or model slugs, and
 * nothing falls back to position:
 *
 *  1. **The bridged picture.** The project's `origin` captured its mapping at
 *     bridge time; it applies only while the destination IS that origin
 *     session.
 *  2. **A previously returned image (issue #132).** The take its own return
 *     admitted here carries the producing project/image identities in its
 *     provenance, and `findTakeAdmittedFromStudioImage` looks the consumed
 *     image's identity up in THIS session — the #121 retrieval contract read
 *     from the session side. An image admitted to a session other than this
 *     one (or to one since deleted) reads as `null` and is recorded as an
 *     ordinary studio image: the fact that it went in is kept; the claim that
 *     it is a sibling in THIS session is not made, because a `refine` edge to
 *     a node that is not here would be a relationship the space cannot draw.
 *
 * The display ancestor is the bridged take when there is one — the origin's
 * recorded choice keeps precedence; otherwise the first consumed input, in the
 * turn's own input order, that resolved to a take of this session. A recorded
 * choice among recorded inputs either way; several resolves and no bridge
 * cannot guess beyond it.
 */
async function buildSourceInputs(
  produced: StudioProducedImage,
  destinationSessionId: string,
  sessionService: ReturnStudioImageSessionPort,
  userId: string,
  /** False when the destination is a session this flow minted: empty by
   * construction, so there is nothing for the lookup to answer with — and
   * skipping keeps a replay's derivation identical to the first attempt's. */
  resolveReturned: boolean,
): Promise<{
  sourceInputs: TakeSourceInput[];
  displayAncestorGenerationId: string | null;
}> {
  const origin = produced.origin;
  const bridgedTake =
    origin &&
    origin.sessionId === destinationSessionId &&
    origin.sourceInput.kind === "take" &&
    origin.sourceInput.generationId
      ? origin.sourceInput
      : undefined;

  // Resolved once per distinct consumed image, before the inputs are shaped.
  const previouslyReturned = new Map<string, TakeSourceInput>();
  if (resolveReturned) {
    for (const image of produced.sourceImages) {
      if (bridgedTake && image.id === origin?.bridgedImageId) continue;
      if (previouslyReturned.has(image.id)) continue;
      const take = await sessionService.findTakeAdmittedFromStudioImage(
        userId,
        destinationSessionId,
        { projectId: produced.projectId, imageId: image.id },
      );
      if (take?.id) {
        previouslyReturned.set(image.id, {
          kind: "take",
          generationId: take.id,
          ...(typeof take.storagePath === "string" && take.storagePath
            ? { storagePath: take.storagePath }
            : {}),
        });
      }
    }
  }

  let displayAncestorGenerationId: string | null = null;
  const sourceInputs = produced.sourceImages.map<TakeSourceInput>((image) => {
    if (bridgedTake && origin && image.id === origin.bridgedImageId) {
      displayAncestorGenerationId = bridgedTake.generationId ?? null;
      return bridgedTake;
    }
    const resolved = previouslyReturned.get(image.id);
    if (resolved) {
      displayAncestorGenerationId ??= resolved.generationId ?? null;
      return resolved;
    }
    // A studio image this session has never seen: recorded in full, but it is
    // not a node in this session's space, so it can never be the ancestor
    // the space draws.
    return { kind: "studio-image", storagePath: image.storagePath };
  });

  return { sourceInputs, displayAncestorGenerationId };
}

type Destination =
  | { kind: "existing"; sessionId: string; promptVersionId: string }
  | { kind: "mint" };

/**
 * Where the picture is going, decided without writing anything.
 *
 * The project's origin is the only answer accepted; a caller cannot name a
 * session, because the project already knows which one it came from and a
 * second copy of that fact is free to disagree with the first.
 */
function resolveDestination(
  produced: StudioProducedImage,
  sessionService: ReturnStudioImageSessionPort,
  userId: string,
  onMissing: "refuse" | "new-session",
): Promise<Destination | ReturnStudioImageResult> {
  const origin = produced.origin;
  if (!origin) return Promise.resolve({ kind: "mint" });

  return sessionService
    .requireOwnedSession(userId, origin.sessionId)
    .then<Destination | ReturnStudioImageResult>(() => ({
      kind: "existing",
      sessionId: origin.sessionId,
      promptVersionId: origin.promptVersionId,
    }))
    .catch((error: unknown): Destination | ReturnStudioImageResult => {
      if (error instanceof SessionNotFoundError) {
        if (onMissing === "new-session") return { kind: "mint" };
        log.info("Return refused: the project's origin session is gone", {
          userId,
          projectId: produced.projectId,
          sessionId: origin.sessionId,
        });
        return { state: "origin-session-missing", sessionId: origin.sessionId };
      }
      if (error instanceof SessionAccessDeniedError) {
        return { state: "refused", reason: error.message };
      }
      throw error;
    });
}

export async function returnStudioImage(
  deps: ReturnStudioImageDependencies,
  request: ReturnStudioImageRequest,
): Promise<ReturnStudioImageResult> {
  const { studio, sessionService, mediaStore, idempotency, resolver } = deps;
  const { userId, projectId, imageId } = request;

  const produced = await studio.findProducedImage(userId, projectId, imageId);
  if (!produced) return { state: "not-found" };

  // A vector (SVG) result cannot be armed as a first frame: the frame and clip
  // pipeline downstream is raster-only, which ARMABLE_CONTENT_TYPES already
  // encodes. Refuse it HERE — before resolving a destination or reading bytes —
  // with a message that names the reason, rather than letting the raster gate
  // below reject it as a bare content-type mismatch (issue #118). The vector
  // itself is untouched: it stays stored, viewable and downloadable in the
  // studio; only the animate bridge declines it.
  if (
    getTypeFromPath(produced.image.storagePath) === STORAGE_TYPES.PREVIEW_VECTOR
  ) {
    log.info("Return refused: a vector cannot be armed as a first frame", {
      userId,
      projectId,
      imageId,
    });
    return {
      state: "unusable-media",
      reason: "this is a vector (SVG) image and cannot be animated here yet",
    };
  }

  const destination = await resolveDestination(
    produced,
    sessionService,
    userId,
    request.onMissingOriginSession ?? "refuse",
  );
  if (!("kind" in destination)) return destination;

  // The exact prompt or instruction that produced THIS image — production
  // provenance (decision 2), never the session's words. For a minted session
  // the words come from the creator (below), not from here: an edit's
  // instruction or a transform's label restored as associated words is exactly
  // the fabrication decision 2 forbids.
  const instruction = produced.image.sourcePrompt;

  // Where the take lands, plus — when a session is owed — the creator-confirmed
  // words it will be filed under (issue #131). Decided before any byte is read,
  // so a request for confirmation leaves nothing behind, exactly like a missing
  // origin session. A return into an existing origin session needs no
  // confirmation: the take is filed under that session's own words.
  let plan:
    | { kind: "existing"; sessionId: string; promptVersionId: string }
    | { kind: "mint"; confirmedWords: string };
  if (destination.kind === "existing") {
    plan = {
      kind: "existing",
      sessionId: destination.sessionId,
      promptVersionId: destination.promptVersionId,
    };
  } else {
    const confirmedWords = normalizeConfirmedWords(request.confirmedWords);
    if (confirmedWords === undefined) {
      const suggestion = suggestedAssociatedWords(produced);
      return {
        state: "needs-confirmed-words",
        ...(suggestion !== undefined ? { suggestion } : {}),
      };
    }
    plan = { kind: "mint", confirmedWords };
  }

  let media: { buffer: Buffer; contentType: string };
  try {
    // Signed per read and used once; the bridge stores the BYTES, so the take
    // never depends on a URL that lives an hour.
    const fetched = await fetchRemoteMedia({
      sourceUrl: produced.viewUrl,
      fieldName: "studioImage",
      allowedContentTypes: ARMABLE_CONTENT_TYPES,
      maxBytes: MAX_IMAGE_BYTES,
    });
    media = { buffer: fetched.buffer, contentType: fetched.contentType };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.warn("Return refused: the studio image could not be read as a frame", {
      userId,
      projectId,
      imageId,
      reason,
    });
    return { state: "unusable-media", reason };
  }

  let sessionId: string;
  let promptVersionId: string;
  let mintedSessionId: string | undefined;
  if (plan.kind === "existing") {
    sessionId = plan.sessionId;
    promptVersionId = plan.promptVersionId;
  } else {
    const promptUuid = returnKey(projectId, imageId);
    let ensured;
    try {
      ensured = await ensureAcceptanceSession(sessionService, {
        userId,
        promptUuid,
        // The creator's confirmed words — never the producing instruction.
        name: plan.confirmedWords,
        root: buildRootPrompt(plan.confirmedWords, promptUuid),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log.warn("Return failed: the session could not be created", {
        userId,
        projectId,
        reason,
      });
      return { state: "unavailable", reason };
    }
    if (!ensured.ok) {
      return { state: "unavailable", reason: ensured.reason };
    }
    sessionId = ensured.sessionId;
    promptVersionId = ensured.promptVersionId;
    mintedSessionId = ensured.mintedSessionId;
  }

  const { sourceInputs, displayAncestorGenerationId } = await buildSourceInputs(
    produced,
    sessionId,
    sessionService,
    userId,
    plan.kind === "existing",
  );

  let admitted;
  try {
    admitted = await admitPictureTake(
      { sessionService, mediaStore, idempotency, resolver },
      {
        userId,
        sessionId,
        promptVersionId,
        origin: "studio",
        media,
        // Decision 2: the instruction and the model that ran, plus which
        // studio turn and image they ran in — recorded as production
        // provenance, kept distinct from the words the take is filed under.
        productionProvenance: {
          state: "known",
          instruction,
          model: produced.image.model,
          studio: {
            projectId: produced.projectId,
            turnId: produced.turnId,
            imageId: produced.image.id,
          },
        },
        sourceInputs,
        displayAncestorGenerationId,
        idempotencyKey: returnKey(projectId, imageId),
        model: produced.image.model,
        // The associated words. For a minted session they are the creator's
        // confirmed words, passed so they enter the take record AND the
        // acceptance identity (issue #131) — a changed confirmation is a
        // different acceptance, never a silent replay. For an existing origin
        // session none is passed: the boundary reads that session's own words.
        ...(plan.kind === "mint"
          ? { associatedWordsText: plan.confirmedWords }
          : {}),
      },
    );
  } catch (error) {
    // A throw here cannot, by its error alone, distinguish a failure before any
    // commit from a completion write that failed after the take attached. The
    // compensation re-reads the session and removes it only while it is still
    // uncommitted, so committed work is never deleted (issue #130).
    await discardMintedSessionIfUncommitted(sessionService, {
      userId,
      mintedSessionId,
      concurrentClaimOwner: false,
    });
    const reason = error instanceof Error ? error.message : String(error);
    log.warn("Return failed while admitting the picture", {
      userId,
      projectId,
      sessionId,
      reason,
    });
    return { state: "unavailable", reason };
  }

  if (admitted.state !== "admitted") {
    // `in_progress`/`conflict` mean another same-key admission holds the claim
    // and may be attaching into this very session, so it is not this attempt's
    // to remove.
    await discardMintedSessionIfUncommitted(sessionService, {
      userId,
      mintedSessionId,
      concurrentClaimOwner:
        admitted.state === "in_progress" || admitted.state === "conflict",
    });
    return admitted.state === "refused"
      ? { state: "refused", reason: admitted.reason }
      : { state: admitted.state };
  }

  const { take } = admitted;

  try {
    await sessionService.updatePromptForUser(userId, sessionId, {
      // keyframes[0] is the armed first frame (ADR-0011 D4): hydration
      // re-arms from the head of the array, and the take identity riding on
      // it is what lets a clip made from this frame name it as its ancestor.
      keyframes: [
        {
          id: take.generationId,
          url: take.imageUrl,
          source: "generation",
          assetId: take.assetId,
          storagePath: take.storagePath,
          generationId: take.generationId,
          // The frame's words: the creator's confirmed words for a session this
          // return minted, the producing instruction for a refine into an
          // existing origin session (unchanged there).
          sourcePrompt:
            plan.kind === "mint" ? plan.confirmedWords : instruction,
        },
      ],
    });
  } catch (error) {
    log.error(
      "Returned picture was admitted but could not be armed as the first frame",
      error instanceof Error ? error : new Error(String(error)),
      { userId, sessionId, generationId: take.generationId },
    );
  }

  return {
    state: "returned",
    result: {
      sessionId,
      promptVersionId,
      generationId: take.generationId,
      imageUrl: take.imageUrl,
      ancestorGenerationId: displayAncestorGenerationId,
      // Stated from the destination decision rather than from what happened,
      // so a replay of this return answers identically.
      createdSession: plan.kind === "mint",
    },
  };
}
