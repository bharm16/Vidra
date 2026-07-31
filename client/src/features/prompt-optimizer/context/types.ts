/**
 * Types for PromptStateContext
 */

import type { ReactNode, Dispatch, SetStateAction } from "react";
import type { NavigateFunction } from "react-router-dom";
import type {
  PromptHistoryEntry,
  PromptKeyframe,
  PromptVersionEdit,
  PromptVersionEntry,
} from "@features/prompt-optimizer/types/domain/prompt-session";
import type {
  Mode,
  WorkspaceUser as User,
} from "@features/prompt-optimizer/types/domain/workspace";
import type { PromptContext } from "@utils/PromptContext/PromptContext";
import type { CapabilityValues } from "@shared/capabilities";
import type { UpdatePromptOptions } from "@repositories/promptRepositoryTypes";
import type {
  HighlightSnapshot as CanvasHighlightSnapshot,
  SuggestionsData,
} from "../PromptCanvas/types";
import type { LockedSpan, OptimizationOptions } from "../types";
import type { VideoTier } from "@features/generation-controls";

export type { PromptHistoryEntry, PromptKeyframe, PromptVersionEntry, User };
export type HighlightSnapshot = CanvasHighlightSnapshot;
export type { Mode };

export interface PromptOptimizer {
  inputPrompt: string;
  setInputPrompt: (prompt: string) => void;
  isProcessing: boolean;
  optimizedPrompt: string;
  setOptimizedPrompt: (prompt: string) => void;
  displayedPrompt: string;
  setDisplayedPrompt: (prompt: string) => void;
  genericOptimizedPrompt: string | null;
  setGenericOptimizedPrompt?: (prompt: string | null) => void;
  previewPrompt: string | null;
  setPreviewPrompt: (prompt: string | null) => void;
  previewAspectRatio: string | null;
  setPreviewAspectRatio: (ratio: string | null) => void;
  qualityScore: number | null;
  skipAnimation: boolean;
  setSkipAnimation: (skip: boolean) => void;
  improvementContext: unknown | null;
  setImprovementContext: (context: unknown | null) => void;
  optimizationResultVersion: number;
  lockedSpans: LockedSpan[];
  optimize: (
    prompt?: string,
    context?: Record<string, unknown> | null,
    brainstormContext?: Record<string, unknown> | null,
    targetModel?: string,
    options?: OptimizationOptions,
  ) => Promise<{ optimized: string; score: number | null } | null>;
  compile: (
    prompt: string,
    targetModel?: string,
    context?: Record<string, unknown> | null,
  ) => Promise<{ optimized: string; score: number | null } | null>;
  resetPrompt: () => void;
  setLockedSpans: (spans: LockedSpan[]) => void;
  addLockedSpan: (span: LockedSpan) => void;
  removeLockedSpan: (spanId: string) => void;
  clearLockedSpans: () => void;
}

export interface PromptHistory {
  history: PromptHistoryEntry[];
  filteredHistory: PromptHistoryEntry[];
  isLoadingHistory: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  saveToHistory: (
    input: string,
    output: string,
    score: number | null,
    selectedMode: string,
    targetModel?: string | null,
    generationParams?: Record<string, unknown> | null,
    keyframes?: PromptHistoryEntry["keyframes"],
    brainstormContext?: Record<string, unknown> | null,
    highlightCache?: Record<string, unknown> | null,
    existingUuid?: string | null,
    title?: string | null,
  ) => Promise<{ uuid: string; id: string } | null>;
  createDraft: (params: {
    id?: string | null;
    mode: string;
    targetModel: string | null;
    generationParams: Record<string, unknown> | null;
    keyframes?: PromptHistoryEntry["keyframes"];
    uuid?: string;
    input?: string;
    output?: string;
    title?: string | null;
    brainstormContext?: Record<string, unknown> | null;
    highlightCache?: Record<string, unknown> | null;
    versions?: PromptVersionEntry[];
    persist?: boolean;
  }) => { uuid: string; id: string };
  updateEntryLocal: (
    uuid: string,
    updates: Partial<PromptHistoryEntry>,
  ) => void;
  clearHistory: () => Promise<void>;
  deleteFromHistory: (entryId: string) => Promise<void>;
  loadHistoryFromFirestore: (userId: string) => Promise<void>;
  updateEntryHighlight: (
    uuid: string,
    highlightCache: Record<string, unknown>,
  ) => void;
  updateEntryOutput: (
    uuid: string,
    docId: string | null,
    output: string,
  ) => Promise<void>;
  updateEntryPersisted: (
    uuid: string,
    docId: string | null,
    updates: UpdatePromptOptions,
  ) => void;
  updateEntryVersions: (
    uuid: string,
    docId: string | null,
    versions: PromptVersionEntry[],
  ) => void;
}

