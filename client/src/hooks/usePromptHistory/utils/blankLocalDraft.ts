import type { PromptHistoryEntry } from "../types";

const normalizeIdentifier = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

/**
 * Local "draft-" entries are workspace scaffolding: usePromptLoader bootstraps
 * one on every blank session load (persist: false) so draft sync and in-memory
 * hydration can find it in `history`. Until they hold creator content they are
 * invisible in the sessions list AND excluded from persistent-store snapshots —
 * a blank bootstrap draft must never become a durable store entry.
 * generationParams deliberately do not count as content — the bootstrap copies
 * persisted workspace settings onto the draft, so params alone are not
 * evidence of user work.
 */
export const isBlankLocalDraft = (entry: PromptHistoryEntry): boolean => {
  const id = normalizeIdentifier(entry.id);
  if (id === null || !id.startsWith("draft-")) return false;
  if (typeof entry.title === "string" && entry.title.trim().length > 0) {
    return false;
  }
  if (entry.input.trim().length > 0) return false;
  if (entry.output.trim().length > 0) return false;
  if (Array.isArray(entry.keyframes) && entry.keyframes.length > 0) {
    return false;
  }
  if (Array.isArray(entry.versions) && entry.versions.length > 0) {
    return false;
  }
  return true;
};
