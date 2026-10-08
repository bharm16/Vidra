import { useCallback, useEffect, useRef, useState } from "react";
import {
  PendingReferenceSchema,
  admitPendingReference,
  type PendingReference,
} from "../../api/pendingReference";
import {
  createAdmissionKey,
  getMediaReferenceViewUrl,
  uploadPreviewImage,
  validatePreviewImageFile,
} from "@/features/preview/api/previewApi";
import type { KeyframeTile } from "@/features/generation-controls/types";
import type { PersistenceTarget } from "@/features/idea-box";
import type { TakeAttachment } from "@shared/schemas/attachment.schemas";

interface Params {
  creatorId: string | undefined;
  activeSessionId: string | null;
  resolvePersistenceTarget: () => PersistenceTarget;
  getActiveSessionId: () => string | null;
  hasAssociatedWords: () => boolean;
  waitForVersionPersistence: (
    sessionId: string,
    promptVersionId: string,
  ) => Promise<void>;
  setStartFrame: (tile: KeyframeTile) => void;
  onError: (message: string) => void;
}
export interface ReferenceSelectionGuard {
  /** The chosen file is still the latest selection in its original context. */
  isCurrent: () => boolean;
  /** A same-file retry may keep its destination after navigation, never account changes. */
  canRetryOriginal: () => boolean;
  finish: () => void;
}
interface PendingState {
  key: string;
  reference: PendingReference;
  url?: string;
}
export interface PendingFirstFrameView {
  url?: string;
  busy: boolean;
  attempted: boolean;
  attachmentFailed: boolean;
  uploading: boolean;
}

