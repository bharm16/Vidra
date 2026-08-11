/**
 * useHistoryPersistence - Persistence + promotion logic for prompt history
 *
 * Handles repository writes, draft promotion, and persistence-related toasts.
 */

import { useCallback, useEffect, useRef } from "react";
import debounce from "lodash/debounce";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../../../services/LoggingService";
import {
  loadFromFirestore,
  loadFromLocalStorage,
  syncToLocalStorage,
  saveEntry,
  updateHighlights,
  updateOutput,
  updateVersions,
  updatePrompt,
  deleteEntry,
  clearAll,
} from "../api";
import type {
  User,
  PromptHistoryEntry,
  PromptVersionEntry,
  Toast,
  SaveResult,
  CreateDraftParams,
} from "../types";
import {
  enforceImmutableKeyframes,
  enforceImmutableVersions,
} from "../utils/immutableMedia";
import type { UpdatePromptOptions } from "../../../repositories/promptRepositoryTypes";

interface UseHistoryPersistenceOptions {
  user: User | null;
  history: PromptHistoryEntry[];
  isLoadingHistory: boolean;
  setHistory: (history: PromptHistoryEntry[]) => void;
  addEntry: (entry: PromptHistoryEntry) => void;
  updateEntry: (uuid: string, updates: Partial<PromptHistoryEntry>) => void;
  removeEntry: (entryId: string) => void;
  clearEntries: () => void;
  setIsLoadingHistory: (loading: boolean) => void;
  toast: Toast;
}

interface UseHistoryPersistenceReturn {
  loadHistoryFromFirestore: (userId: string) => Promise<void>;
  loadHistoryFromLocalStorage: () => Promise<void>;
  saveToHistory: (
    input: string,
    output: string,
    score: number | null,
    selectedMode: string,
    targetModel?: string | null,
    generationParams?: Record<string, unknown> | null,
    keyframes?: PromptHistoryEntry["keyframes"],
    brainstormContext?: Record<string, unknown> | null,
    highlightCache?: Record<string, unknown> | null,
    existingUuid?: string | null,
    title?: string | null,
  ) => Promise<SaveResult | null>;
  createDraft: (params: CreateDraftParams) => SaveResult;
  updateEntryLocal: (
    uuid: string,
    updates: Partial<PromptHistoryEntry>,
  ) => void;
  updateEntryPersisted: (
    uuid: string,
    docId: string | null,
    updates: UpdatePromptOptions,
  ) => void;
  updateEntryHighlight: (
    uuid: string,
    highlightCache: Record<string, unknown> | null,
  ) => void;
  updateEntryOutput: (
    uuid: string,
    docId: string | null,
    output: string,
  ) => Promise<void>;
  updateEntryVersions: (
    uuid: string,
    docId: string | null,
    versions: PromptVersionEntry[],
  ) => void;
  clearHistory: () => Promise<void>;
  deleteFromHistory: (entryId: string) => Promise<void>;
}

const log = logger.child("useHistoryPersistence");
const MAX_HISTORY_ENTRIES = 100;

const normalizeIdentifier = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const isDraftEntryId = (value: unknown): boolean => {
  const normalized = normalizeIdentifier(value);
  return normalized !== null && normalized.startsWith("draft-");
};

const hasNonEmptyText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const sortByTimestampDesc = (
  entries: PromptHistoryEntry[],
): PromptHistoryEntry[] =>
  [...entries].sort((left, right) => {
    const leftTimestamp = Date.parse(left.timestamp ?? "");
    const rightTimestamp = Date.parse(right.timestamp ?? "");
    const safeLeft = Number.isFinite(leftTimestamp) ? leftTimestamp : 0;
    const safeRight = Number.isFinite(rightTimestamp) ? rightTimestamp : 0;
    return safeRight - safeLeft;
  });

