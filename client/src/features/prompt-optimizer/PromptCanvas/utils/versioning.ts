import type { Generation } from "@features/generations/types";
import type { PromptVersionEdit } from "@features/prompt-optimizer/types/domain/prompt-session";
import type { HighlightSnapshot } from "../types";

/**
 * Single source of the version-entry id format. Every call site that appends a
 * PromptVersionEntry mints its id here so the scheme lives in one place.
 */
export const mintVersionId = (): string =>
  `v-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * The edit-metadata inclusion rule shared by every non-seed version-entry
 * builder: record editCount only when positive and edits only when non-empty
 * (copied, so the caller's mutable ref is never leaked into persisted state).
 */
export const buildVersionEditMetadata = (
  editCount: number,
  edits: PromptVersionEdit[],
): { editCount?: number; edits?: PromptVersionEdit[] } => {
  const metadata: { editCount?: number; edits?: PromptVersionEdit[] } = {};
  if (editCount > 0) metadata.editCount = editCount;
  if (edits.length) metadata.edits = [...edits];
  return metadata;
};

export const resolveVersionTimestamp = (
  value: string | number | undefined,
): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
    const asNumber = Number(value);
    if (!Number.isNaN(asNumber)) return asNumber;
  }
  return null;
};

export const mapShotStatusToGenerationStatus = (
  status: string,
): Generation["status"] => {
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  if (status === "generating-keyframe" || status === "generating-video") {
    return "generating";
  }
  return "pending";
};

export const isHighlightSnapshot = (
  value: unknown,
): value is HighlightSnapshot =>
  !!value &&
  typeof value === "object" &&
  Array.isArray((value as HighlightSnapshot).spans);
