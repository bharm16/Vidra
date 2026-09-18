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
 * 4. **Resolve or mint the session** (mint only when no destination was
 *    named, and only when this acceptance has not already minted one).
 * 5. **Admit through the shared boundary**, which owns ownership, idempotency,
 *    the picture's bytes and the take record.
 * 6. **Undo step 4 if step 5 did not produce a take.** A session created
 *    before a failed admission is the half-created state the ticket forbids;
 *    it is the caller's to remove, and only ever a session this call minted —
 *    a destination the creator already had is never touched.
 * 7. **Arm the first frame.** Last, because it needs the take identity step 5
 *    mints, and non-fatal: the take is durable and in its session by then, and
 *    destroying a real picture to punish a missing arm would be the wrong
 *    trade (the same reasoning `attachTakeToSession` records one layer down).
 */

export interface AcceptLiveOutputSessionPort extends AdmissionSessionPort {
  getSessionByPromptUuid(
    userId: string,
    promptUuid: string,
  ): Promise<{
    id: string;
    prompt?:
      | {
          versions?:
            | ReadonlyArray<{ versionId: string; prompt: string }>
            | undefined;
        }
      | undefined;
  } | null>;
  createPromptSession(
    userId: string,
    request: { name?: string; prompt: SessionPrompt },
  ): Promise<{ id: string }>;
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
  const { sessionService, mediaStore, idempotency } = deps;
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
    try {
      const already = await sessionService.getSessionByPromptUuid(
        userId,
        promptUuid,
      );
      if (already) {
        // A re-press of the same acceptance. Reuse its session and its root
        // words-version so the admission below replays its take rather than
        // conflicting on a second destination.
        const root = already.prompt?.versions?.[0];
        if (!root) {
          // This session was minted by this bridge and always had a root. If
          // it does not now, guessing an id would silently write a take under
          // a words-version nobody authored — say so instead.
          return {
            state: "unavailable",
            reason: `session ${already.id} has no root words-version`,
          };
        }
        sessionId = already.id;
        promptVersionId = root.versionId;
      } else {
        const root = buildRootPrompt(accepted.inputs.prompt, promptUuid);
        const session = await sessionService.createPromptSession(userId, {
          name: accepted.inputs.prompt,
          prompt: root.prompt,
        });
        sessionId = session.id;
        mintedSessionId = session.id;
        promptVersionId = root.versionId;
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log.warn("Acceptance refused: the session could not be created", {
        userId,
        reason,
      });
      return { state: "unavailable", reason };
    }
  }

  const undoMintedSession = async (): Promise<void> => {
    if (!mintedSessionId) return;
    try {
      await sessionService.deleteSessionForUser(userId, mintedSessionId);
    } catch (error) {
      log.error(
        "Acceptance failed and its new session could not be removed",
        error instanceof Error ? error : new Error(String(error)),
        { userId, sessionId: mintedSessionId },
      );
    }
  };

  let admitted;
  try {
    admitted = await admitPictureTake(
      { sessionService, mediaStore, idempotency },
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
    await undoMintedSession();
    const reason = error instanceof Error ? error.message : String(error);
    log.warn("Acceptance failed while admitting the picture", {
      userId,
      sessionId,
      reason,
    });
    return { state: "unavailable", reason };
  }

  if (admitted.state !== "admitted") {
    await undoMintedSession();
    return admitted.state === "refused"
      ? { state: "refused", reason: admitted.reason }
      : { state: admitted.state };
  }

  const { take } = admitted;

  // Armed last, and only reported through the log: the take is durable and in
  // its session, so a failed arm costs the creator one click, not a picture.
  //
  // Only in a session this bridge minted. A destination the caller named is a
  // session the creator is already working in, with a first frame of its own;
  // replacing it is a decision for the surface that names destinations, and
  // that surface does not exist yet (ADR-0022, "open and deliberately not
  // decided"). Admitting the take there is the whole of what was asked for.
  try {
    if (mintedSessionId) {
      await sessionService.updatePromptForUser(userId, mintedSessionId, {
        // keyframes[0] is the armed first frame (ADR-0011 D4): hydration
        // re-arms from the head of the array, which is what makes the frame a
        // session fact rather than a memory-only one.
        keyframes: [
          {
            id: take.generationId,
            url: take.imageUrl,
            source: "generation",
            assetId: take.assetId,
            storagePath: take.storagePath,
            generationId: take.generationId,
            sourcePrompt: accepted.inputs.prompt,
          },
        ],
      });
    }
  } catch (error) {
    log.error(
      "Accepted picture was admitted but could not be armed as the first frame",
      error instanceof Error ? error : new Error(String(error)),
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
    },
  };
}