const mergeRemoteWithLocalDraft = (
  remote: PromptHistoryEntry,
  local: PromptHistoryEntry,
): PromptHistoryEntry => ({
  ...remote,
  ...(hasNonEmptyText(remote.input) ? {} : { input: local.input }),
  ...((remote.generationParams ?? null)
    ? {}
    : { generationParams: local.generationParams ?? null }),
  ...((remote.keyframes ?? null) ? {} : { keyframes: local.keyframes ?? null }),
  ...((remote.highlightCache ?? null)
    ? {}
    : { highlightCache: local.highlightCache ?? null }),
  ...((remote.brainstormContext ?? null)
    ? {}
    : { brainstormContext: local.brainstormContext ?? null }),
  ...(Array.isArray(remote.versions) && remote.versions.length > 0
    ? {}
    : { versions: Array.isArray(local.versions) ? local.versions : [] }),
});

const upsertEntry = (
  entries: PromptHistoryEntry[],
  nextEntry: PromptHistoryEntry,
): PromptHistoryEntry[] => {
  const nextUuid = normalizeIdentifier(nextEntry.uuid);
  const nextId = normalizeIdentifier(nextEntry.id);

  const filtered = entries.filter((entry) => {
    const entryUuid = normalizeIdentifier(entry.uuid);
    const entryId = normalizeIdentifier(entry.id);
    const sameUuid =
      nextUuid !== null && entryUuid !== null && nextUuid === entryUuid;
    const sameId = nextId !== null && entryId !== null && nextId === entryId;
    return !sameUuid && !sameId;
  });

  return sortByTimestampDesc([nextEntry, ...filtered]).slice(
    0,
    MAX_HISTORY_ENTRIES,
  );
};

const mergeRemoteHistoryWithLocalDrafts = (
  remoteEntries: PromptHistoryEntry[],
  localEntries: PromptHistoryEntry[],
): PromptHistoryEntry[] => {
  const merged = [...remoteEntries];

  for (const localEntry of localEntries) {
    const localUuid = normalizeIdentifier(localEntry.uuid);
    const localId = normalizeIdentifier(localEntry.id);
    const uuidMatchIndex =
      localUuid === null
        ? -1
        : merged.findIndex(
            (entry) => normalizeIdentifier(entry.uuid) === localUuid,
          );

    if (uuidMatchIndex >= 0) {
      merged[uuidMatchIndex] = mergeRemoteWithLocalDraft(
        merged[uuidMatchIndex]!,
        localEntry,
      );
      continue;
    }

    const idMatchIndex =
      localId === null
        ? -1
        : merged.findIndex(
            (entry) => normalizeIdentifier(entry.id) === localId,
          );

    if (idMatchIndex >= 0) {
      merged[idMatchIndex] = mergeRemoteWithLocalDraft(
        merged[idMatchIndex]!,
        localEntry,
      );
      continue;
    }

    if (isDraftEntryId(localEntry.id)) {
      merged.push(localEntry);
    }
  }

  return sortByTimestampDesc(merged).slice(0, MAX_HISTORY_ENTRIES);
};

