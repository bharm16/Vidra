import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";

import type { PromptCanvasState } from "../types";
import { HIGHLIGHT_SELECTOR } from "@features/span-highlighting/config/spanSelectors";

export interface UseSpanSelectionEffectsOptions {
  editorRef: RefObject<HTMLElement>;
  enableMLHighlighting: boolean;
  selectedSpanId: string | null;
  displayedPrompt: string | null;
  setState: (payload: Partial<PromptCanvasState>) => void;
}

export function useSpanSelectionEffects({
  editorRef,
  enableMLHighlighting,
  selectedSpanId,
  displayedPrompt,
  setState,
}: UseSpanSelectionEffectsOptions): void {
  const prevPromptRef = useRef<string | null>(null);
  const swapTimeoutRef = useRef<number | null>(null);
  const setStateRef = useRef(setState);
  setStateRef.current = setState;

  const clearSwapTimeout = useCallback((): void => {
    if (swapTimeoutRef.current) {
      window.clearTimeout(swapTimeoutRef.current);
      swapTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (
      selectedSpanId &&
      prevPromptRef.current !== null &&
      prevPromptRef.current !== displayedPrompt
    ) {
      setStateRef.current({ lastSwapTime: Date.now() });
      clearSwapTimeout();
      swapTimeoutRef.current = window.setTimeout(() => {
        setStateRef.current({ lastSwapTime: null });
        swapTimeoutRef.current = null;
      }, 3000);
    }
  }, [selectedSpanId, displayedPrompt, clearSwapTimeout]);

  useEffect(() => {
    if (!editorRef.current || !enableMLHighlighting) return;

    const editor = editorRef.current;
    const allHighlights = editor.querySelectorAll(HIGHLIGHT_SELECTOR);
    const selectedClasses = [
      "border-2",
      "ring-4",
      "ring-[var(--highlight-ring)]",
      "z-10",
    ];
    const dimmedClasses = ["opacity-40"];
    const swappedClasses = ["ps-animate-span-swap"];

    const promptChanged =
      prevPromptRef.current !== null &&
      prevPromptRef.current !== displayedPrompt &&
      selectedSpanId !== null;

    allHighlights.forEach((highlight) => {
      const element = highlight as HTMLElement;
      const spanId = element.dataset?.spanId;

      if (selectedSpanId && spanId === selectedSpanId) {
        element.classList.add(...selectedClasses);
        element.classList.remove(...dimmedClasses);
        element.dataset.open = "true";

        if (promptChanged) {
          element.classList.add(...swappedClasses);
          setTimeout(() => {
            element.classList.remove(...swappedClasses);
          }, 300);
        }
      } else if (selectedSpanId) {
        element.classList.add(...dimmedClasses);
        element.classList.remove(...selectedClasses);
        delete element.dataset.open;
      } else {
        element.classList.remove(
          ...selectedClasses,
          ...dimmedClasses,
          ...swappedClasses,
        );
        delete element.dataset.open;
      }
    });

    prevPromptRef.current = displayedPrompt;
  }, [selectedSpanId, enableMLHighlighting, displayedPrompt, editorRef]);

  useEffect(() => () => clearSwapTimeout(), [clearSwapTimeout]);
}
