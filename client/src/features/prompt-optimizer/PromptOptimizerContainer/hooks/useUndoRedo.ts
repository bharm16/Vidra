import { useCallback, useEffect, useRef, useState } from "react";
import { PERFORMANCE_CONFIG } from "@config/performance.config";
import type {
  HighlightSnapshot,
  StateSnapshot,
} from "@features/prompt-optimizer/context/types";

interface PromptOptimizer {
  displayedPrompt: string;
  setDisplayedPrompt: (prompt: string) => void;
  setOptimizedPrompt: (prompt: string) => void;
  setPreviewPrompt?: (prompt: string | null) => void;
  setPreviewAspectRatio?: (ratio: string | null) => void;
}

type ChangeType = "adding" | "deleting" | null;

export interface UseUndoRedoParams {
  promptOptimizer: PromptOptimizer;
  setDisplayedPromptSilently: (prompt: string) => void;
  applyInitialHighlightSnapshot: (
    highlight: HighlightSnapshot | null,
    options: { bumpVersion: boolean; markPersisted: boolean },
  ) => void;
  onEdit?: (payload: {
    previousText: string;
    nextText: string;
    timestamp: number;
  }) => void;
  undoStackRef: React.MutableRefObject<StateSnapshot[]>;
  redoStackRef: React.MutableRefObject<StateSnapshot[]>;
  latestHighlightRef: React.MutableRefObject<HighlightSnapshot | null>;
  isApplyingHistoryRef: React.MutableRefObject<boolean>;
  setCanUndo: (canUndo: boolean) => void;
  setCanRedo: (canRedo: boolean) => void;
}

export interface UseUndoRedoReturn {
  handleUndo: () => void;
  handleRedo: () => void;
  handleDisplayedPromptChange: (
    newText: string,
    cursorPosition?: number | null,
  ) => void;
}

/**
 * Custom hook for undo/redo functionality with smart edit grouping.
 * LOGIC OVERVIEW:
 * - Undo Stack: Always holds the state *prior* to the current view.
 * - Redo Stack: Holds 'future' states after an undo.
 * - Edit Grouping: Prevents every character from creating a history entry.
 *   Instead, we group bursts of typing into single entries.
 */
