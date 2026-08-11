import type { Generation } from "./generation";

export interface User {
  uid: string;
  email?: string;
  displayName?: string;
  photoURL?: string | null;
  emailVerified?: boolean;
  isAnonymous?: boolean;
}

export type PromptKeyframeSource =
  | "upload"
  | "library"
  | "generation"
  | "asset";

export interface PromptKeyframe {
  id?: string;
  url: string;
  source?: PromptKeyframeSource;
  assetId?: string;
  storagePath?: string;
  viewUrlExpiresAt?: string;
  /** Lineage for generation-sourced frames (M5 2b): the source picture… */
  generationId?: string;
  /** …and the words that produced it. Survive the persistence round trip. */
  sourcePrompt?: string;
}

export interface PromptVersionEdit {
  timestamp: string;
  delta?: number;
  source?: "manual" | "suggestion" | "unknown";
}

/** The first frame generated for this words-version (CONTEXT.md → First frame). */
export interface PromptVersionFirstFrame {
  generatedAt: string;
  imageUrl?: string | null;
  aspectRatio?: string | null;
  storagePath?: string | null;
  assetId?: string | null;
  viewUrlExpiresAt?: string | null;
}

export interface PromptVersionVideo {
  generatedAt: string;
  videoUrl?: string | null;
  model?: string | null;
  generationParams?: Record<string, unknown> | null;
  storagePath?: string | null;
  assetId?: string | null;
  viewUrlExpiresAt?: string | null;
}

export interface PromptVersionEntry {
  versionId: string;
  label?: string;
  signature: string;
  prompt: string;
  timestamp: string;
  highlights?: Record<string, unknown>;
  editCount?: number;
  edits?: PromptVersionEdit[];
  firstFrame?: PromptVersionFirstFrame;
  video?: PromptVersionVideo;
  generations?: Generation[];
}

export interface PromptHistoryEntry {
  id?: string;
  uuid?: string;
  timestamp?: string;
  title?: string | null;
  input: string;
  output: string;
  score?: number | null;
  mode?: string;
  targetModel?: string | null;
  generationParams?: Record<string, unknown> | null;
  keyframes?: PromptKeyframe[] | null;
  brainstormContext?: Record<string, unknown> | null;
  highlightCache?: Record<string, unknown> | null;
  versions?: PromptVersionEntry[];
}
