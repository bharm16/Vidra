/**
 * Types for PromptCanvas component
 */

import type { OptimizationOptions } from "../types";
import type { PromptContext } from "@utils/PromptContext/PromptContext";
import type { CanonicalText } from "@utils/canonicalText";
import type { HighlightSpan } from "@features/span-highlighting";
import type { SpanLabelingResult } from "@features/span-highlighting/hooks/types";
import type {
  Mode,
  WorkspaceUser as User,
} from "@features/prompt-optimizer/types/domain/workspace";
import type {
  SuggestionItem,
  SuggestionPayload,
} from "@features/prompt-optimizer/types/domain/suggestions";

import type { I2VContext } from "../types/i2v";

export interface HighlightSnapshot {
  spans: Array<{
    start: number;
    end: number;
    category: string;
    confidence: number;
  }>;
  meta?: Record<string, unknown> | null;
  signature?: string;
  cacheId?: string | null;
  updatedAt?: string;
  [key: string]: unknown;
}

/**
 * Pipeline health status.
 *
 * - `idle`       – no labeling requested yet
 * - `loading`    – first request in-flight, no data yet
 * - `refreshing` – re-fetching while stale data is still displayed
 * - `success`    – fresh data, no errors
 * - `stale`      – showing cached fallback after a network error
 * - `error`      – labeling failed and no fallback is available
 */
export type ParseResultStatus =
  | "idle"
  | "loading"
  | "refreshing"
  | "success"
  | "stale"
  | "error";

export interface ParseResult {
  canonical: CanonicalText;
  spans: HighlightSpan[];
  meta: Record<string, unknown> | null;
  status: ParseResultStatus;
  error: Error | null;
  displayText: string;
  /** True when the pipeline is serving cached/fallback data after an error.
   *  UI can use this to show a subtle indicator without blocking interaction. */
  degraded: boolean;
}

export interface SpanClickPayload {
  quote: string;
  start: number;
  end: number;
  category?: string;
  source?: string;
  spanId?: string;
  startGrapheme?: number;
  endGrapheme?: number;
  validatorPass?: boolean;
  confidence?: number;
  leftCtx?: string;
  rightCtx?: string;
  idempotencyKey?: string;
  id?: string;
}

export interface InlineSuggestion {
  key: string;
  text: string;
  meta: string | null;
  item: SuggestionItem | string;
}

export interface SuggestionsData {
  show: boolean;
  selectedText: string;
  originalText: string;
  suggestions: SuggestionItem[];
  isLoading: boolean;
  isError?: boolean;
  errorMessage?: string | null;
  isPlaceholder: boolean;
  fullPrompt: string;
  range?: Range | null;
  offsets?: { start?: number; end?: number } | null;
  metadata?: {
    category?: string;
    spanId?: string;
    start?: number;
    end?: number;
    span?: {
      id?: string;
      start?: number;
      end?: number;
      category?: string;
      confidence?: number;
      quote?: string;
      [key: string]: unknown;
    };
    confidence?: number;
    leftCtx?: string;
    rightCtx?: string;
    idempotencyKey?: string | null;
    [key: string]: unknown;
  } | null;
  allLabeledSpans?: HighlightSpan[];
  onRetry?: () => void;
  setSuggestions?: (suggestions: SuggestionItem[], category?: string) => void;
  onSuggestionClick?: (
    suggestion: SuggestionItem | string,
  ) => void | Promise<void>;
  onClose?: () => void;
  responseMetadata?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface PromptCanvasState {
  showExportMenu: boolean;
  showLegend: boolean;
  rightPaneMode: "refine" | "preview";
  showHighlights: boolean;
  visualLastGeneratedAt: number | null;
  videoLastGeneratedAt: number | null;
  visualGenerateRequestId: number;
  videoGenerateRequestId: number;
  isEditing: boolean;
  originalInputPrompt: string;
  originalSelectedModel: string | undefined;
  selectedSpanId: string | null;
  lastAppliedSpanId: string | null;
  hasInteracted: boolean;
  hoveredSpanId: string | null;
  lastSwapTime: number | null;
  promptState: "generated" | "edited" | "synced";
  generatedTimestamp: number | null;
  justReplaced: { from: string; to: string } | null;
}

export type PromptCanvasAction =
  | { type: "MERGE_STATE"; payload: Partial<PromptCanvasState> }
  | { type: "INCREMENT_VISUAL_REQUEST_ID" }
  | { type: "INCREMENT_VIDEO_REQUEST_ID" };

export interface ValidSpan {
  start: number;
  end: number;
  category: string;
  confidence: number;
}

export interface PromptCanvasProps {
  user?: User | null | undefined;
  showResults?: boolean | undefined;
  inputPrompt: string;
  onInputPromptChange: (text: string) => void;
  onResetResultsForEditing?: (() => void) | undefined;
  onReoptimize: (
    promptToOptimize?: string,
    options?: OptimizationOptions,
  ) => Promise<void>;
  displayedPrompt: string | null;
  optimizedPrompt: string;
  previewPrompt?: string | null | undefined;
  previewAspectRatio?: string | null | undefined;
  qualityScore: number | null;
  selectedMode: string;
  currentMode: Mode;
  promptUuid: string | null;
  promptContext: PromptContext | null;
  onDisplayedPromptChange: (text: string) => void;
  suggestionsData: SuggestionsData | null;
  onFetchSuggestions?: ((payload: SuggestionPayload) => void) | undefined;
  onSuggestionClick?:
    | ((suggestion: SuggestionItem | string) => void)
    | undefined;
  onCreateNew: () => void;
  initialHighlights?: HighlightSnapshot | null | undefined;
  initialHighlightsVersion?: number | undefined;
  onHighlightsPersist?: ((result: SpanLabelingResult) => void) | undefined;
  onUndo?: (() => void) | undefined;
  onRedo?: (() => void) | undefined;
  canUndo?: boolean | undefined;
  canRedo?: boolean | undefined;
  isProcessing?: boolean | undefined;
  optimizationResultVersion?: number | undefined;

  // Coherence panel (inline, collapsible)
  i2vContext?: I2VContext | null | undefined;
}

export type { SuggestionItem, SuggestionPayload };
