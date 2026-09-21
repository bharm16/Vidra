import { v4 as uuidv4 } from "uuid";
import { logger } from "@infrastructure/Logger";
import { validateImageBuffer } from "@utils/validateFileType";
import { wordsVersionSignature } from "@shared/utils/wordsVersionSignature";
import type {
  SessionPrompt,
  SessionPromptKeyframe,
} from "@shared/types/session";
import type {
  SketchAcceptRequest,
  SketchAcceptResult,
} from "@shared/schemas/sketch.schemas";
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
import { armFirstFrame } from "./armFirstFrame";
import type { OwnedPictureResolver } from "@services/owned-media";

/**
 * "Use this": the door out of the Live editor — ADR-0022 decision 5, issue #87.
 *
 * The picture the creator was LOOKING AT becomes a picture take with origin
 * `sketchpad`, in a session born around it, armed as its first frame. Nothing
 * here regenerates: the bytes arrive with the request, and the live editor
 * goes on running and keeps nothing (ADR-0017 stands).
 *
 * The one fact this module is built around: the sketchpad and the prompt keep
 * moving while a frame is in flight, so the inputs of the accepted output are
 * NOT readable at acceptance time. They are captured with the frame at
 * dispatch, travel in the request, and are recorded verbatim. Nothing below
 * re-reads or re-derives them — the confident-but-wrong provenance record this
 * ticket exists to prevent is exactly what a re-read would produce.
 *
 * ## The ordering, and why nothing half-created survives a failure
 *
 * 1. **Decode and sniff both images.** Pure and local. Unreadable media is a
 *    bad request before a single byte is stored.
 * 2. **Check a named destination is the creator's.** A read, so a refusal
 *    leaves nothing behind. The admission boundary re-checks and remains the
 *    authority; this one only buys a clean refusal.
 * 3. **Store the sketch snapshot.** It is a source input of the take, so it
 *    must be durable before the record that names it is built — and, being the
 *    first write, it is also where "persistence is unavailable" surfaces,
 *    while there is still nothing to clean up.
 * 4. **Resolve or mint the session** (mint only when no destination was named).
 *    The mint is one atomic create-if-absent on a deterministic id, so two
 *    presses of the same output converge on one session rather than each
 *    minting its own (issue #130). Only the press that actually created the
 *    session may later compensate for it.
 * 5. **Admit through the shared boundary**, which owns ownership, idempotency,
 *    the picture's bytes and the take record.
 * 6. **Discard the minted session ONLY if it is still uncommitted.** A session
 *    minted before a failed admission is removed — but only when it holds no
 *    take and no concurrent same-key admission is attaching into it. A
 *    completion write that fails after the take has already attached surfaces
 *    here as a thrown admission; the session is kept, because the take is
 *    durable and resumable and deleting it would destroy committed work
 *    (issue #130). A destination the creator already had is never touched.
 * 7. **Arm the first frame.** Last, because it needs the take identity step 5
 *    mints, and a separately observable outcome (issue #136): the take is
 *    durable and in its session by then, so destroying a real picture to
 *    punish a missing arm would be the wrong trade (the same reasoning
 *    `attachTakeToSession` records one layer down) — but the outcome is
 *    REPORTED, never swallowed into a log, and a failed arm is repairable
 *    through the arm door without readmission and without a second take.
 */

export interface AcceptLiveOutputSessionPort extends AdmissionSessionPort {
  /**
   * Mint the session for this acceptance, or return the one an earlier press
   * minted — one atomic step keyed on a deterministic id, so racing presses of
   * the same output converge on one session (issue #130).
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
}

export interface AcceptLiveOutputDependencies {
  sessionService: AcceptLiveOutputSessionPort;
  mediaStore: AdmissionMediaStore;
  idempotency: AdmissionIdempotencyPort;
  /**
   * Issue #125: forwarded to the admission boundary so a repeated acceptance
   * (replay) answers with a freshly minted `imageUrl` and the same identity.
   * Optional — without it a replay keeps its stored URL, the prior behavior.
   */
  resolver?: OwnedPictureResolver | undefined;
}

export interface AcceptLiveOutputRequest {
  /** The authenticated creator. The picture, the storage and the session are theirs. */
  userId: string;
  accepted: SketchAcceptRequest;
  /**
   * The relay model that made this picture, pinned beside the relay itself so
   * the model stays a one-constant change (ADR-0016) and the take's tier stays
   * derived from it (ADR-0021).
   */
  model: string;
}

