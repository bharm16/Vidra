import type { HighlightSpan } from "@features/span-highlighting";

export interface SuggestionPayload {
  highlightedText?: string;
  originalText?: string;
  displayedPrompt?: string;
  range?: Range | null;
  offsets?: { start?: number; end?: number } | null;
  metadata?: Record<string, unknown> | null;
  trigger?: "selection" | "highlight" | "category-accordion";
  allLabeledSpans?: HighlightSpan[];
}

export interface SuggestionItem {
  id?: string | undefined;
  text?: string | undefined;
  category?: string | undefined;
  suggestions?: SuggestionItem[] | undefined;
  compatibility?: number | undefined;
  explanation?: string | undefined;
  [key: string]: unknown;
}
