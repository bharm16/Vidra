import { useCallback, useEffect } from "react";
import type React from "react";
import { sanitizeText } from "@/features/span-highlighting";

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
  registerInsertHandler: (handler: ((text: string) => boolean) | null) => void;
  logAction: (name: string, data?: Record<string, unknown>) => void;
}

interface UseEditorInputReturn {
  handleInput: () => void;
}

export function useEditorInput({
  editorRef,
  editorDisplayText,
  showResults,
  onInputPromptChange,
  onDisplayedPromptChange,
  onResetResultsForEditing,
  registerInsertHandler,
  logAction,
}: UseEditorInputParams): UseEditorInputReturn {
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
  }, [
    logAction,
    editorDisplayText.length,
    editorRef,
    onInputPromptChange,
    onDisplayedPromptChange,
    onResetResultsForEditing,
    showResults,
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

  return {
    handleInput,
  };
}
