import { useCallback, useEffect, useRef, useState } from "react";
import {
  createAdmissionKey,
  uploadPreviewImage,
  validatePreviewImageFile,
  type UploadPreviewImageResponse,
} from "@/features/preview/api/previewApi";
import { retryPictureAttachment } from "@/features/generations/api/takeAttachment";
import type { KeyframeTile } from "@/features/generation-controls/types";
import type { PersistenceTarget } from "@/features/idea-box";
import type { TakeAttachment } from "@shared/schemas/attachment.schemas";

/**
 * Uploading a FIRST FRAME inside a session admits it as a picture take —
 * ADR-0022 decision 1, issue #86.
 *
 * Two facts make this more than an upload:
 *
 *  - The take gets a server-assigned identity, and that identity rides onto the
 *    armed frame. "Make it move" threads it as `sourceGenerationId`, so the
 *    clip names this picture as its ancestor — the same picture→clip edge a
 *    generated first frame gets. Before this, an uploaded frame was a keyframe
 *    on the session prompt: no identity, no node, and a clip animated from it
 *    hung from whichever picture the version happened to list first.
 *  - The destination is explicit. The words-version is resolved ONCE, before
 *    the request, and the server binds the take to that version — not to
 *    whichever version is current when the response lands.
 *
 * The attempt itself (issue #129) is one immutable object — file fingerprint,
 * destination session, words-version, admission key — built once, before the
 * request, against the acceptance identity the server enforces (issue #114:
 * same key + same acceptance = replay; same key + anything else = conflict)
 * and the receipt that makes a replay resolve to the current attachment
 * outcome (issue #128). Everything that happens later — a retry, a response —
 * is judged against THAT object, never against whatever the workspace shows
 * by then.
 *
 * Outside a session there is nothing to admit into, so the caller's plain
 * upload runs unchanged. Reference images never come through here at all.
 */

/** The success branch of the wire response — the only one that carries data. */
type SettledUploadResponse = Extract<
  UploadPreviewImageResponse,
  { success: true }
>;

/**
 * One admission attempt, immutable once built (issue #129). It is the client
 * half of the acceptance identity: the key the server de-duplicates on, bound
 * to the file it was minted for and the exact destination it names. A retry
 * reuses the WHOLE object — a retained key never travels to a new session or
 * version, because the server (issue #114) fingerprints the destination and
 * would refuse the mix as a conflict rather than replay it.
 */
export interface FirstFrameAdmissionAttempt {
  readonly key: string;
  readonly fileFingerprint: string;
  readonly sessionId: string;
  readonly promptVersionId: string;
}

export interface UseFirstFrameAdmissionParams {
  /** Resolved once per NEW attempt: minting/reading the words-version then. */
  resolvePersistenceTarget: () => PersistenceTarget;
  /**
   * The session the workspace is showing RIGHT NOW — the route truth the
   * attempt is judged against when its response lands (issue #129). A pure
   * read: re-resolving the persistence target here would mint words-versions,
   * so the session is read through this cheap getter instead. Returning null
   * means no remote session is open.
   */
  getActiveSessionId: () => string | null;
  setStartFrame: (tile: KeyframeTile) => void;
  /**
   * The pre-ADR upload, used when no session or words-version resolves. Passed
   * in rather than re-implemented: the owner already publishes it to the
   * sidebar, and two spellings of "upload a file" would drift.
   */
  uploadOutsideSession: (file: File) => Promise<{
    url: string;
    storagePath?: string;
    viewUrlExpiresAt?: string;
  } | null>;
  onError: (message: string) => void;
  onInvalidFile: (message: string) => void;
}

export interface UseFirstFrameAdmissionResult {
  uploadFirstFrame: (file: File) => Promise<void>;
  /**
   * The admitted frame that was made but not saved (ADR-0022 decision 6), or
   * null. The picture is on screen; its session does not have it. Surfaced so
   * the frame stage can say so plainly, with a retry — never presented as a
   * settled take a clip could name for a node that is not there.
   */
  unattachedTake: TakeAttachment | null;
  /** Re-attach the made-but-not-saved frame — the SAME take, no re-upload. */
  retryAttachment: () => Promise<void>;
}

/**
 * The client file fingerprint (issue #129): a fingerprint of the BYTES — the
 * same fact the server folds into its acceptance fingerprint (issue #114) —
 * not the file's name and timestamps, which two different pictures can share.
 *
 * Deliberately a pure-JS hash over the bytes, not `crypto.subtle`: this
 * fingerprint must behave identically in every environment the client runs
 * and tests in. A CI run caught the exact trap — in the jsdom test realm,
 * Node 20's webcrypto brand-checks its input and refuses the FileReader's
 * cross-realm ArrayBuffer, so the subtle path threw, the fallback below
 * silently kicked in, and a metadata-identical different file reused a
 * retained key. This hash only decides retry-vs-new-attempt on THIS client:
 * the server's own SHA-256 over the stored bytes remains the acceptance
 * authority (issue #114), so even a client-side hash collision can at worst
 * send a genuinely new acceptance under a retained key and be refused there
 * as a conflict — it can never replay a take it should not, and never
 * duplicate one.
 *
 * A file whose bytes cannot be read at all falls back to the metadata
 * signature, with the same safety argument: the worst it can do is let a
 * metadata-identical different file reuse a retained key, which the same
 * server-side conflict absorbs.
 */
