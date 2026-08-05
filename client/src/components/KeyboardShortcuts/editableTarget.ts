/**
 * "Is this keystroke the user typing?" — the one answer.
 *
 * Global keydown handlers all need it before they `preventDefault`, and the
 * naive versions are subtly wrong in ways that only show up in the editor:
 * `closest()` is required because a rich-text surface dispatches from a leaf
 * node inside its contenteditable host, and the attribute values must be
 * enumerated because a bare `[contenteditable]` selector also matches
 * `contenteditable="false"`, which is not editable.
 *
 * This lived module-private inside `useKeyboardShortcuts`, with the comment
 * above explaining exactly that — while two other global handlers shipped
 * narrower hand-rolled versions.
 *
 * Note what this is NOT: a "is the caret in a plain text box?" check. A
 * handler that deliberately stays live inside the prompt editor — inline
 * suggestion navigation, say — wants the narrower question and should keep
 * asking it directly.
 */

export const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(EDITABLE_SELECTOR) !== null;
}