export function useHistoryPersistence({
  user,
  history,
  isLoadingHistory,
  setHistory,
  addEntry,
  updateEntry,
  removeEntry,
  clearEntries,
  setIsLoadingHistory,
  toast,
}: UseHistoryPersistenceOptions): UseHistoryPersistenceReturn {
  // Bug 1/2 fix: ref for fresh history in async callbacks
  const historyRef = useRef(history);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  // Bug 18 fix: ref for isLoadingHistory so debounced callbacks read the latest value.
  // While history is loading from Firestore, Firestore writes are suppressed to prevent
  // stale localStorage data from overwriting good Firestore data.
  const isLoadingHistoryRef = useRef(isLoadingHistory);
  useEffect(() => {
    isLoadingHistoryRef.current = isLoadingHistory;
  }, [isLoadingHistory]);

  // Bug 18 safeguard: monotonic flag that becomes true after the first successful load.
  // This is a belt-and-suspenders guard - even if isLoadingHistory gets set incorrectly,
  // we never write to Firestore until we've loaded data at least once.
  const initialLoadCompleteRef = useRef(false);

  // Bug 17 fix: debounce Firestore version writes to prevent concurrent writes
  // from clobbering each other. Local state (updateEntry) is always immediate;
  // only the Firestore write is debounced so the last data always wins.
  const versionWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pendingVersionWriteRef = useRef<{
    uuid: string;
    docId: string | null;
    versions: PromptVersionEntry[];
  } | null>(null);
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const syncHistoryToLocalStorage = useCallback(
    (entries: PromptHistoryEntry[]): void => {
      const syncResult = syncToLocalStorage(entries);
      if (syncResult.trimmed) {
        log.warn(
          "Storage limit reached while persisting local history snapshot",
        );
      } else if (!syncResult.success) {
        log.warn("Failed to persist local history snapshot");
      }
    },
    [],
  );

  // Debounced full snapshot: only flushes after 5 seconds of inactivity.
  // Individual entry updates happen immediately via updateEntry/addEntry;
  // the full localStorage snapshot is deferred to reduce write frequency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSyncHistoryToLocalStorage = useCallback(
    debounce((entries: PromptHistoryEntry[]): void => {
      syncHistoryToLocalStorage(entries);
    }, 5_000),
    [syncHistoryToLocalStorage],
  );

  // Flush debounced snapshot on unmount to prevent data loss.
  useEffect(() => {
    return () => {
      debouncedSyncHistoryToLocalStorage.flush();
    };
  }, [debouncedSyncHistoryToLocalStorage]);

  const persistLocalDraftEntry = useCallback(
    (entry: PromptHistoryEntry): void => {
      const existedBefore = historyRef.current.some(
        (item) => item.uuid === entry.uuid,
      );
      const nextHistory = upsertEntry(historyRef.current, entry);
      historyRef.current = nextHistory;
      // Incremental: update in-memory state immediately
      if (existedBefore && typeof entry.uuid === "string") {
        updateEntry(entry.uuid, entry);
      } else {
        addEntry(entry);
      }
      // Full snapshot: deferred to reduce localStorage write frequency
      debouncedSyncHistoryToLocalStorage(nextHistory);
    },
    [addEntry, debouncedSyncHistoryToLocalStorage, updateEntry],
  );

  // Flush any pending debounced version write on unmount
  useEffect(() => {
    return () => {
      if (versionWriteTimerRef.current !== null) {
        clearTimeout(versionWriteTimerRef.current);
        versionWriteTimerRef.current = null;
        const pending = pendingVersionWriteRef.current;
        if (pending) {
          pendingVersionWriteRef.current = null;
          // Bug 18 fix: don't flush stale data on unmount while loading
          if (isLoadingHistoryRef.current || !initialLoadCompleteRef.current) {
            log.debug("Skipping unmount flush — history not ready", {
              uuid: pending.uuid,
              versionCount: pending.versions.length,
              isLoading: isLoadingHistoryRef.current,
              initialLoadComplete: initialLoadCompleteRef.current,
            });
            return;
          }
          log.debug("Flushing debounced version write on unmount", {
            uuid: pending.uuid,
            versionCount: pending.versions.length,
          });
          updateVersions(
            userRef.current?.uid,
            pending.uuid,
            pending.docId,
            pending.versions,
          );
        }
      }
    };
  }, []);

  const loadHistoryFromFirestore = useCallback(
    async (userId: string) => {
      setIsLoadingHistory(true);

      try {
        const [entries, localEntries] = await Promise.all([
          loadFromFirestore(userId),
          loadFromLocalStorage().catch(() => [] as PromptHistoryEntry[]),
        ]);
        const mergedEntries = mergeRemoteHistoryWithLocalDrafts(
          entries,
          localEntries,
        );
        historyRef.current = mergedEntries;
        setHistory(mergedEntries);
        // Bug 18 safeguard: mark initial load as complete so writes are allowed
        initialLoadCompleteRef.current = true;

        const syncResult = syncToLocalStorage(mergedEntries);
        if (syncResult.trimmed) {
          toast.warning("Storage limit reached. Keeping only recent 50 items.");
        } else if (!syncResult.success) {
          toast.error("Browser storage full. Please clear browser data.");
        }
      } catch (error) {
        // Repo layer already logged this error with full context (historyRepository).
        // Falling back silently to localStorage to avoid duplicate error noise.
        void error;

        try {
          const localEntries = await loadFromLocalStorage();
          setHistory(localEntries);
          // Even on fallback, mark load complete so writes can proceed
          initialLoadCompleteRef.current = true;
        } catch (localError) {
          log.error(
            "Error loading from localStorage fallback",
            localError as Error,
          );
        }
      } finally {
        setIsLoadingHistory(false);
      }
    },
    [setHistory, setIsLoadingHistory, toast],
  );

  const loadHistoryFromLocalStorage = useCallback(async () => {
    try {
      const entries = await loadFromLocalStorage();
      setHistory(entries);
      // Mark load complete for non-authenticated users
      initialLoadCompleteRef.current = true;
    } catch (error) {
      // Repo layer already logged with full context — suppress duplicate.
      void error;
    }
  }, [setHistory]);

  const saveToHistory = useCallback(
    async (
      input: string,
      output: string,
      score: number | null,
      selectedMode: string,
      targetModel: string | null = null,
      generationParams: Record<string, unknown> | null = null,
      keyframes: PromptHistoryEntry["keyframes"] = null,
      brainstormContext: Record<string, unknown> | null = null,
      highlightCache: Record<string, unknown> | null = null,
      existingUuid: string | null = null,
      title: string | null = null,
    ): Promise<SaveResult | null> => {
      const normalizedTargetModel =
        typeof targetModel === "string" && targetModel.trim()
          ? targetModel.trim()
          : null;

      log.debug("Saving to history", {
        mode: selectedMode,
        targetModel: normalizedTargetModel,
        hasUser: !!user,
        inputLength: input.length,
      });

      try {
        const result = await saveEntry(user?.uid, {
          ...(existingUuid ? { uuid: existingUuid } : {}),
          ...(title !== null ? { title } : {}),
          input,
          output,
          score,
          mode: selectedMode,
          ...(normalizedTargetModel
            ? { targetModel: normalizedTargetModel }
            : {}),
          ...(generationParams ? { generationParams } : {}),
          ...(keyframes ? { keyframes } : {}),
          brainstormContext,
          highlightCache,
        });

        const newEntry: PromptHistoryEntry = {
          id: result.id,
          uuid: result.uuid,
          timestamp: new Date().toISOString(),
          title,
          input,
          output,
          score,
          mode: selectedMode,
          ...(normalizedTargetModel
            ? { targetModel: normalizedTargetModel }
            : {}),
          generationParams: generationParams ?? null,
          keyframes: keyframes ?? null,
          brainstormContext: brainstormContext ?? null,
          highlightCache: highlightCache ?? null,
        };

        // Bug 1 fix: read latest history from ref to avoid stale closure
        if (
          existingUuid &&
          historyRef.current.some((entry) => entry.uuid === existingUuid)
        ) {
          updateEntry(existingUuid, newEntry);
        } else {
          addEntry(newEntry);
        }
        return result;
      } catch (error) {
        // Repo layer already logged with full context — surface user-facing
        // toast here without duplicating the log line.
        void error;
        toast.error(
          user ? "Failed to save to cloud" : "Failed to save to history",
        );
        return null;
      }
    },
    [user, toast, addEntry, updateEntry],
  );

  const createDraft = useCallback(
    (params: CreateDraftParams): SaveResult => {
      const uuid =
        typeof params.uuid === "string" && params.uuid.trim()
          ? params.uuid.trim()
          : uuidv4();
      const id =
        typeof params.id === "string" && params.id.trim()
          ? params.id.trim()
          : `draft-${Date.now()}`;

      const entry: PromptHistoryEntry = {
        id,
        uuid,
        timestamp: new Date().toISOString(),
        title: params.title ?? null,
        input: params.input ?? "",
        output: params.output ?? "",
        score: null,
        mode: params.mode,
        targetModel: params.targetModel ?? null,
        generationParams: params.generationParams ?? null,
        keyframes: params.keyframes ?? null,
        brainstormContext: params.brainstormContext ?? null,
        highlightCache: params.highlightCache ?? null,
        versions: Array.isArray(params.versions) ? params.versions : [],
      };

      historyRef.current = upsertEntry(historyRef.current, entry);
      addEntry(entry);
      if (params.persist) {
        syncHistoryToLocalStorage(historyRef.current);
      }
      return { uuid, id };
    },
    [addEntry, syncHistoryToLocalStorage],
  );

  const updateEntryLocal = useCallback(
    (uuid: string, updates: Partial<PromptHistoryEntry>) => {
      updateEntry(uuid, updates);
    },
    [updateEntry],
  );

  // Bug 3 fix: add .catch() to fire-and-forget persistence calls
  const updateEntryPersisted = useCallback(
    (uuid: string, docId: string | null, updates: UpdatePromptOptions) => {
      const entry = historyRef.current.find((item) => item.uuid === uuid);
      let effectiveUpdates = updates;
      if (updates.keyframes !== undefined) {
        const mergedKeyframes = enforceImmutableKeyframes(
          entry?.keyframes ?? null,
          updates.keyframes ?? null,
        );
        if (mergedKeyframes.warnings.length) {
          log.warn("Preserved immutable keyframe references during persist", {
            uuid,
            docId,
            warningCount: mergedKeyframes.warnings.length,
          });
        }
        effectiveUpdates = {
          ...updates,
          keyframes: mergedKeyframes.keyframes ?? null,
        };
      }

      const localUpdates: Partial<PromptHistoryEntry> = {};
      if (effectiveUpdates.input !== undefined)
        localUpdates.input = effectiveUpdates.input;
      if (effectiveUpdates.title !== undefined)
        localUpdates.title = effectiveUpdates.title;
      if (effectiveUpdates.mode !== undefined)
        localUpdates.mode = effectiveUpdates.mode;
      if (effectiveUpdates.targetModel !== undefined)
        localUpdates.targetModel = effectiveUpdates.targetModel;
      if (effectiveUpdates.generationParams !== undefined)
        localUpdates.generationParams = effectiveUpdates.generationParams;
      if (effectiveUpdates.keyframes !== undefined)
        localUpdates.keyframes = effectiveUpdates.keyframes;

      const isDraftId = typeof docId === "string" && docId.startsWith("draft-");
      if (isDraftId) {
        const nextEntry: PromptHistoryEntry = {
          ...(entry ?? {
            id: docId,
            uuid,
            timestamp: new Date().toISOString(),
            title: null,
            input: "",
            output: "",
            score: null,
            mode: "video",
            targetModel: null,
            generationParams: null,
            keyframes: null,
            brainstormContext: null,
            highlightCache: null,
            versions: [],
          }),
          id: docId,
          ...localUpdates,
        };
        persistLocalDraftEntry(nextEntry);
        return;
      }

      updatePrompt(user?.uid, uuid, docId, effectiveUpdates)?.catch?.(
        (error: unknown) => {
          log.warn("Failed to persist prompt update", {
            error: error instanceof Error ? error.message : String(error),
            uuid,
            docId,
          });
        },
      );

      updateEntry(uuid, localUpdates);
    },
    [persistLocalDraftEntry, updateEntry, user?.uid],
  );

  const updateEntryHighlight = useCallback(
    (uuid: string, highlightCache: Record<string, unknown> | null) => {
      const entry = historyRef.current.find((item) => item.uuid === uuid);
      const docId = entry?.id ?? null;
      if (isDraftEntryId(docId)) {
        persistLocalDraftEntry({
          ...(entry ?? {
            id: docId ?? `draft-${Date.now()}`,
            uuid,
            timestamp: new Date().toISOString(),
            title: null,
            input: "",
            output: "",
            score: null,
            mode: "video",
            targetModel: null,
            generationParams: null,
            keyframes: null,
            brainstormContext: null,
            highlightCache: null,
            versions: [],
          }),
          id: docId ?? `draft-${Date.now()}`,
          highlightCache: highlightCache ?? null,
        });
        return;
      }
      updateHighlights(user?.uid, uuid, docId, highlightCache)?.catch?.(
        (error: unknown) => {
          log.warn("Failed to persist highlight update", {
            error: error instanceof Error ? error.message : String(error),
            uuid,
            docId,
          });
        },
      );
      updateEntry(uuid, { highlightCache: highlightCache ?? null });
    },
    [persistLocalDraftEntry, updateEntry, user?.uid],
  );

  const updateEntryOutput = useCallback(
    async (
      uuid: string,
      docId: string | null,
      output: string,
    ): Promise<void> => {
      if (isDraftEntryId(docId)) {
        const entry = historyRef.current.find((item) => item.uuid === uuid);
        persistLocalDraftEntry({
          ...(entry ?? {
            id: docId ?? `draft-${Date.now()}`,
            uuid,
            timestamp: new Date().toISOString(),
            title: null,
            input: "",
            output: "",
            score: null,
            mode: "video",
            targetModel: null,
            generationParams: null,
            keyframes: null,
            brainstormContext: null,
            highlightCache: null,
            versions: [],
          }),
          id: docId ?? `draft-${Date.now()}`,
          output,
        });
        return;
      }

      updateEntry(uuid, { output });
      await updateOutput(user?.uid, uuid, docId, output);
    },
    [persistLocalDraftEntry, updateEntry, user?.uid],
  );

  const updateEntryVersions = useCallback(
    (uuid: string, docId: string | null, versions: PromptVersionEntry[]) => {
      const entry = historyRef.current.find((item) => item.uuid === uuid);
      const enforced = enforceImmutableVersions(entry ?? null, versions);
      if (enforced.warnings.length) {
        log.warn(
          "Preserved immutable media references during version persist",
          {
            uuid,
            docId,
            warningCount: enforced.warnings.length,
          },
        );
      }
      const nextVersions = enforced.versions;
      const generationCount = nextVersions.reduce(
        (sum, v) =>
          sum + (Array.isArray(v.generations) ? v.generations.length : 0),
        0,
      );
      log.debug("updateEntryVersions called", {
        uuid,
        docId,
        versionCount: nextVersions.length,
        generationCount,
      });

      if (isDraftEntryId(docId)) {
        const draftEntry = {
          ...(entry ?? {
            id: docId ?? `draft-${Date.now()}`,
            uuid,
            timestamp: new Date().toISOString(),
            title: null,
            input: "",
            output: "",
            score: null,
            mode: "video",
            targetModel: null,
            generationParams: null,
            keyframes: null,
            brainstormContext: null,
            highlightCache: null,
            versions: [],
          }),
          id: docId ?? `draft-${Date.now()}`,
          versions: nextVersions,
        };
        persistLocalDraftEntry(draftEntry);

        // Promote draft to Firestore when a generation completes so the
        // session survives re-login in a new browser context.
        const hasCompletedGeneration = nextVersions.some((v) =>
          v.generations?.some((g) => g.status === "completed"),
        );
        const userId = userRef.current?.uid;
        if (userId && hasCompletedGeneration) {
          void (async () => {
            try {
              const result = await saveEntry(userId, {
                uuid,
                input: draftEntry.input ?? "",
                output: draftEntry.output ?? "",
                score: draftEntry.score ?? null,
                mode: draftEntry.mode ?? "video",
                ...(draftEntry.targetModel
                  ? { targetModel: draftEntry.targetModel }
                  : {}),
                ...(draftEntry.generationParams
                  ? { generationParams: draftEntry.generationParams }
                  : {}),
                ...(draftEntry.keyframes
                  ? { keyframes: draftEntry.keyframes }
                  : {}),
                brainstormContext: draftEntry.brainstormContext ?? null,
                highlightCache: draftEntry.highlightCache ?? null,
                versions: nextVersions,
              });
              // Replace local draft ID with Firestore doc ID so future writes
              // go to Firestore instead of localStorage.
              updateEntry(uuid, { id: result.id });
              log.info(
                "Draft promoted to Firestore after generation completed",
                {
                  uuid,
                  oldDocId: docId,
                  newDocId: result.id,
                },
              );
            } catch (promoteError) {
              log.warn("Failed to promote draft to Firestore", {
                uuid,
                error:
                  promoteError instanceof Error
                    ? promoteError.message
                    : String(promoteError),
              });
            }
          })();
        }
        return;
      }

      updateEntry(uuid, { versions: nextVersions });

      // Bug 17 fix: debounce the Firestore write. Rapid successive calls
      // (e.g., SET_GENERATIONS → UPDATE_GENERATION → media refresh) each trigger
      // syncVersionGenerations → persistVersions → updateEntryVersions. Without
      // debouncing, multiple concurrent Firestore writes race each other and an
      // earlier write with stale data can land after a later write with complete data.
      // By debouncing, only the latest (most complete) data is written.
      if (versionWriteTimerRef.current !== null) {
        clearTimeout(versionWriteTimerRef.current);
      }
      pendingVersionWriteRef.current = { uuid, docId, versions: nextVersions };
      versionWriteTimerRef.current = setTimeout(() => {
        versionWriteTimerRef.current = null;
        const pending = pendingVersionWriteRef.current;
        if (pending) {
          // Bug 18 fix: while Firestore history is still loading, skip the write.
          // On mount, highlights/generations sync may trigger persistVersions with
          // stale localStorage data. Writing this to Firestore would overwrite the
          // real data. Once loadFromFirestore completes and calls setHistory(),
          // isLoadingHistory becomes false and normal writes resume.
          //
          // Belt-and-suspenders: also check initialLoadCompleteRef. Even if
          // isLoadingHistory gets set incorrectly, we never write before first load.
          if (isLoadingHistoryRef.current || !initialLoadCompleteRef.current) {
            log.debug("Version write skipped — history not ready", {
              uuid: pending.uuid,
              isLoading: isLoadingHistoryRef.current,
              initialLoadComplete: initialLoadCompleteRef.current,
            });
            pendingVersionWriteRef.current = null;
            return;
          }
          pendingVersionWriteRef.current = null;
          const debouncedGenerationCount = pending.versions.reduce(
            (sum, v) =>
              sum + (Array.isArray(v.generations) ? v.generations.length : 0),
            0,
          );
          log.debug("Debounced version write executing", {
            uuid: pending.uuid,
            versionCount: pending.versions.length,
            generationCount: debouncedGenerationCount,
          });
          updateVersions(
            userRef.current?.uid,
            pending.uuid,
            pending.docId,
            pending.versions,
          );
        }
      }, 500);
    },
    [persistLocalDraftEntry, updateEntry],
  );

  // Bug 5 fix: removed history.length from deps (only used for debug log)
  const clearHistory = useCallback(async () => {
    log.debug("Clearing history", {
      hasUser: !!user,
      currentCount: historyRef.current.length,
    });

    await clearAll(user?.uid);
    clearEntries();
    toast.success("History cleared");
  }, [user, toast, clearEntries]);

  const deleteFromHistory = useCallback(
    async (entryId: string) => {
      log.debug("Deleting from history", { entryId, hasUser: !!user });

      removeEntry(entryId);

      try {
        await deleteEntry(user?.uid, entryId);
        toast.success("Prompt deleted");
      } catch (error) {
        log.error("Error deleting prompt", error as Error, {
          entryId,
          userId: user?.uid,
        });

        if (user) {
          await loadHistoryFromFirestore(user.uid);
        } else {
          await loadHistoryFromLocalStorage();
        }

        toast.error("Failed to delete prompt");
      }
    },
    [
      user,
      toast,
      removeEntry,
      loadHistoryFromFirestore,
      loadHistoryFromLocalStorage,
    ],
  );

  return {
    loadHistoryFromFirestore,
    loadHistoryFromLocalStorage,
    saveToHistory,
    createDraft,
    updateEntryLocal,
    updateEntryPersisted,
    updateEntryHighlight,
    updateEntryOutput,
    updateEntryVersions,
    clearHistory,
    deleteFromHistory,
  };
}
