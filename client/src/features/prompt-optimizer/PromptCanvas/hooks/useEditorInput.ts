import { useCallback, useEffect } from "react";
import type React from "react";
import { sanitizeText } from "@/features/span-highlighting";
import {
  getSelectionOffsets,
  restoreSelectionFromOffsets,
} from "@features/prompt-optimizer/utils/textSelection";

interface UseEditorInputParams {
  editorRef: React.RefObject<HTMLElement>;
  editorDisplayText: string;
  showResults: boolean;
  onInputPromptChange: (text: string) => void;
  /**
   * Results-mode edits flow HERE: the edited text becomes the displayed
   * prompt, so the labeling pipeline relabels it and highlights survive
   * typing. Without this handler the hook falls back to resetting the
   * results view (the legacy edit-invalidates-results model).
   */
  onDisplayedPromptChange?: ((text: string) => void) | undefined;
  onResetResultsForEditing?: (() => void) | undefined;
  handleAutocomplete: (
    text: string,
    cursorPosition: number,
    editor: HTMLElement,
    caretRect: DOMRect | null,
  ) => void;
  handleAutocompleteKeyDown: (
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => unknown;
  closeAutocomplete: () => void;
  validateTriggers: (text: string) => void;
  registerInsertHandler: (handler: ((text: string) => boolean) | null) => void;
  logAction: (name: string, data?: Record<string, unknown>) => void;
}

interface UseEditorInputReturn {
  handleInput: () => void;
  handleEditorKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  insertTrigger: (asset: { trigger: string }) => void;
}

export function useEditorInput({
  editorRef,
  editorDisplayText,
  showResults,
  onInputPromptChange,
  onDisplayedPromptChange,
  onResetResultsForEditing,
  handleAutocomplete,
  handleAutocompleteKeyDown,
  closeAutocomplete,
  validateTriggers,
  registerInsertHandler,
  logAction,
}: UseEditorInputParams): UseEditorInputReturn {
  const resolveCaretContext = useCallback(
    (
      normalizedText: string,
    ): { cursorPosition: number; caretRect: DOMRect | null } => {
      const selection = window.getSelection();
      let cursorPosition = normalizedText.length;
      let caretRect: DOMRect | null = null;

      if (!selection || selection.rangeCount === 0) {
        return { cursorPosition, caretRect };
      }

      const range = selection.getRangeAt(0);
      const offsets = getSelectionOffsets(editorRef.current, range);
      if (offsets) {
        cursorPosition = offsets.end;
      }

      const rect = range.getBoundingClientRect();
      if (rect && rect.width + rect.height > 0) {
        caretRect = rect;
      } else {
        const rects = range.getClientRects();
        const firstRect = rects[0];
        if (firstRect) {
          caretRect = firstRect;
        }
      }

      return { cursorPosition, caretRect };
    },
    [editorRef],
  );

  const syncEditorToPromptState = useCallback((): void => {
    const editor = editorRef.current;
    if (!editor) return;

    const newText = editor.innerText || editor.textContent || "";
    const normalizedText = sanitizeText(newText);

    logAction("textEdit", {
      newLength: normalizedText.length,
      oldLength: editorDisplayText.length,
    });

    onInputPromptChange(normalizedText);
    if (showResults) {
      if (onDisplayedPromptChange) {
        // Editing the result IS the workflow: keep the results view alive
        // and let the labeling pipeline relabel the edited text. Highlights
        // clear for the stale text (signature gate) and return after the
        // debounce — they no longer die until the next generation.
        onDisplayedPromptChange(normalizedText);
      } else {
        onResetResultsForEditing?.();
      }
    }

    const { cursorPosition, caretRect } = resolveCaretContext(normalizedText);
    handleAutocomplete(normalizedText, cursorPosition, editor, caretRect);
    validateTriggers(normalizedText);
  }, [
    logAction,
    editorDisplayText.length,
    editorRef,
    handleAutocomplete,
    onInputPromptChange,
    onDisplayedPromptChange,
    onResetResultsForEditing,
    resolveCaretContext,
    showResults,
    validateTriggers,
  ]);

  const handleInput = useCallback((): void => {
    syncEditorToPromptState();
  }, [syncEditorToPromptState]);

  const insertAtCanvasCaret = useCallback(
    (text: string): boolean => {
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (!editor || !selection || selection.rangeCount === 0) {
        return false;
      }

      const range = selection.getRangeAt(0);
      if (!editor.contains(range.commonAncestorContainer)) {
        return false;
      }

      range.deleteContents();
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);

      syncEditorToPromptState();
      return true;
    },
    [editorRef, syncEditorToPromptState],
  );

  useEffect(() => {
    registerInsertHandler(insertAtCanvasCaret);
    return () => registerInsertHandler(null);
  }, [insertAtCanvasCaret, registerInsertHandler]);

  const insertTrigger = useCallback(
    (asset: { trigger: string }) => {
      const editor = editorRef.current;
      const text =
        editor?.innerText || editor?.textContent || editorDisplayText;
      const selection = window.getSelection();
      if (!editor || !selection || selection.rangeCount === 0) {
        return;
      }

      const range = selection.getRangeAt(0);
      const offsets = getSelectionOffsets(editor, range);
      const cursorPos = offsets?.end ?? text.length;
      const beforeCursor = text.slice(0, cursorPos);
      const triggerStart = beforeCursor.lastIndexOf("@");
      if (triggerStart === -1) {
        return;
      }

      const newText =
        text.slice(0, triggerStart) + asset.trigger + text.slice(cursorPos);
      editor.textContent = newText;

      const newCursorPos = triggerStart + asset.trigger.length;
      setTimeout(() => {
        restoreSelectionFromOffsets(editor, newCursorPos, newCursorPos);
        editor.focus();
        syncEditorToPromptState();
      }, 0);

      closeAutocomplete();
    },
    [closeAutocomplete, editorDisplayText, editorRef, syncEditorToPromptState],
  );

  const handleEditorKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const result = handleAutocompleteKeyDown(event);
      if (result && typeof result === "object" && "selected" in result) {
        insertTrigger((result as { selected: { trigger: string } }).selected);
        return;
      }
      if (result === true) {
        return;
      }
    },
    [handleAutocompleteKeyDown, insertTrigger],
  );

  return {
    handleInput,
    handleEditorKeyDown,
    insertTrigger,
  };
}
