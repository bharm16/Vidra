import { useCallback, useEffect, useRef } from "react";
import { getAuthRepository } from "@repositories/index";
import type { PromptHistoryEntry } from "@features/prompt-optimizer/types/domain/prompt-session";
import { readOwnedSessionGeneration } from "../api/sessionGenerations";

type SavedGeneration = { sessionId: string; generationId: string };
interface HydrationOptions {
  creatorId: string | undefined;
  sessionId: string | null;
  history: PromptHistoryEntry[];
  updateEntryLocal: (
    uuid: string,
    updates: Partial<PromptHistoryEntry>,
  ) => void;
  onError: (error: unknown) => void;
}

/** Hydrate one authoritative take without restoring words, settings or a frame. */
export function useServerGenerationHydration(
  options: HydrationOptions,
): (info: SavedGeneration) => void {
  const current = useRef(options);
  current.current = options;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return (): void => {
      mounted.current = false;
    };
  }, []);

  return useCallback((info: SavedGeneration): void => {
    const scope = current.current;
    if (!scope.creatorId || info.sessionId !== scope.sessionId) return;
    const creatorId = scope.creatorId;
    const sourceUrl = window.location.href;
    const stillCurrent = (): boolean =>
      mounted.current &&
      current.current.creatorId === creatorId &&
      current.current.sessionId === info.sessionId &&
      getAuthRepository().getCurrentUser()?.uid === creatorId &&
      window.location.href === sourceUrl;
    if (!stillCurrent()) return;

    const hydrate = async (): Promise<void> => {
      try {
        const saved = await readOwnedSessionGeneration(
          creatorId,
          info.sessionId,
          info.generationId,
        );
        if (!stillCurrent()) return;
        const entry = current.current.history.find(
          (item) => item.id === info.sessionId || item.uuid === info.sessionId,
        );
        if (
          !entry?.uuid ||
          !entry.versions?.some(
            (version) => version.versionId === saved.promptVersionId,
          )
        )
          return;
        current.current.updateEntryLocal(entry.uuid, {
          versions: entry.versions.map((version) =>
            version.versionId === saved.promptVersionId
              ? {
                  ...version,
                  generations: [
                    ...(version.generations ?? []).filter(
                      (take) => take.id !== saved.generation.id,
                    ),
                    saved.generation,
                  ],
                }
              : version,
          ),
        });
      } catch (error) {
        if (stillCurrent()) current.current.onError(error);
      }
    };
    void hydrate();
  }, []);
}
