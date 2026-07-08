/**
 * Pre-session draft persistence for the Anchor (empty state).
 *
 * The app's draft-autosave persists *session* drafts, but the empty-state
 * prompt — typed before the first submit creates a session — is otherwise lost
 * on reload. This mirrors the design handoff's `es_anchor_draft_v1` behavior
 * with a Vidra-scoped key. Best-effort: storage failures (private mode) degrade
 * silently rather than throw.
 */
const ANCHOR_DRAFT_KEY = "vidra_anchor_draft_v1";

export function readAnchorDraft(): string {
  try {
    return localStorage.getItem(ANCHOR_DRAFT_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeAnchorDraft(text: string): void {
  try {
    // Empty is the same as no draft — keep the store clean so a reload after
    // clearing the field doesn't resurrect stale words.
    if (text) localStorage.setItem(ANCHOR_DRAFT_KEY, text);
    else localStorage.removeItem(ANCHOR_DRAFT_KEY);
  } catch {
    // Storage unavailable — draft persistence is best-effort.
  }
}

export function clearAnchorDraft(): void {
  try {
    localStorage.removeItem(ANCHOR_DRAFT_KEY);
  } catch {
    // no-op
  }
}
