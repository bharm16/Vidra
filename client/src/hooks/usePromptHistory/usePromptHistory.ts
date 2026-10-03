/**
 * usePromptHistory - Orchestrator Hook
 *
 * Coordinates prompt history workflow by delegating to:
 * - useHistoryState: State management
 * - useHistoryPersistence: Persistence + promotions
 *
 * Single Responsibility: Orchestrate the prompt history workflow
 */

import { useEffect, useMemo } from "react";
import { useToast } from "../../components/Toast";
import { useHistoryState, useHistoryPersistence } from "./hooks";
import type { User, Toast } from "./types";

export const usePromptHistory = (user: User | null) => {
  const toast = useToast() as Toast;
  const {
    state,
    setHistory,
    addEntry,
    updateEntry,
    removeEntry,
    clearEntries,
    setIsLoadingHistory,
    searchQuery,
    setSearchQuery,
    filteredHistory,
  } = useHistoryState();

  const {
    loadHistoryFromFirestore,
    loadHistoryFromLocalStorage,
    saveToHistory,
    createDraft,
    updateEntryLocal,
    updateEntryPersisted,
    updateEntryHighlight,
    updateEntryOutput,
    updateEntryVersions,
    flushVersionWrites,
    clearHistory,
    deleteFromHistory,
  } = useHistoryPersistence({
    user,
    history: state.history,
    isLoadingHistory: state.isLoadingHistory,
    setHistory,
    addEntry,
    updateEntry,
    removeEntry,
    clearEntries,
    setIsLoadingHistory,
    toast,
  });

  // Load history on mount and when user changes
  // Bug 4 fix: guard against stale async responses when user changes rapidly
  useEffect(() => {
    let isActive = true;

    if (user) {
      // Bug 18 fix: set loading=true immediately so the debounced version-write guard
      // in useHistoryPersistence sees isLoadingHistory=true before the 150ms debounce
      // fires. Without this, syncVersionHighlights (which runs on mount) would
      // persist stale localStorage data to Firestore before loadFromFirestore returns.
      setIsLoadingHistory(true);

      const timerId = window.setTimeout(() => {
        if (isActive) {
          void loadHistoryFromFirestore(user.uid);
        }
      }, 500);
      return () => {
        isActive = false;
        window.clearTimeout(timerId);
      };
    } else {
      void loadHistoryFromLocalStorage();
      return () => {
        isActive = false;
      };
    }
  }, [
    user,
    loadHistoryFromFirestore,
    loadHistoryFromLocalStorage,
    setIsLoadingHistory,
  ]);

  return useMemo(
    () => ({
      history: state.history,
      filteredHistory,
      isLoadingHistory: state.isLoadingHistory,
      searchQuery,
      setSearchQuery,
      saveToHistory,
      createDraft,
      updateEntryLocal,
      updateEntryPersisted,
      clearHistory,
      deleteFromHistory,
      loadHistoryFromFirestore,
      updateEntryHighlight,
      updateEntryOutput,
      updateEntryVersions,
      flushVersionWrites,
    }),
    [
      state.history,
      filteredHistory,
      state.isLoadingHistory,
      searchQuery,
      setSearchQuery,
      saveToHistory,
      createDraft,
      updateEntryLocal,
      updateEntryPersisted,
      clearHistory,
      deleteFromHistory,
      loadHistoryFromFirestore,
      updateEntryHighlight,
      updateEntryOutput,
      updateEntryVersions,
      flushVersionWrites,
    ],
  );
};
