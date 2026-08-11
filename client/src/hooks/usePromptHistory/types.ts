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

export interface SaveResult {
  uuid: string;
  id: string;
}

export type { Toast };
