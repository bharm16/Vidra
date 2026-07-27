/**
 * Span edit history
 *
 * Records the span edits a creator applies during a session so the next
 * enhancement request can send them as context.
 *
 * Storage: a single module-scoped store, session-only (resets on page refresh).
 *
 * Why a module store and not a hook: the two consumers — the apply path
 * (useSuggestionApply) and the fetch path (useSuggestionApi) — are sibling
 * hooks with no common provider, and neither renders from the history. A
 * per-call-site `useReducer` gave each of them its own empty list, which is
 * exactly why the `editHistory` field on every request was permanently `[]`.
 * A module store is the smallest thing that gives both call sites one instance.
 */

/** Entries older than this fall off the front (FIFO). */
const MAX_EDITS = 50;

/**
 * A recorded edit, in the shape the enhancement route accepts
 * (`editHistoryItemSchema` in server/src/config/schemas/suggestionSchemas.ts).
 */
export interface SpanEdit {
  original: string;
  replacement: string;
  category: string | null;
  timestamp: number;
}

const edits: SpanEdit[] = [];

/**
 * Record an applied span edit. No-ops when either side is empty or the
 * replacement is the original.
 */
export function recordSpanEdit({
  original,
  replacement,
  category = null,
}: {
  original: string;
  replacement: string;
  category?: string | null;
}): void {
  if (!original || !replacement) return;
  if (original.trim() === replacement.trim()) return;

  edits.push({
    original,
    replacement,
    category: category ?? null,
    timestamp: Date.now(),
  });

  if (edits.length > MAX_EDITS) {
    edits.shift();
  }
}

/** Read the most recent edits, oldest first. */
export function getRecentSpanEdits(count = 10): SpanEdit[] {
  return edits.slice(-count);
}

/** Test seam — drops the session's edits so each test starts empty. */
export function clearSpanEditHistory(): void {
  edits.length = 0;
}
