/**
 * Session-id namespace contract.
 *
 * Three id families exist, and routing between local and server storage
 * depends on telling them apart:
 * - "draft-" prefix — in-memory drafts, never persisted anywhere.
 * - digit-only ids — LocalStoragePromptRepository sessions
 *   (`String(Date.now())`), owned by anonymous/local storage.
 * - everything else — server sessions (Firestore auto-ids).
 *
 * This module is the single source of truth for that classification.
 * Loaders that treat a local id as remote strand anonymous creators on an
 * unloadable /session/<id> URL (infinite "Loading prompt…").
 */

const isDigitOnly = (value: string): boolean => {
  if (value.length === 0) return false;
  for (const ch of value) {
    if (ch < "0" || ch > "9") return false;
  }
  return true;
};

export const isRemoteSessionId = (
  value: string | null | undefined,
): value is string => {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  if (normalized.length === 0) return false;
  if (normalized.startsWith("draft-")) return false;
  if (isDigitOnly(normalized)) return false;
  return true;
};