export function useUndoRedo({
  promptOptimizer,
  setDisplayedPromptSilently,
  applyInitialHighlightSnapshot,
  onEdit,
  undoStackRef,
  redoStackRef,
  latestHighlightRef,
  isApplyingHistoryRef,
  setCanUndo,
  setCanRedo,
}: UseUndoRedoParams): UseUndoRedoReturn {
  const promptOptimizerRef = useRef(promptOptimizer);
  promptOptimizerRef.current = promptOptimizer;
  // Track setTimeout IDs for cleanup
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const redoTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Edit grouping state
  const lastEditTimeRef = useRef(0);
  const lastCursorPositionRef = useRef<number | null>(null);
  const pendingChangeRef = useRef<ChangeType>(null);

  // Version tracking for future UI features
  const [versionCounter, setVersionCounter] = useState(0);

  // Smart edit grouping thresholds
  const EDIT_GROUP_TIME_MS = 400; // 300-500ms is the sweet spot for "thought grouping"
  const SIGNIFICANT_CHANGE_THRESHOLD = 20; // Characters added/removed

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
      if (redoTimeoutRef.current) clearTimeout(redoTimeoutRef.current);
    };
  }, []);

  /**
   * Helper to sync ref stacks with React state
   */
  const updateUIState = useCallback((): void => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, [setCanUndo, setCanRedo, undoStackRef, redoStackRef]);

  /**
   * Create a snapshot of current state with metadata
   */
  const createSnapshot = useCallback(
    (
      text: string | null = null,
      highlight: HighlightSnapshot | null = null,
    ): StateSnapshot => ({
      text: text ?? promptOptimizerRef.current.displayedPrompt,
      highlight: highlight ?? latestHighlightRef.current,
      timestamp: Date.now(),
      version: versionCounter,
    }),
    [latestHighlightRef, versionCounter],
  );

  /**
   * Determines if a new undo point should be created
   */
  const shouldCreateUndoPoint = useCallback(
    (
      currentText: string,
      newText: string,
      cursorPosition: number | null,
    ): boolean => {
      const now = Date.now();
      const timeSinceLastEdit = now - lastEditTimeRef.current;
      const textLengthDiff = Math.abs(newText.length - currentText.length);

      // Always create undo point if stack is empty
      if (undoStackRef.current.length === 0) return true;

      // 1. Time-based grouping (User paused thinking)
      if (timeSinceLastEdit > EDIT_GROUP_TIME_MS) return true;

      // 2. Large change detection (Paste or Bulk Delete)
      if (textLengthDiff > SIGNIFICANT_CHANGE_THRESHOLD) return true;

      // 3. Direction change (Switching from typing to backspacing creates a new group)
      // This allows users to undo their typos without undoing the whole sentence
      if (
        pendingChangeRef.current === "adding" &&
        currentText.length > newText.length
      )
        return true;
      if (
        pendingChangeRef.current === "deleting" &&
        currentText.length < newText.length
      )
        return true;

      // 4. Cursor jump detection (if cursor position is provided)
      // If cursor info is available and moved significantly
      const lastCursor = lastCursorPositionRef.current;
      if (lastCursor !== null && cursorPosition !== null) {
        const distance = Math.abs(cursorPosition - lastCursor);
        // If distance is > 1 (and not just the char we typed), they moved the cursor
        if (distance > textLengthDiff + 1) return true;
      }

      return false;
    },
    [undoStackRef],
  );

  /**
   * Push state to undo stack with duplicate prevention
   */
  const pushToUndoStack = useCallback(
    (snapshot: StateSnapshot): void => {
      // Safety: Don't push if it's identical to the last state
      // This prevents "no-op" undo steps
      const lastUndo = undoStackRef.current[undoStackRef.current.length - 1];
      if (lastUndo && lastUndo.text === snapshot.text) {
        return;
      }

      undoStackRef.current.push(snapshot);

      // Enforce stack limit
      if (undoStackRef.current.length > PERFORMANCE_CONFIG.UNDO_STACK_SIZE) {
        undoStackRef.current.shift();
      }
    },
    [undoStackRef],
  );

  /**
   * Handle undo operation
   */
  const handleUndo = useCallback((): void => {
    if (!undoStackRef.current.length) return;

    const previous = undoStackRef.current.pop();
    if (!previous) return;

    // Save CURRENT state to redo stack before reverting
    const currentSnapshot = createSnapshot();
    redoStackRef.current.push(currentSnapshot);

    if (redoStackRef.current.length > PERFORMANCE_CONFIG.UNDO_STACK_SIZE) {
      redoStackRef.current.shift();
    }

    // Apply the previous state
    isApplyingHistoryRef.current = true;
    setDisplayedPromptSilently(previous.text);
    promptOptimizerRef.current.setOptimizedPrompt(previous.text);
    applyInitialHighlightSnapshot(previous.highlight ?? null, {
      bumpVersion: true,
      markPersisted: false,
    });

    // Update version and UI
    setVersionCounter(previous.version || 0);
    updateUIState();

    // Reset applying flag
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    undoTimeoutRef.current = setTimeout(() => {
      isApplyingHistoryRef.current = false;
      undoTimeoutRef.current = null;
    }, PERFORMANCE_CONFIG.REF_RESET_DELAY_MS || 100);
  }, [
    createSnapshot,
    applyInitialHighlightSnapshot,
    setDisplayedPromptSilently,
    undoStackRef,
    redoStackRef,
    isApplyingHistoryRef,
    updateUIState,
  ]);

  /**
   * Handle redo operation
   */
  const handleRedo = useCallback((): void => {
    if (!redoStackRef.current.length) return;

    const next = redoStackRef.current.pop();
    if (!next) return;

    // Save CURRENT state to undo stack before advancing
    pushToUndoStack(createSnapshot());

    // Apply the next state
    isApplyingHistoryRef.current = true;
    setDisplayedPromptSilently(next.text);
    promptOptimizerRef.current.setOptimizedPrompt(next.text);
    applyInitialHighlightSnapshot(next.highlight ?? null, {
      bumpVersion: true,
      markPersisted: false,
    });

    setVersionCounter(next.version || versionCounter + 1);
    updateUIState();

    if (redoTimeoutRef.current) clearTimeout(redoTimeoutRef.current);
    redoTimeoutRef.current = setTimeout(() => {
      isApplyingHistoryRef.current = false;
      redoTimeoutRef.current = null;
    }, PERFORMANCE_CONFIG.REF_RESET_DELAY_MS || 100);
  }, [
    createSnapshot,
    pushToUndoStack,
    applyInitialHighlightSnapshot,
    setDisplayedPromptSilently,
    redoStackRef,
    isApplyingHistoryRef,
    updateUIState,
    versionCounter,
  ]);

  /**
   * Handle displayed prompt changes
   */
  const handleDisplayedPromptChange = useCallback(
    (newText: string, cursorPosition: number | null = null): void => {
      const currentText = promptOptimizerRef.current.displayedPrompt;

      // Skip if applying from history
      if (isApplyingHistoryRef.current) {
        promptOptimizerRef.current.setDisplayedPrompt(newText);
        return;
      }

      // Skip if text unchanged
      if (currentText === newText) return;

      // Clear preview prompt once the user edits the output
      promptOptimizerRef.current.setPreviewPrompt?.(null);
      promptOptimizerRef.current.setPreviewAspectRatio?.(null);

      // Detect type of change for grouping logic
      const changeType: ChangeType =
        newText.length > currentText.length ? "adding" : "deleting";

      // DECISION: Do we start a new undo group?
      const shouldCreate = shouldCreateUndoPoint(
        currentText,
        newText,
        cursorPosition,
      );
      if (shouldCreate) {
        // IMPORTANT: Save the state *BEFORE* the change (currentText)
        pushToUndoStack(createSnapshot(currentText));

        // Clear redo stack on new divergence
        redoStackRef.current = [];
        setCanRedo(false);

        // Increment version for this new editing session
        setVersionCounter((v) => v + 1);

        onEdit?.({
          previousText: currentText,
          nextText: newText,
          timestamp: Date.now(),
        });
      }

      // Update tracking refs
      lastEditTimeRef.current = Date.now();
      lastCursorPositionRef.current = cursorPosition;
      pendingChangeRef.current = changeType;

      // Apply the change
      promptOptimizerRef.current.setDisplayedPrompt(newText);
      updateUIState();
    },
    [
      onEdit,
      isApplyingHistoryRef,
      shouldCreateUndoPoint,
      pushToUndoStack,
      createSnapshot,
      redoStackRef,
      setCanRedo,
      updateUIState,
    ],
  );

  return {
    handleUndo,
    handleRedo,
    handleDisplayedPromptChange,
  };
}
