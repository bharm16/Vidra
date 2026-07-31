import { useCallback, useEffect, useMemo, useRef } from "react";
import type { KeyframeTile } from "@features/generation-controls";
import type { PromptKeyframe } from "@features/prompt-optimizer/types/domain/prompt-session";
import type { PromptHistory } from "../../context/types";
import {
  areKeyframesEqual,
  hydrateKeyframes,
  serializeKeyframes,
  withStartFrameFirst,
} from "../../utils/keyframeTransforms";

type UsePromptKeyframesSyncParams = {
  keyframes: KeyframeTile[];
  /**
   * The armed start frame. Persisted as keyframes[0] (ADR-0011 D4): the
   * working frame must survive restore, and hydration re-arms it from the
   * head of the persisted array. Without this, an idea-box or uploaded
   * start frame was memory-only and "Make it" silently degraded to
   * text-to-video after a reload.
   */
  startFrame: KeyframeTile | null;
  setKeyframes: (tiles: KeyframeTile[] | null | undefined) => void;
  setStartFrame: (tile: KeyframeTile | null) => void;
  clearEndFrame: () => void;
  clearVideoReferences: () => void;
  clearExtendVideo: () => void;
  currentPromptUuid: string | null | undefined;
  currentPromptDocId: string | null | undefined;
  isLoadingHistory: boolean;
  promptHistory: Pick<PromptHistory, "history" | "updateEntryPersisted">;
};

export type UsePromptKeyframesSyncResult = {
  serializedKeyframes: PromptKeyframe[];
  onLoadKeyframes: (stored: PromptKeyframe[] | null | undefined) => void;
};

export function usePromptKeyframesSync({
  keyframes,
  startFrame,
  setKeyframes,
  setStartFrame,
  clearEndFrame,
  clearVideoReferences,
  clearExtendVideo,
  currentPromptUuid,
  currentPromptDocId,
  isLoadingHistory,
  promptHistory,
}: UsePromptKeyframesSyncParams): UsePromptKeyframesSyncResult {
  const { history, updateEntryPersisted } = promptHistory;
  // Both sync directions compare against the PERSISTED view — armed start
  // frame first — so a frame armed outside the keyframes array still writes,
  // and the entry mirroring back after that write is a no-op.
  const effectiveKeyframes = useMemo(
    () => withStartFrameFirst(startFrame, keyframes),
    [startFrame, keyframes],
  );
  const keyframesRef = useRef<KeyframeTile[]>(effectiveKeyframes);
  const keyframeSessionRef = useRef<{
    uuid: string | null;
    docId: string | null;
  }>({
    uuid: currentPromptUuid ?? null,
    docId: currentPromptDocId ?? null,
  });
  const localWritePendingRef = useRef(false);
  const historySyncPendingRef = useRef(false);
  const hasRemoteSession = useMemo(() => {
    const normalized = currentPromptDocId?.trim() ?? "";
    return normalized.length > 0 && !normalized.startsWith("draft-");
  }, [currentPromptDocId]);

  useEffect(() => {
    keyframesRef.current = effectiveKeyframes;
  }, [effectiveKeyframes]);

  useEffect(() => {
    if (localWritePendingRef.current) {
      localWritePendingRef.current = false;
      return;
    }

    if (isLoadingHistory && hasRemoteSession) {
      return;
    }

    if (!currentPromptUuid) {
      if (keyframesRef.current.length) {
        setKeyframes([]);
      }
      clearEndFrame();
      clearVideoReferences();
      clearExtendVideo();
      return;
    }
    const entry = history.find((item) => item.uuid === currentPromptUuid);
    if (!entry) {
      if (hasRemoteSession) {
        // Keep keyframes loaded from direct session fetch until history catches up.
        return;
      }
      if (keyframesRef.current.length) {
        setKeyframes([]);
      }
      clearEndFrame();
      clearVideoReferences();
      clearExtendVideo();
      return;
    }
    const normalizedCurrentDocId = currentPromptDocId?.trim() ?? "";
    const normalizedEntryDocId =
      typeof entry.id === "string" ? entry.id.trim() : "";
    if (
      hasRemoteSession &&
      normalizedCurrentDocId.length > 0 &&
      normalizedEntryDocId.length > 0 &&
      normalizedEntryDocId !== normalizedCurrentDocId
    ) {
      return;
    }
    const nextKeyframes = hydrateKeyframes(entry.keyframes ?? []);
    if (areKeyframesEqual(nextKeyframes, keyframesRef.current)) return;
    historySyncPendingRef.current = true;
    setKeyframes(nextKeyframes);
  }, [
    clearEndFrame,
    clearExtendVideo,
    clearVideoReferences,
    currentPromptUuid,
    history,
    hasRemoteSession,
    isLoadingHistory,
    currentPromptDocId,
    setKeyframes,
  ]);

  useEffect(() => {
    if (!currentPromptUuid) {
      keyframeSessionRef.current = { uuid: null, docId: null };
      return;
    }
    keyframeSessionRef.current = {
      uuid: currentPromptUuid,
      docId: currentPromptDocId ?? null,
    };
  }, [effectiveKeyframes, currentPromptUuid, currentPromptDocId]);

  useEffect(() => {
    const { uuid, docId } = keyframeSessionRef.current;
    if (!uuid) return;

    const normalizedDocId = docId?.trim() ?? "";
    const isRemoteDocId =
      normalizedDocId.length > 0 && !normalizedDocId.startsWith("draft-");
    if (isLoadingHistory && isRemoteDocId) {
      return;
    }

    const entry = history.find((item) => item.uuid === uuid);
    if (!entry) return;
    const normalizedEntryDocId =
      typeof entry.id === "string" ? entry.id.trim() : "";
    if (
      isRemoteDocId &&
      normalizedEntryDocId.length > 0 &&
      normalizedEntryDocId !== normalizedDocId
    ) {
      return;
    }
    if (historySyncPendingRef.current) {
      historySyncPendingRef.current = false;
      return;
    }
    const serialized = serializeKeyframes(effectiveKeyframes);
    if (areKeyframesEqual(serialized, entry.keyframes ?? [])) return;
    localWritePendingRef.current = true;
    updateEntryPersisted(uuid, docId, { keyframes: serialized });
  }, [effectiveKeyframes, history, isLoadingHistory, updateEntryPersisted]);

  const serializedKeyframes = useMemo(
    () => serializeKeyframes(effectiveKeyframes),
    [effectiveKeyframes],
  );

  const onLoadKeyframes = useCallback(
    (stored: PromptKeyframe[] | null | undefined) => {
      const hydrated = hydrateKeyframes(stored);
      setKeyframes(hydrated);
      setStartFrame(hydrated[0] ?? null);
      clearEndFrame();
      clearVideoReferences();
      clearExtendVideo();
    },
    [
      clearEndFrame,
      clearExtendVideo,
      clearVideoReferences,
      setKeyframes,
      setStartFrame,
    ],
  );

  return { serializedKeyframes, onLoadKeyframes };
}