async function fileFingerprint(file: File): Promise<string> {
  try {
    const bytes = await readFileBytes(file);
    return `bytes:fnv1a64:${fnv1a64(bytes)}:${bytes.byteLength}`;
  } catch {
    return `meta:${file.name}:${file.size}:${file.lastModified}`;
  }
}

/**
 * Two independent 32-bit FNV-1a lanes folded into one 64-bit hex string —
 * enough entropy to tell two picked files apart, cheap enough to run on an
 * image upload without anyone noticing.
 */
function fnv1a64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let laneA = 0x811c9dc5;
  let laneB = 0x01000193;
  for (const byte of view) {
    laneA = Math.imul(laneA ^ byte, 0x01000193) >>> 0;
    laneB = Math.imul(laneB + byte + 0x9e3779b9, 0x85ebca6b) >>> 0;
  }
  return (
    (laneA >>> 0).toString(16).padStart(8, "0") +
    (laneB >>> 0).toString(16).padStart(8, "0")
  );
}

/** Read a file's bytes, preferring the modern verb, falling back to FileReader. */
async function readFileBytes(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") {
    return await file.arrayBuffer();
  }
  return await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (): void => resolve(reader.result as ArrayBuffer);
    reader.onerror = (): void =>
      reject(reader.error ?? new Error("Could not read the file"));
    reader.readAsArrayBuffer(file);
  });
}

