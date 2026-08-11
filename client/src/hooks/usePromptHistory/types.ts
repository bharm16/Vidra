/**
 * Types for usePromptHistory hook
 */

export type {
  User,
  PromptKeyframe,
  PromptHistoryEntry,
  PromptVersionEdit,
  PromptVersionFirstFrame,
  PromptVersionVideo,
  PromptVersionEntry,
} from "@features/prompt-optimizer";

import type {
  PromptHistoryEntry,
  PromptKeyframe,
  PromptVersionEntry,
} from "@features/prompt-optimizer";
import type { Toast } from "@hooks/types";
import type { CapabilityValues } from "@shared/capabilities";

export interface HistoryState {
  history: PromptHistoryEntry[];
  isLoadingHistory: boolean;
  searchQuery: string;
}

export interface SaveEntryParams {
  uuid?: string;
  title?: string | null;
  input: string;
  output: string;
  score: number | null;
  mode: string;
  targetModel?: string | null;
  generationParams?: Record<string, unknown> | null;
  keyframes?: PromptKeyframe[] | null;
  brainstormContext?: Record<string, unknown> | null;
  highlightCache?: Record<string, unknown> | null;
  versions?: PromptVersionEntry[];
}

/**
 * Arguments for creating a draft history entry.
 *
 * One declaration because three call-facing types spelled this shape out
 * identically — the context's `PromptHistory`, its `usePromptHistoryActions`
 * dependencies, and `useHistoryPersistence`'s own return type — so narrowing a
 * field meant finding all three. Consumers that need only part of it
 * (useVersionManagement, usePromptLoader) still declare their own narrower
 * subset: depending on the smallest shape you actually call is the point of
 * structural typing, not duplication.
 */
export interface CreateDraftParams {
  id?: string | null;
  mode: string;
  targetModel: string | null;
  generationParams: CapabilityValues | null;
  keyframes?: PromptHistoryEntry["keyframes"];
  uuid?: string;
  input?: string;
  output?: string;
  title?: string | null;
  brainstormContext?: Record<string, unknown> | null;
  highlightCache?: Record<string, unknown> | null;
  versions?: PromptVersionEntry[];
  persist?: boolean;
}

export interface SaveResult {
  uuid: string;
  id: string;
}

export type { Toast };