export type AcceptLiveOutputResult =
  | { state: "accepted"; result: SketchAcceptResult }
  /** The media could not be read as an image. Nothing happened. */
  | { state: "invalid"; reason: string }
  /** The named destination is not this creator's. Nothing happened. */
  | { state: "refused"; reason: string }
  /** Storage could not take the bytes. Nothing was left behind. */
  | { state: "unavailable"; reason: string }
  /** A matching acceptance is already running. Never a second take. */
  | { state: "in_progress" }
  /** The same key was used for a different acceptance. */
  | { state: "conflict" };

const log = logger.child({ service: "acceptLiveOutput" });

interface DecodedMedia {
  buffer: Buffer;
  contentType: string;
}

/**
 * Read a `data:<mime>;base64,<payload>` URI into bytes.
 *
 * The declared mime is not trusted and not returned: `validateImageBuffer`
 * sniffs the bytes, which is the same door the upload path goes through.
 */
async function decodeImageDataUri(
  value: string,
  field: string,
): Promise<DecodedMedia> {
  if (!value.startsWith("data:")) {
    throw new Error(`${field} is not a data URI`);
  }
  const separator = value.indexOf(",");
  if (separator < 0) {
    throw new Error(`${field} has no payload`);
  }
  const header = value.slice("data:".length, separator);
  if (!header.endsWith(";base64")) {
    throw new Error(`${field} is not base64-encoded`);
  }
  const buffer = Buffer.from(value.slice(separator + 1), "base64");
  if (buffer.length === 0) {
    throw new Error(`${field} is empty`);
  }
  const contentType = await validateImageBuffer(buffer, field);
  return { buffer, contentType };
}

/**
 * The session a given acceptance is allowed to mint, named by that acceptance.
 *
 * A second press must land on the FIRST press's session, and it cannot ask the
 * admission boundary — that boundary's replay is keyed on the destination, so
 * a second session would read as a different request and conflict instead of
 * replaying. The session domain already has the answer: `prompt.uuid` is its
 * own identity, looked up per creator. Naming it after the acceptance makes
 * the mint idempotent through a door that already exists, rather than adding a
 * second idempotency record beside the per-admission one ADR-0022 decision 6
 * permits. The prefix keeps the space disjoint from real prompt uuids.
 */
const acceptancePromptUuid = (idempotencyKey: string): string =>
  `sketch-accept:${idempotencyKey}`;