export function useFirstFrameAdmission({
  resolvePersistenceTarget,
  getActiveSessionId,
  setStartFrame,
  uploadOutsideSession,
  onError,
  onInvalidFile,
}: UseFirstFrameAdmissionParams): UseFirstFrameAdmissionResult {
  /**
   * The current attempt, held across its retries and replaced only by a
   * genuinely new one. A key minted per request would turn a retry into a
   * second take, which is the whole failure the key exists to prevent; an
   * attempt that never settled would turn the creator's NEXT upload into a
   * replay of this one.
   *
   * Retries reuse the attempt whole: re-picking the SAME file after a lost
   * response re-admits the same take under the same key to the SAME
   * destination — even if the workspace now shows another session. Navigating
   * never retargets an in-flight acceptance (issue #129); a different file, or
   * a settled attempt, is what mints a fresh one.
   */
  const attemptRef = useRef<FirstFrameAdmissionAttempt | null>(null);

  /**
   * A response that landed after the creator moved to another session. The
   * take is real — the server admitted it and holds the receipt (issue #128)
   * — but its frame must not appear in a session it does not belong to. It is
   * held here and applied if the creator returns to the attempt's own
   * session; any new attempt supersedes it.
   */
  const stashedResponseRef = useRef<{
    attempt: FirstFrameAdmissionAttempt;
    response: SettledUploadResponse;
    imageUrl: string;
  } | null>(null);

  /**
   * Mirrored during render so the settle guards and the reconciliation effect
   * always read the freshest session, never one from a stale closure.
   */
  const getActiveSessionIdRef = useRef(getActiveSessionId);
  getActiveSessionIdRef.current = getActiveSessionId;

  /**
   * The made-but-not-saved take, if the last admission's attachment failed
   * (ADR-0022 decision 6). The server returns `attachment.state === "failed"`
   * with 2xx: the picture is durable and paid for, only its session row is
   * owed. A ref mirrors it so `retryAttachment` reads the latest without
   * re-subscribing.
   */
  const [unattachedTake, setUnattachedTake] = useState<TakeAttachment | null>(
    null,
  );
  const unattachedTakeRef = useRef<TakeAttachment | null>(null);
  unattachedTakeRef.current = unattachedTake;

  /** Arm the frame and settle the attempt, per the attachment outcome. */
  const applySettledResponse = useCallback(
    (response: SettledUploadResponse, imageUrl: string): void => {
      // The second fact, read at last (ADR-0022 decision 6, issue #133): the
      // media is durable, but did the take reach its session? A `failed`
      // attachment is made-but-not-saved — keep the attempt so re-picking the
      // same file re-admits the SAME take, surface the take for a retry, and
      // do NOT arm an identity a clip could name for a node that is not there.
      const attachment = response.data.attachment ?? null;
      const madeButNotSaved = attachment?.state === "failed";
      if (madeButNotSaved) {
        setUnattachedTake(attachment);
      } else {
        // Settled — the take is in its session (or this was a reference
        // upload with no attachment fact). A fresh upload is a fresh attempt.
        attemptRef.current = null;
        setUnattachedTake(null);
      }

      setStartFrame({
        id: `start-frame-upload-${Date.now()}`,
        url: imageUrl,
        source: "upload",
        ...(response.data.storagePath
          ? { storagePath: response.data.storagePath }
          : {}),
        ...(response.data.assetId ? { assetId: response.data.assetId } : {}),
        ...(response.data.viewUrlExpiresAt
          ? { viewUrlExpiresAt: response.data.viewUrlExpiresAt }
          : {}),
        // The admitted take's identity — present only once the take is in
        // its session, which is exactly when a clip may name it as ancestor.
        ...(response.data.generationId
          ? { generationId: response.data.generationId }
          : {}),
      });
    },
    [setStartFrame],
  );

  /**
   * Reconciliation (issue #129): a response held because its creator was
   * elsewhere is applied the moment they are looking at the session it was
   * admitted into. The owner re-renders on navigation, so this runs at every
   * render and stays cheap while the stash is empty.
   */
  useEffect((): void => {
    const stashed = stashedResponseRef.current;
    if (!stashed) return;
    if (getActiveSessionIdRef.current() !== stashed.attempt.sessionId) return;
    stashedResponseRef.current = null;
    if (attemptRef.current !== stashed.attempt) return;
    applySettledResponse(stashed.response, stashed.imageUrl);
  });

  const uploadFirstFrame = useCallback(
    async (file: File): Promise<void> => {
      // The fingerprint first: a RETAINED attempt is recognised by it, and a
      // retained attempt reuses its own destination and key without resolving
      // a target anew — re-resolving would mint a words-version in whatever
      // session the creator is looking at now, which a retry must never do
      // (issue #129).
      const fingerprint = await fileFingerprint(file);
      const retained = attemptRef.current;
      let attempt: FirstFrameAdmissionAttempt;
      if (retained && retained.fileFingerprint === fingerprint) {
        attempt = retained;
      } else {
        const target = resolvePersistenceTarget();

        if (!target.sessionId || !target.promptVersionId) {
          try {
            const uploaded = await uploadOutsideSession(file);
            if (!uploaded) return;
            setStartFrame({
              id: `start-frame-upload-${Date.now()}`,
              url: uploaded.url,
              source: "upload",
              ...(uploaded.storagePath
                ? { storagePath: uploaded.storagePath }
                : {}),
              ...(uploaded.viewUrlExpiresAt
                ? { viewUrlExpiresAt: uploaded.viewUrlExpiresAt }
                : {}),
            });
          } catch (error) {
            onError(error instanceof Error ? error.message : "Upload failed");
          }
          return;
        }

        const validation = validatePreviewImageFile(file);
        if (!validation.valid) {
          onInvalidFile(validation.error);
          return;
        }

        attempt = {
          key: createAdmissionKey(),
          fileFingerprint: fingerprint,
          sessionId: target.sessionId,
          promptVersionId: target.promptVersionId,
        };
        // A new attempt owns the frame surface: anything an older attempt was
        // holding for a creator who wandered off is superseded, not applied.
        stashedResponseRef.current = null;
        attemptRef.current = attempt;
      }

      try {
        const response = await uploadPreviewImage(
          file,
          {},
          {
            source: "first-frame",
            admit: {
              sessionId: attempt.sessionId,
              promptVersionId: attempt.promptVersionId,
              admissionKey: attempt.key,
            },
          },
        );
        if (!response.success) {
          throw new Error(
            response.error || response.message || "Failed to upload image",
          );
        }

        const imageUrl = response.data.viewUrl || response.data.imageUrl;
        if (!imageUrl) throw new Error("Upload did not return an image URL");

        // Late-response discipline (issue #129), judged against the immutable
        // attempt: superseded (a newer upload, or the component replaced) and
        // off-session (the creator is looking at another session) responses
        // are never applied to what is on screen.
        if (attemptRef.current !== attempt) return;
        if (getActiveSessionIdRef.current() !== attempt.sessionId) {
          stashedResponseRef.current = { attempt, response, imageUrl };
          return;
        }

        applySettledResponse(response, imageUrl);
      } catch (error) {
        // The attempt is deliberately NOT cleared here: re-picking the same
        // file after a lost response re-admits the same take. A late failure
        // after a session switch is dropped without toasting into a session
        // the upload never belonged to.
        if (attemptRef.current !== attempt) return;
        if (getActiveSessionIdRef.current() !== attempt.sessionId) return;
        onError(error instanceof Error ? error.message : "Upload failed");
      }
    },
    [
      applySettledResponse,
      onError,
      onInvalidFile,
      resolvePersistenceTarget,
      setStartFrame,
      uploadOutsideSession,
    ],
  );

  /**
   * Re-attach the made-but-not-saved frame — the creator's side of ADR-0022
   * decision 6. It re-sends the SAME record under the SAME take identity to the
   * de-duplicating session append (never a re-upload, never a re-render). On
   * success the debt is settled and the attempt released; a failure — a
   * destination that was deleted, say — is surfaced truthfully and left
   * retryable. The destination rides the take's own record, so navigation
   * cannot retarget it.
   */
  const retryAttachment = useCallback(async (): Promise<void> => {
    const pending = unattachedTakeRef.current;
    if (!pending) return;
    try {
      await retryPictureAttachment(pending);
      setUnattachedTake(null);
      attemptRef.current = null;
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "Could not save this picture",
      );
    }
  }, [onError]);

  return { uploadFirstFrame, unattachedTake, retryAttachment };
}
