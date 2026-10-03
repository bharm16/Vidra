import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchUnresolvedSketchAcceptances,
  retryPictureAttachment,
} from "@/features/generations/api/takeAttachment";
import type { TakeAttachment } from "@shared/schemas/attachment.schemas";
import { readSavedSketchTake } from "@/features/generations/api/sessionGenerations";
import type { Generation } from "@/features/generations/types";
import { getAuthRepository } from "@repositories/index";

interface Params {
  creatorId: string | undefined;
  sessionId: string | null;
  onAttached: (take: Generation, promptVersionId: string) => void;
  onError: (message: string) => void;
}
interface RecoveryState {
  scope: string;
  browserUrl: string;
  navigationKey: string | undefined;
  attachments: TakeAttachment[];
}

function currentNavigationKey(): string | undefined {
  const state: unknown = window.history.state;
  if (!state || typeof state !== "object" || !("key" in state))
    return undefined;
  return typeof state.key === "string" ? state.key : undefined;
}

/** Discover owed session takes without restoring or arming a working frame. */
export function useUnresolvedSketchAcceptances(params: Params): {
  unattachedTake: TakeAttachment | null;
  retryAttachment: () => Promise<void>;
} {
  const scope = JSON.stringify([params.creatorId, params.sessionId]);
  const browserUrl = window.location.href;
  const navigationKey = currentNavigationKey();
  const latest = useRef({ ...params, scope });
  latest.current = { ...params, scope };
  const [state, setState] = useState<RecoveryState | null>(null);
  const retrying = useRef(false);
  const revision = useRef(0);
  const stillCurrent = useCallback(
    (
      requestRevision: number,
      requestScope: string,
      creatorId: string,
      sourceUrl: string,
      sourceKey: string | undefined,
    ): boolean =>
      revision.current === requestRevision &&
      latest.current.scope === requestScope &&
      getAuthRepository().getCurrentUser()?.uid === creatorId &&
      window.location.href === sourceUrl &&
      currentNavigationKey() === sourceKey,
    [],
  );

  useEffect(() => {
    const requestRevision = ++revision.current;
    setState(null);
    if (!params.creatorId || !params.sessionId) return;
    const creatorId = params.creatorId;
    const destination = params.sessionId;
    const ownsRequest = (): boolean =>
      stillCurrent(
        requestRevision,
        scope,
        creatorId,
        browserUrl,
        navigationKey,
      );
    if (!ownsRequest()) return;
    void fetchUnresolvedSketchAcceptances(destination)
      .then((attachments) => {
        if (!ownsRequest()) return;
        setState({
          scope,
          browserUrl,
          navigationKey,
          attachments: attachments.filter(
            (attachment) =>
              attachment.sessionId === destination &&
              attachment.state !== "attached" &&
              attachment.record?.id === attachment.generationId &&
              attachment.record.origin === "sketchpad",
          ),
        });
      })
      .catch((error: unknown) => {
        if (ownsRequest())
          latest.current.onError(
            error instanceof Error
              ? error.message
              : "Could not load unsaved pictures",
          );
      });
    return () => {
      revision.current += 1;
    };
  }, [
    params.creatorId,
    params.sessionId,
    scope,
    browserUrl,
    navigationKey,
    stillCurrent,
  ]);

  const unattachedTake =
    state?.scope === scope &&
    state.browserUrl === browserUrl &&
    state.navigationKey === navigationKey &&
    getAuthRepository().getCurrentUser()?.uid === params.creatorId
      ? (state.attachments[0] ?? null)
      : null;
  const retryAttachment = useCallback(async (): Promise<void> => {
    if (!unattachedTake || latest.current.scope !== scope || retrying.current)
      return;
    const requestRevision = revision.current;
    const creatorId = latest.current.creatorId;
    if (!creatorId || !state) return;
    const ownsRequest = (): boolean =>
      stillCurrent(
        requestRevision,
        scope,
        creatorId,
        state.browserUrl,
        state.navigationKey,
      );
    if (!ownsRequest()) return;
    retrying.current = true;
    try {
      await retryPictureAttachment(unattachedTake);
      if (!ownsRequest()) return;
      const take = await readSavedSketchTake(
        creatorId,
        unattachedTake.sessionId,
        unattachedTake.promptVersionId,
        unattachedTake.generationId,
      );
      if (!ownsRequest()) return;
      latest.current.onAttached(take, unattachedTake.promptVersionId);
      if (!ownsRequest()) return;
      setState((current) =>
        ownsRequest() && current?.scope === scope
          ? {
              ...current,
              attachments: current.attachments.filter(
                (attachment) =>
                  attachment.generationId !== unattachedTake.generationId,
              ),
            }
          : current,
      );
    } catch (error) {
      if (ownsRequest())
        latest.current.onError(
          error instanceof Error
            ? error.message
            : "Could not save this picture",
        );
    } finally {
      retrying.current = false;
    }
  }, [unattachedTake, scope, state, stillCurrent]);
  return { unattachedTake, retryAttachment };
}