/** The root words-node of a session born from a sketch: one, and only one. */
function buildRootPrompt(
  promptText: string,
  promptUuid: string,
): {
  prompt: SessionPrompt;
  versionId: string;
} {
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

export async function acceptLiveOutput(
  deps: AcceptLiveOutputDependencies,
  request: AcceptLiveOutputRequest,
): Promise<AcceptLiveOutputResult> {
  const { sessionService, mediaStore, idempotency, resolver } = deps;
  const { accepted, userId } = request;

  let picture: DecodedMedia;
  let snapshot: DecodedMedia;
  try {
    picture = await decodeImageDataUri(
      accepted.liveOutputDataUri,
      "liveOutputDataUri",
    );
    snapshot = await decodeImageDataUri(
      accepted.sketchSnapshotDataUri,
      "sketchSnapshotDataUri",
    );
  } catch (error) {
    return {
      state: "invalid",
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  // Refuse a foreign destination before storing anything. `admitPictureTake`
  // checks it too and is the authority; checking here is what keeps the
  // refusal free of orphaned bytes.
  if (accepted.destination) {
    try {
      await sessionService.requireOwnedSession(
        userId,
        accepted.destination.sessionId,
      );
    } catch (error) {
      return {
        state: "refused",
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Re-stored on a re-press, because the claim that recognises a replay lives
  // one layer down. That costs one orphan blob per double-click and buys the
  // ordering above: the first write happens while there is still nothing to
  // clean up. The TAKE's media is never re-stored — that is the boundary's.
  let storedSnapshot;
  try {
    storedSnapshot = await mediaStore.storeFromBuffer(
      snapshot.buffer,
      snapshot.contentType,
      userId,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.warn("Acceptance refused: the sketch snapshot could not be stored", {
      userId,
      reason,
    });
    return { state: "unavailable", reason };
  }

  let sessionId: string;
  let promptVersionId: string;
  let mintedSessionId: string | undefined;
  if (accepted.destination) {
    sessionId = accepted.destination.sessionId;
    promptVersionId = accepted.destination.promptVersionId;
  } else {
    const promptUuid = acceptancePromptUuid(accepted.idempotencyKey);
    let ensured;
    try {
      ensured = await ensureAcceptanceSession(sessionService, {
        userId,
        promptUuid,
        name: accepted.inputs.prompt,
        root: buildRootPrompt(accepted.inputs.prompt, promptUuid),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log.warn("Acceptance refused: the session could not be created", {
        userId,
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

  let admitted;
  try {
    admitted = await admitPictureTake(
      { sessionService, mediaStore, idempotency, resolver },
      {
        userId,
        sessionId,
        promptVersionId,
        origin: "sketchpad",
        media: { buffer: picture.buffer, contentType: picture.contentType },
        // Decision 2: what actually produced THIS picture. The sketch prompt
        // lives here even when it is also the session's words — two facts, two
        // fields, never presented as one.
        productionProvenance: {
          state: "known",
          instruction: accepted.inputs.prompt,
          model: request.model,
          sketch: {
            seed: accepted.inputs.seed,
            strength: accepted.inputs.strength,
            steps: accepted.inputs.steps,
          },
        },
        // Decision 3: the drawing that went in, by durable handle. The
        // boundary appends the accepted picture itself.
        sourceInputs: [
          {
            kind: "sketch",
            assetId: storedSnapshot.id,
            storagePath: storedSnapshot.storagePath,
          },
        ],
        // No take ancestor: a sketch is not a take, so the picture hangs from
        // its words-version and earns no `refine` edge.
        displayAncestorGenerationId: null,
        idempotencyKey: accepted.idempotencyKey,
        model: request.model,
      },
    );
  } catch (error) {
    // A throw here is indistinguishable, by its error alone, between a failure
    // before any commit and a completion write that failed AFTER the take
    // attached. The compensation re-reads the session and only removes it while
    // it is still uncommitted, so committed work is never deleted (issue #130).
    await discardMintedSessionIfUncommitted(sessionService, {
      userId,
      mintedSessionId,
      concurrentClaimOwner: false,
    });
    const reason = error instanceof Error ? error.message : String(error);
    log.warn("Acceptance failed while admitting the picture", {
      userId,
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

  // Armed last (ADR-0011 D4 lives on the write itself — see `armFirstFrame`),
  // and OWED whenever this acceptance owns the session it landed in: the one
  // it minted, or the one an earlier press of the SAME acceptance minted. A
  // re-press therefore arms exactly as a first press does — the retry that
  // repairs an attached-but-not-armed take never re-admits (the boundary
  // replays) and never mints a second take (issue #136, retry parity).
  //
  // A destination the caller named is a session the creator is already working
  // in, with a first frame of its own; replacing it is a decision for the
  // surface that names destinations, and that surface does not exist yet
  // (ADR-0022, "open and deliberately not decided"). Admitting the take there
  // is the whole of what was asked for, and the arming fact says `not-owed`
  // rather than pretending.
  const armingOwed = accepted.destination === undefined;
  const arming: SketchAcceptResult["arming"] = armingOwed
    ? await armFirstFrame(
        { sessionService, ...(resolver ? { resolver } : {}) },
        { userId, sessionId, generationId: take.generationId },
      ).then(
        (armed): SketchAcceptResult["arming"] =>
          armed.ok
            ? { state: "armed", generationId: take.generationId }
            : {
                state: "failed",
                generationId: take.generationId,
                reason: armed.reason,
              },
        (error: unknown): SketchAcceptResult["arming"] => ({
          state: "failed",
          generationId: take.generationId,
          reason: error instanceof Error ? error.message : String(error),
        }),
      )
    : { state: "not-owed", generationId: take.generationId };
  if (arming.state === "failed") {
    log.error(
      "Accepted picture was admitted but could not be armed as the first frame",
      new Error(arming.reason ?? "arming failed"),
      { userId, sessionId, generationId: take.generationId },
    );
  }

  return {
    state: "accepted",
    result: {
      sessionId,
      promptVersionId,
      generationId: take.generationId,
      imageUrl: take.imageUrl,
      // "Into a session this bridge provided, not one you named" — stated
      // from the request so a replay of this acceptance answers identically.
      createdSession: accepted.destination === undefined,
      // Issue #134: the wrapper reports the outcome, never assuming it. The
      // take being durable and the take being in its session are independent
      // facts (ADR-0022 decision 6); an `attached` result says the session has
      // it, and a `failed` one is made-but-not-saved with the record a retry
      // re-sends — same take, no re-store, no re-render.
      attachment: take.attachment,
      // Issue #136: the arming outcome is a second, separately observable
      // fact. Only `armed` says the reopened session will restore this exact
      // picture as its first frame; `failed` is repairable through the arm
      // door without readmission and without a second take.
      arming,
    },
  };
}
