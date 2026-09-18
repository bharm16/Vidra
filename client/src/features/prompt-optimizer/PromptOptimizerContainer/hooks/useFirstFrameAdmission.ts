import { useCallback, useRef } from "react";
import {
  createAdmissionKey,
  uploadPreviewImage,
  validatePreviewImageFile,
} from "@/features/preview/api/previewApi";
import type { KeyframeTile } from "@/features/generation-controls/types";
import type { PersistenceTarget } from "@/features/idea-box";

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
 * Outside a session there is nothing to admit into, so the caller's plain
 * upload runs unchanged. Reference images never come through here at all.
 */
export interface UseFirstFrameAdmissionParams {
  /** Resolved once per upload: minting/reading the words-version at that moment. */
  resolvePersistenceTarget: () => PersistenceTarget;
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
}

export function useFirstFrameAdmission({
  resolvePersistenceTarget,
  setStartFrame,
  uploadOutsideSession,
  onError,
  onInvalidFile,
}: UseFirstFrameAdmissionParams): UseFirstFrameAdmissionResult {
  /**
   * One key per admission ATTEMPT, held across its retries and cleared only
   * when the attempt settles. A key minted per request would turn a retry into
   * a second take, which is the whole failure the key exists to prevent; a key
   * that never cleared would turn the creator's NEXT upload into a replay of
   * this one.
   */
  const admissionKeyRef = useRef<string | null>(null);

  const uploadFirstFrame = useCallback(
    async (file: File): Promise<void> => {
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

      admissionKeyRef.current ??= createAdmissionKey();
      const admissionKey = admissionKeyRef.current;

      try {
        const response = await uploadPreviewImage(
          file,
          {},
          {
            source: "first-frame",
            admit: {
              sessionId: target.sessionId,
              promptVersionId: target.promptVersionId,
              admissionKey,
            },
          },
        );
        if (!response.success) {
          throw new Error(
            response.error || response.message || "Failed to upload image",
          );
        }
        admissionKeyRef.current = null;

        const imageUrl = response.data.viewUrl || response.data.imageUrl;
        if (!imageUrl) throw new Error("Upload did not return an image URL");

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
      } catch (error) {
        // The key is deliberately NOT cleared here: re-picking the same file
        // after a lost response re-admits the same take.
        onError(error instanceof Error ? error.message : "Upload failed");
      }
    },
    [
      onError,
      onInvalidFile,
      resolvePersistenceTarget,
      setStartFrame,
      uploadOutsideSession,
    ],
  );

  return { uploadFirstFrame };
}
