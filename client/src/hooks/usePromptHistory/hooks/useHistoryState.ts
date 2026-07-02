/**
 * useHistoryState - State Management Hook
 *
 * Manages local state for prompt history:
 * - History entries array
 * - Loading state
 * - Search query and filtering
 */

import { useState, useMemo, useCallback } from "react";
import type { PromptHistoryEntry, HistoryState } from "../types";
import { isBlankLocalDraft } from "../utils/blankLocalDraft";

export interface UseHistoryStateReturn {
  state: HistoryState;
  setHistory: (history: PromptHistoryEntry[]) => void;
  addEntry: (entry: PromptHistoryEntry) => void;
  updateEntry: (uuid: string, updates: Partial<PromptHistoryEntry>) => void;
  removeEntry: (entryId: string) => void;
  clearEntries: () => void;
  setIsLoadingHistory: (loading: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredHistory: PromptHistoryEntry[];
}

const MAX_HISTORY_ENTRIES = 100;

const normalizeIdentifier = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const dedupeEntries = (entries: PromptHistoryEntry[]): PromptHistoryEntry[] => {
  const seenIds = new Set<string>();
  const seenUuids = new Set<string>();
  const result: PromptHistoryEntry[] = [];

  for (const entry of entries) {
    const uuid = normalizeIdentifier(entry.uuid);
    const id = normalizeIdentifier(entry.id);

    if ((uuid && seenUuids.has(uuid)) || (id && seenIds.has(id))) {
      continue;
    }

    if (uuid) {
      seenUuids.add(uuid);
    }
    if (id) {
      seenIds.add(id);
    }

    result.push(entry);
  }

  return result;
};

/**
 * Hook for managing history state
 */
export function useHistoryState(): UseHistoryStateReturn {
  const [history, setHistoryInternal] = useState<PromptHistoryEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const setSearchQueryWithLog = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const setHistory = useCallback((newHistory: PromptHistoryEntry[]) => {
    const deduped = dedupeEntries(newHistory);
    setHistoryInternal(deduped.slice(0, MAX_HISTORY_ENTRIES));
  }, []);

  const addEntry = useCallback((entry: PromptHistoryEntry) => {
    setHistoryInternal((prev) => {
      const filtered = prev.filter((existing) => {
        const sameUuid =
          normalizeIdentifier(entry.uuid) !== null &&
          normalizeIdentifier(existing.uuid) !== null &&
          normalizeIdentifier(entry.uuid) ===
            normalizeIdentifier(existing.uuid);
        const sameId =
          normalizeIdentifier(entry.id) !== null &&
          normalizeIdentifier(existing.id) !== null &&
          normalizeIdentifier(entry.id) === normalizeIdentifier(existing.id);
        return !sameUuid && !sameId;
      });
      return dedupeEntries([entry, ...filtered]).slice(0, MAX_HISTORY_ENTRIES);
    });
  }, []);

  const updateEntry = useCallback(
    (uuid: string, updates: Partial<PromptHistoryEntry>) => {
      setHistoryInternal((prev) =>
        prev.map((entry) =>
          entry.uuid === uuid ? { ...entry, ...updates } : entry,
        ),
      );
    },
    [],
  );

  const removeEntry = useCallback((entryId: string) => {
    setHistoryInternal((prev) => prev.filter((entry) => entry.id !== entryId));
  }, []);

  const clearEntries = useCallback(() => {
    setHistoryInternal([]);
  }, []);

  // Memoized visible history: blank local drafts are hidden until they hold
  // creator content, then the remainder is filtered by the search query.
  const filteredHistory = useMemo(() => {
    const visibleHistory = history.filter((entry) => !isBlankLocalDraft(entry));
    if (!searchQuery) return visibleHistory;
    const query = searchQuery.toLowerCase();
    return visibleHistory.filter(
      (entry) =>
        entry.input.toLowerCase().includes(query) ||
        (entry.title && entry.title.toLowerCase().includes(query)),
    );
  }, [history, searchQuery]);

  // Bug 6 fix: memoize state object to prevent unnecessary re-renders
  const state = useMemo<HistoryState>(
    () => ({ history, isLoadingHistory, searchQuery }),
    [history, isLoadingHistory, searchQuery],
  );

  return {
    state,
    setHistory,
    addEntry,
    updateEntry,
    removeEntry,
    clearEntries,
    setIsLoadingHistory,
    searchQuery,
    setSearchQuery: setSearchQueryWithLog,
    filteredHistory,
  };
}
