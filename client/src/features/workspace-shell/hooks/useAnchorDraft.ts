import { useEffect, useRef, type RefObject } from "react";

import {
  clearAnchorDraft,
  readAnchorDraft,
  writeAnchorDraft,
} from "../utils/anchorDraft";

interface UseAnchorDraftParams {
  /** Whether the workspace is in the pre-work (empty) state. */
  isPreWork: boolean;
  /** The composer's current text (for persistence). */
  prompt: string;
  /** The contenteditable editor, for replaying a restored draft through it. */
  editorRef: RefObject<HTMLElement>;
}

/**
 * Persist the unsent Anchor prompt across reloads. The session draft-autosave
 * only kicks in once a session exists (post-submit); this covers the words
 * typed at the front door before that.
 *
 * Restore is done by *replaying* the draft through the editor's own input path
 * — writing the text and dispatching a real `input` event — rather than via the
 * React fill (`onComposerFill`). The fill sets state that the mount-time render
 * race discards; the input event is the exact path typing takes, so the
 * composer adopts the words and never clobbers them (verified in Chrome). The
 * draft is captured synchronously on first render so the save effect can't
 * overwrite it with the initial empty prompt (matters under React.StrictMode).
 */
export function useAnchorDraft({
  isPreWork,
  prompt,
  editorRef,
}: UseAnchorDraftParams): void {
  const draftRef = useRef<string | null>(null);
  if (draftRef.current === null) draftRef.current = readAnchorDraft();

  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !isPreWork) return;
    const draft = draftRef.current;
    if (!draft) {
      restoredRef.current = true;
      return;
    }
    // The composer's initial render burst repeatedly writes the empty prompt
    // into the editor (via its own layout effect), so a single injection gets
    // clobbered. Re-assert the draft each frame until it sticks — or until the
    // field holds real words (a session hydrated, or a fast typist) — within a
    // bounded window, after which the user is in control.
    const deadline = performance.now() + 1000;
    let raf = 0;
    const tick = (): void => {
      const el = editorRef.current;
      if (el) {
        const text = el.textContent ?? "";
        if (text === draft) {
          restoredRef.current = true; // stuck — done
          return;
        }
        if (text.trim()) {
          restoredRef.current = true; // field has other words — never clobber
          return;
        }
        el.textContent = draft;
        el.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            inputType: "insertText",
            data: draft,
          }),
        );
      }
      if (performance.now() < deadline) {
        raf = requestAnimationFrame(tick);
      } else {
        restoredRef.current = true;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPreWork, editorRef]);

  useEffect(() => {
    // Once work starts, a session owns the words — drop the front-door copy.
    if (!isPreWork) {
      clearAnchorDraft();
      return;
    }
    // Persist only non-empty text. Never wipe the stored draft on a momentarily
    // empty prompt (initial mount, StrictMode remount, or an in-flight restore)
    // — that would clobber the very draft we mean to restore. A manual clear of
    // the field therefore doesn't persist; a rare edge not worth the race.
    if (prompt.trim()) writeAnchorDraft(prompt);
  }, [isPreWork, prompt]);
}