export interface StateSnapshot {
  text: string;
  highlight: HighlightSnapshot | null;
  timestamp: number;
  version: number;
}

export interface PromptConfigState {
  // Mode
  modes: Mode[];
  selectedMode: string;
  setSelectedMode: (mode: string) => void;
  currentMode: Mode;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  generationParams: CapabilityValues;
  setGenerationParams: (params: CapabilityValues) => void;
  videoTier: VideoTier;
  setVideoTier: (tier: VideoTier) => void;
}

export interface PromptUIState {
  // UI State
  showHistory: boolean;
  setShowHistory: (show: boolean) => void;
  showResults: boolean;
  setShowResults: (show: boolean) => void;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
  showShortcuts: boolean;
  setShowShortcuts: (show: boolean) => void;
  showImprover: boolean;
  setShowImprover: (show: boolean) => void;
  showBrainstorm: boolean;
  setShowBrainstorm: (show: boolean) => void;
  currentAIIndex: number;
  setCurrentAIIndex: (index: number) => void;

  // Output persistence (autosave)
  outputSaveState: "idle" | "saving" | "saved" | "error";
  setOutputSaveState: (state: "idle" | "saving" | "saved" | "error") => void;
  outputLastSavedAt: number | null;
  setOutputLastSavedAt: (timestampMs: number | null) => void;
}

/**
 * The working prompt's identity as last written through the session-state
 * setters. Mirrors `currentPromptUuid`/`currentPromptDocId` exactly, but is
 * updated synchronously — same-turn continuations (e.g. the Idea Box frame
 * chain running right after an optimization save promotes a draft to a
 * session) must read it instead of render-time state, which is one turn
 * stale at that point.
 */
export interface PromptIdentity {
  uuid: string | null;
  docId: string | null;
}

export interface PromptSessionState {
  // Prompt State
  suggestionsData: SuggestionsData | null;
  setSuggestionsData: Dispatch<SetStateAction<SuggestionsData | null>>;
  conceptElements: unknown | null;
  setConceptElements: (elements: unknown | null) => void;
  promptContext: PromptContext | null;
  setPromptContext: (context: PromptContext | null) => void;
  currentPromptUuid: string | null;
  setCurrentPromptUuid: (uuid: string | null) => void;
  currentPromptDocId: string | null;
  setCurrentPromptDocId: (docId: string | null) => void;
  /** Synchronous mirror of the two fields above — see PromptIdentity. */
  promptIdentityRef: React.MutableRefObject<PromptIdentity>;
  activeVersionId: string | null;
  setActiveVersionId: (id: string | null) => void;
}

export interface PromptHighlightState {
  // Highlights
  initialHighlights: HighlightSnapshot | null;
  setInitialHighlights: (highlights: HighlightSnapshot | null) => void;
  initialHighlightsVersion: number;
  setInitialHighlightsVersion: (version: number) => void;
  canUndo: boolean;
  setCanUndo: (canUndo: boolean) => void;
  canRedo: boolean;
  setCanRedo: (canRedo: boolean) => void;

  // Refs
  latestHighlightRef: React.MutableRefObject<HighlightSnapshot | null>;
  persistedSignatureRef: React.MutableRefObject<string | null>;
  versionEditCountRef: React.MutableRefObject<number>;
  versionEditsRef: React.MutableRefObject<PromptVersionEdit[]>;
  undoStackRef: React.MutableRefObject<StateSnapshot[]>;
  redoStackRef: React.MutableRefObject<StateSnapshot[]>;
  isApplyingHistoryRef: React.MutableRefObject<boolean>;
  skipLoadFromUrlRef: React.MutableRefObject<boolean>;
}

export interface PromptServicesState {
  // Hooks
  promptOptimizer: PromptOptimizer;
  promptHistory: PromptHistory;
}

export interface PromptActionsState {
  // Helper functions
  applyInitialHighlightSnapshot: (
    snapshot: HighlightSnapshot | null,
    options?: { bumpVersion?: boolean; markPersisted?: boolean },
  ) => void;
  resetEditStacks: () => void;
  registerPromptEdit: (payload: {
    previousText: string;
    nextText: string;
    source?: "manual" | "suggestion" | "unknown";
  }) => void;
  resetVersionEdits: () => void;
  setDisplayedPromptSilently: (text: string) => void;
  handleCreateNew: () => void;
  loadFromHistory: (entry: PromptHistoryEntry) => void;
}

export interface PromptNavigationState {
  // Navigation
  navigate: NavigateFunction;
  sessionId: string | undefined;
}

export type PromptStateContextValue = PromptConfigState &
  PromptUIState &
  PromptSessionState &
  PromptHighlightState &
  PromptServicesState &
  PromptActionsState &
  PromptNavigationState;

export interface PromptStateProviderProps {
  children: ReactNode;
  user: User | null;
}
