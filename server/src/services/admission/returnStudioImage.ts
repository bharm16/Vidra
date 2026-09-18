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
 * comparison: did the turn consume the image the project's origin names as the
 * bridged one? If yes, the returning take's display ancestor is the session
 * take that picture came from, and the space draws a `refine` edge. If no —
 * and a `generate` has no image inputs at all — the take is admitted with no
 * picture ancestor, which is an answer rather than a gap.
 *
 * Only a DIRECT consumption earns the edge. An edit of an edit consumed a
 * studio image that never entered the session and therefore has no take
 * identity to name; ADR-0022 decision 3 settles that case as "no display
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
 * 4. **Mint the session, if one is owed.** Last write before admission, and
 *    keyed so a second press lands on the first press's session.
 * 5. **Admit through the shared boundary**, which owns ownership, idempotency,
 *    the picture's bytes and the take record.
 * 6. **Undo step 4 if step 5 produced no take** — only ever a session this
 *    call minted.
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
 * The session capabilities this bridge needs beyond admission's own: looking
 * up the session a re-press already minted, minting one, removing it when the
 * admission it was minted for did not happen, and arming the first frame.
 */
export interface ReturnStudioImageSessionPort extends AdmissionSessionPort {
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
 * The classifier is an identity comparison against `origin.bridgedImageId` —
 * the project's own record of which of its images is the bridged one. Nothing
 * inspects prompts, filenames or model slugs, and nothing falls back to
 * position: a turn with no matching input has no display ancestor, full stop.
 *
 * The destination is part of the test, not an afterthought. A take is a node
 * in exactly one session's space, so when this picture is landing somewhere
 * else — the origin session was deleted and the creator chose a new one — the
 * bridged picture is recorded as an ordinary studio image by its durable path.
 * The fact that it went in is kept; the claim that it is a sibling in this
 * session is not made, because a `refine` edge to a node that is not here
 * would be a relationship the space cannot draw.
 */
function buildSourceInputs(
  produced: StudioProducedImage,
  destinationSessionId: string,
): {
  sourceInputs: TakeSourceInput[];
  displayAncestorGenerationId: string | null;
} {
  const origin = produced.origin;
  const bridgedTake =
    origin &&
    origin.sessionId === destinationSessionId &&
    origin.sourceInput.kind === "take" &&
    origin.sourceInput.generationId
      ? origin.sourceInput
      : undefined;

  let displayAncestorGenerationId: string | null = null;
  const sourceInputs = produced.sourceImages.map<TakeSourceInput>((image) => {
    if (bridgedTake && origin && image.id === origin.bridgedImageId) {
      displayAncestorGenerationId = bridgedTake.generationId ?? null;
      return bridgedTake;
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
  // provenance (decision 2), never the session's words. It is also the words
  // of a session minted around it, where there is no other direction to file
  // the picture under.
  const instruction = produced.image.sourcePrompt;

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
  if (destination.kind === "existing") {
    sessionId = destination.sessionId;
    promptVersionId = destination.promptVersionId;
  } else {
    const promptUuid = returnKey(projectId, imageId);
    try {
      const already = await sessionService.getSessionByPromptUuid(
        userId,
        promptUuid,
      );
      const root = already?.prompt?.versions?.[0];
      if (already && root) {
        // A re-press. Reuse its session and root words-version so the
        // admission below replays its take rather than conflicting on a
        // second destination.
        sessionId = already.id;
        promptVersionId = root.versionId;
      } else if (already) {
        // Minted by this bridge and always given a root. If it has none now,
        // guessing an id would file a take under words nobody authored.
        return {
          state: "unavailable",
          reason: `session ${already.id} has no root words-version`,
        };
      } else {
        const built = buildRootPrompt(instruction, promptUuid);
        const created = await sessionService.createPromptSession(userId, {
          name: instruction,
          prompt: built.prompt,
        });
        sessionId = created.id;
        mintedSessionId = created.id;
        promptVersionId = built.versionId;
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log.warn("Return failed: the session could not be created", {
        userId,
        projectId,
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
        "Return failed and its new session could not be removed",
        error instanceof Error ? error : new Error(String(error)),
        { userId, sessionId: mintedSessionId },
      );
    }
  };

  const { sourceInputs, displayAncestorGenerationId } = buildSourceInputs(
    produced,
    sessionId,
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
        // studio turn and image they ran in. The words the take is FILED
        // under stay the destination version's own text — the boundary reads
        // them from the session, and this request deliberately names none.
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
      },
    );
  } catch (error) {
    await undoMintedSession();
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
    await undoMintedSession();
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
          sourcePrompt: instruction,
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
      createdSession: destination.kind === "mint",
    },
  };
}
