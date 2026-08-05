import { useEffect } from "react";
import { isMac } from "../shortcuts.config";
import { isEditableTarget } from "../editableTarget";

export interface KeyboardShortcutsCallbacks {
  openShortcuts?: () => void;
  openSettings?: () => void;
  createNew?: () => void;
  optimize?: () => void;
  improveFirst?: () => void;
  canCopy?: () => boolean;
  copy?: () => void;
  export?: () => void;
  toggleSidebar?: () => void;
  switchMode?: (index: number) => void;
  applySuggestion?: (index: number) => void;
  closeModal?: () => void;
}

/**
 * Custom hook for handling keyboard shortcuts.
 * Registers global keyboard event listeners for app-wide shortcuts.
 */
export function useKeyboardShortcuts(
  callbacks: KeyboardShortcutsCallbacks,
): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      const isMod = isMac ? e.metaKey : e.ctrlKey;

      // Cmd/Ctrl + K - Open shortcuts
      if (isMod && e.key === "k") {
        e.preventDefault();
        callbacks.openShortcuts?.();
      }

      // ? - Open shortcuts (discoverable convention). Skip when focus is in
      // an editable element so users can still type a literal `?` into the
      // prompt editor / inputs / textareas. Modifier guard: only the bare
      // `?` keystroke should fire — Cmd/Ctrl/Alt+? are reserved for future
      // bindings and must pass through. We check `metaKey` and `ctrlKey`
      // explicitly (rather than the platform-aware `isMod`) because the
      // intent is "no modifier at all," and a Mac user pressing `Ctrl+?`
      // (or a Linux user pressing `Cmd+?`) should still bypass this branch.
      if (
        e.key === "?" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isEditableTarget(e.target)
      ) {
        e.preventDefault();
        callbacks.openShortcuts?.();
      }

      // Cmd/Ctrl + , - Open settings
      if (isMod && e.key === ",") {
        e.preventDefault();
        callbacks.openSettings?.();
      }

      // Cmd/Ctrl + N - New prompt
      if (isMod && e.key === "n") {
        e.preventDefault();
        callbacks.createNew?.();
      }

      // Cmd/Ctrl + Enter - Optimize
      if (isMod && e.key === "Enter") {
        e.preventDefault();
        callbacks.optimize?.();
      }

      // Cmd/Ctrl + C - Copy (only in results view and only when no text is selected)
      if (isMod && e.key === "c" && callbacks.canCopy?.()) {
        const selection = window.getSelection();
        const selectedText = selection?.toString().trim();

        // Only intercept if there's no text selection
        if (!selectedText) {
          e.preventDefault();
          callbacks.copy?.();
        }
      }

      // Cmd/Ctrl + E - Export
      if (isMod && e.key === "e") {
        e.preventDefault();
        callbacks.export?.();
      }

      // Cmd/Ctrl + B - Toggle sidebar
      if (isMod && e.key === "b") {
        e.preventDefault();
        callbacks.toggleSidebar?.();
      }

      // Cmd/Ctrl + 1-5 - Switch modes
      if (isMod && ["1", "2", "3", "4", "5"].includes(e.key)) {
        e.preventDefault();
        const modeIndex = parseInt(e.key) - 1;
        callbacks.switchMode?.(modeIndex);
      }

      // Alt + 1-9 - Apply suggestions
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const suggestionIndex = parseInt(e.key) - 1;
        callbacks.applySuggestion?.(suggestionIndex);
      }

      // Escape - Close modals
      if (e.key === "Escape") {
        callbacks.closeModal?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [callbacks]);
}