function storageKey(creatorId: string, sessionId: string | null): string {
  return `vidra:pending-reference:v1:${encodeURIComponent(creatorId)}:${sessionId ?? "draft"}`;
}
function readPending(key: string): PendingReference | null {
  try {
    const parsed = PendingReferenceSchema.safeParse(
      JSON.parse(localStorage.getItem(key) ?? "null"),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** A durable reference is input until the creator explicitly associates saved words. */
export function usePendingFirstFrame(params: Params): {
  pendingReference: PendingFirstFrameView | null;
  stageReference: (file: File, sessionId: string | null) => Promise<void>;
  isReferenceUploading: () => boolean;
  beginReferenceSelection: () => ReferenceSelectionGuard;
  admitReference: () => Promise<void>;
  clearReference: () => void;
  bindDraftToSession: () => boolean;
  unattachedTake: TakeAttachment | null;
} {
  const key = params.creatorId
    ? storageKey(params.creatorId, params.activeSessionId)
    : null;
  const latest = useRef({ ...params, key });
  latest.current = { ...params, key };
  const [state, setState] = useState<PendingState | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [busy, setBusy] = useState(false);
  const [unattachedTake, setUnattachedTake] = useState<TakeAttachment | null>(
    null,
  );
  const sequence = useRef(0);
  const memory = useRef(new Map<string, PendingState>());
  const uploads = useRef(new Map<string, number>());
  const activeUpload = useRef<{ key: string; operation: number } | null>(null);
  const selection = useRef<{
    key: string | null;
    creatorId: string | undefined;
    token: number;
  } | null>(null);
  const selectionCounter = useRef(0);
  const beginReferenceSelection = useCallback((): ReferenceSelectionGuard => {
    const chosen = {
      key: latest.current.key,
      creatorId: latest.current.creatorId,
      token: ++selectionCounter.current,
    };
    selection.current = chosen;
    setBusy(true);
    return {
      isCurrent: () =>
        selection.current === chosen && latest.current.key === chosen.key,
      canRetryOriginal: () =>
        selection.current === chosen &&
        latest.current.creatorId === chosen.creatorId,
      finish: (): void => {
        if (selection.current !== chosen) return;
        selection.current = null;
        if (
          latest.current.key === chosen.key &&
          activeUpload.current?.key !== chosen.key
        )
          setBusy(false);
      },
    };
  }, []);
  const isReferenceUploading = useCallback(
    (): boolean =>
      (activeUpload.current !== null &&
        activeUpload.current.key === latest.current.key) ||
      (selection.current !== null &&
        selection.current.key === latest.current.key),
    [],
  );

  const persist = useCallback((next: PendingState): void => {
    // Memory remains usable when storage is unavailable. Never lose the valid
    // reference just because quota/private-mode persistence fails.
    memory.current.set(next.key, next);
    stateRef.current = next;
    setState(next);
    try {
      localStorage.setItem(next.key, JSON.stringify(next.reference));
    } catch {
      latest.current.onError(
        "Reference uploaded. This browser could not save its recovery link; keep this page open.",
      );
    }
  }, []);

  useEffect(() => {
    const remembered = key ? memory.current.get(key) : null;
    const own = key ? readPending(key) : null;
    const next: PendingState | null =
      remembered ?? (own && key ? { key, reference: own } : null);
    stateRef.current = next;
    setState(next);
    setUnattachedTake(null);
    setBusy(false);
    sequence.current += 1;
    if (!next) return;
    void getMediaReferenceViewUrl(next.reference.storagePath, "image")
      .then((result) => {
        if (
          latest.current.key !== next.key ||
          stateRef.current !== next ||
          !result.success
        )
          return;
        persist({ ...next, url: result.data.viewUrl });
      })
      .catch(() => {
        if (latest.current.key === next.key)
          latest.current.onError(
            "Your reference is saved. Its preview could not load; you can still retry using it.",
          );
      });
  }, [key, persist]);

  const clearReference = useCallback((): void => {
    const ownKey = latest.current.key;
    if (!ownKey) return;
    selection.current = null;
    sequence.current += 1;
    uploads.current.delete(ownKey);
    if (activeUpload.current?.key === ownKey) activeUpload.current = null;
    memory.current.delete(ownKey);
    try {
      localStorage.removeItem(ownKey);
    } catch {
      latest.current.onError(
        "Reference cleared for this tab. Browser recovery could not be removed.",
      );
    }
    if (stateRef.current?.key === ownKey) {
      stateRef.current = null;
      setState(null);
    }
    setBusy(false);
  }, []);

  const stageReference = useCallback(
    async (file: File, sessionId: string | null): Promise<void> => {
      const owner = latest.current.creatorId;
      if (!owner) {
        latest.current.onError("Sign in to save a reference.");
        return;
      }
      const validation = validatePreviewImageFile(file);
      if (!validation.valid) {
        latest.current.onError(validation.error);
        return;
      }
      const destinationKey = storageKey(owner, sessionId);
      const operation = ++sequence.current;
      uploads.current.set(destinationKey, operation);
      activeUpload.current = { key: destinationKey, operation };
      setBusy(true);
      try {
        const response = await uploadPreviewImage(
          file,
          { expectedCreatorId: owner },
          { source: "pending-first-frame" },
        );
        if (!response.success)
          throw new Error(response.error || "Upload failed");
        if (!response.data.storagePath)
          throw new Error("Upload did not return a recovery link");
        const next: PendingState = {
          key: destinationKey,
          reference: { storagePath: response.data.storagePath, sessionId },
          url: response.data.viewUrl || response.data.imageUrl,
        };
        // Persist the original creator/destination even when navigation occurred
        // during the upload; never arm it or retarget it into the new context.
        if (uploads.current.get(destinationKey) !== operation) return;
        if (latest.current.key === destinationKey) {
          persist(next);
        } else {
          memory.current.set(next.key, next);
          try {
            localStorage.setItem(next.key, JSON.stringify(next.reference));
          } catch {
            if (latest.current.creatorId === owner)
              latest.current.onError(
                "Reference uploaded, but browser recovery is unavailable; keep this page open.",
              );
          }
        }
      } catch (error) {
        if (
          uploads.current.get(destinationKey) === operation &&
          latest.current.key === destinationKey
        )
          latest.current.onError(
            error instanceof Error ? error.message : "Upload failed",
          );
      } finally {
        if (activeUpload.current?.operation === operation) {
          activeUpload.current = null;
          if (latest.current.key === destinationKey) setBusy(false);
        }
      }
    },
    [persist],
  );

  // Only the ordinary expansion callback may carry an originating draft into
  // its newly persisted session. Navigation alone never performs this transfer.
  const bindDraftToSession = useCallback((): boolean => {
    const current = stateRef.current;
    const owner = latest.current.creatorId;
    const sessionId = latest.current.getActiveSessionId();
    if (!current || !owner) return false;
    if (current.reference.sessionId !== null)
      return current.reference.sessionId === sessionId;
    if (current.key !== storageKey(owner, null)) return false;
    if (!sessionId) return true; // keep valid input pending while words persistence is unresolved
    const next = {
      ...current,
      key: storageKey(owner, sessionId),
      reference: { ...current.reference, sessionId },
    };
    persist(next);
    memory.current.delete(current.key);
    try {
      localStorage.removeItem(current.key);
    } catch {
      /* recoverable source remains */
    }
    return true;
  }, [persist]);

  const admitReference = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    if (!current || current.key !== latest.current.key || busy) return;
    if (!current.reference.attempt && !latest.current.hasAssociatedWords()) {
      latest.current.onError(
        "Write and save associated words before using this reference.",
      );
      return;
    }
    const selectionRevision = selectionCounter.current;
    const target = {
      ...(current.reference.attempt ??
        latest.current.resolvePersistenceTarget()),
    };
    if (
      !target.sessionId ||
      !target.promptVersionId ||
      target.sessionId !== current.reference.sessionId
    ) {
      latest.current.onError(
        "Save words in this session first. Your reference is still pending.",
      );
      return;
    }
    setBusy(true);
    try {
      if (!current.reference.attempt) {
        await latest.current.waitForVersionPersistence(
          target.sessionId,
          target.promptVersionId,
        );
        if (
          selectionCounter.current !== selectionRevision ||
          latest.current.key !== current.key ||
          stateRef.current?.reference !== current.reference ||
          latest.current.getActiveSessionId() !== target.sessionId
        )
          return;
      }
      const reference = {
        ...current.reference,
        attempt: current.reference.attempt ?? {
          sessionId: target.sessionId,
          promptVersionId: target.promptVersionId,
          admissionKey: createAdmissionKey(),
        },
      };
      const attempt = { ...(stateRef.current ?? current), reference };
      persist(attempt);
      const response = await admitPendingReference({
        storagePath: reference.storagePath,
        sessionId: reference.sessionId,
        attempt: reference.attempt,
      });
      if (!response.success)
        throw new Error(response.error || "Could not use this reference");
      if (
        selectionCounter.current !== selectionRevision ||
        latest.current.key !== attempt.key ||
        stateRef.current !== attempt
      )
        return;
      const attachment = response.data.attachment;
      if (attachment?.state !== "attached") {
        setUnattachedTake(attachment ?? null);
        persist({
          ...attempt,
          reference: {
            ...reference,
            attachmentState:
              attachment?.state === "failed" ? "failed" : "pending",
          },
        });
        latest.current.onError(
          "Picture made, but not saved. Use this again to retry saving the same picture.",
        );
        return;
      }
      latest.current.setStartFrame({
        id: `start-frame-upload-${response.data.generationId}`,
        url: response.data.viewUrl || response.data.imageUrl,
        source: "upload",
        ...(response.data.storagePath
          ? { storagePath: response.data.storagePath }
          : {}),
        ...(response.data.assetId ? { assetId: response.data.assetId } : {}),
        ...(response.data.generationId
          ? { generationId: response.data.generationId }
          : {}),
      });
      try {
        localStorage.removeItem(attempt.key);
      } catch {
        /* replay remains safe */
      }
      memory.current.delete(attempt.key);
      stateRef.current = null;
      setState(null);
      setUnattachedTake(null);
    } catch (error) {
      if (latest.current.key === current.key)
        latest.current.onError(
          error instanceof Error
            ? error.message
            : "Could not use this reference",
        );
    } finally {
      if (latest.current.key === current.key) setBusy(false);
    }
  }, [busy, persist]);

  const uploading = isReferenceUploading();
  return {
    pendingReference: uploading
      ? {
          busy: true,
          attempted: false,
          attachmentFailed: false,
          uploading: true,
        }
      : state?.key === key
        ? {
            ...(state.url ? { url: state.url } : {}),
            busy,
            attempted: Boolean(state.reference.attempt),
            attachmentFailed: state.reference.attachmentState === "failed",
            uploading: false,
          }
        : null,
    stageReference,
    isReferenceUploading,
    beginReferenceSelection,
    admitReference,
    clearReference,
    bindDraftToSession,
    unattachedTake,
  };
}
