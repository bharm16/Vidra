/**
 * Text Selection Manager
 * Handles text selection and cursor position management in contentEditable elements
 */
import { logger } from "@/services/LoggingService";
import { sanitizeError } from "@/utils/logging";

const log = logger.child("textSelection");

export interface SelectionOffsets {
  start: number;
  end: number;
}

interface NodePosition {
  node: Node;
  offset: number;
}

/**
 * Gets the character offsets of a selection range within an element
 */
export const getSelectionOffsets = (
  editorElement: HTMLElement | null,
  range: Range | null,
): SelectionOffsets | null => {
  if (!editorElement || !range) {
    return null;
  }

  try {
    const preSelectionRange = range.cloneRange();
    preSelectionRange.selectNodeContents(editorElement);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);

    const start = preSelectionRange.toString().length;
    const end = start + range.toString().length;

    if (Number.isNaN(start) || Number.isNaN(end)) {
      return null;
    }

    return { start, end };
  } catch (error) {
    const errObj =
      error instanceof Error ? error : new Error(sanitizeError(error).message);
    log.error("Error computing selection offsets", errObj, {
      operation: "getSelectionOffsets",
    });
    return null;
  }
};

/**
 * Selects a Range object in the browser's selection
 */
export const selectRange = (range: Range | null): void => {
  if (!range) {
    return;
  }

  const getSelectionFn =
    typeof window !== "undefined" ? window.getSelection : null;
  if (typeof getSelectionFn !== "function") {
    return;
  }

  const selection = getSelectionFn.call(window);
  if (
    !selection ||
    typeof selection.removeAllRanges !== "function" ||
    typeof selection.addRange !== "function"
  ) {
    return;
  }

  try {
    selection.removeAllRanges();
    selection.addRange(range);
  } catch (error) {
    const errObj =
      error instanceof Error ? error : new Error(sanitizeError(error).message);
    log.error("Error selecting range", errObj, { operation: "selectRange" });
  }
};

/**
 * Restores a text selection in an element from character offsets
 */
export const restoreSelectionFromOffsets = (
  element: HTMLElement | null,
  startOffset: number | null | undefined,
  endOffset: number | null | undefined,
): void => {
  if (!element || startOffset == null || endOffset == null) {
    return;
  }

  const getSelectionFn =
    typeof window !== "undefined" ? window.getSelection : null;
  if (typeof getSelectionFn !== "function") {
    return;
  }

  const selection = getSelectionFn.call(window);
  if (
    !selection ||
    typeof selection.removeAllRanges !== "function" ||
    typeof selection.addRange !== "function"
  ) {
    return;
  }

  const normalizedStart = Math.max(0, startOffset);
  const normalizedEnd = Math.max(normalizedStart, endOffset);

  const findPosition = (offset: number): NodePosition | null => {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
    );

    let currentNode = walker.nextNode();
    let accumulated = 0;
    let lastNode: Node | null = null;

    while (currentNode) {
      const textLength = currentNode.textContent?.length ?? 0;
      if (offset <= accumulated + textLength) {
        return {
          node: currentNode,
          offset: Math.min(textLength, Math.max(0, offset - accumulated)),
        };
      }

      accumulated += textLength;
      lastNode = currentNode;
      currentNode = walker.nextNode();
    }

    if (lastNode) {
      return { node: lastNode, offset: lastNode.textContent?.length ?? 0 };
    }

    return { node: element, offset: element.childNodes.length };
  };

  const startPosition = findPosition(normalizedStart);
  const endPosition = findPosition(normalizedEnd);

  if (!startPosition?.node || !endPosition?.node) {
    return;
  }

  const range = document.createRange();

  try {
    range.setStart(startPosition.node, startPosition.offset);
    range.setEnd(endPosition.node, endPosition.offset);
  } catch (error) {
    const errObj =
      error instanceof Error ? error : new Error(sanitizeError(error).message);
    log.error("Error restoring selection offsets", errObj, {
      operation: "restoreSelectionFromOffsets",
    });
    return;
  }

  try {
    selection.removeAllRanges();
    selection.addRange(range);
  } catch (error) {
    const errObj =
      error instanceof Error ? error : new Error(sanitizeError(error).message);
    log.error("Error applying selection range", errObj, {
      operation: "restoreSelectionFromOffsets",
    });
  }
};
