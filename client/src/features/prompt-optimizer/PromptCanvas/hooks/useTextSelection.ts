/**
 * useTextSelection Hook
 *
 * Handles text selection and highlight interaction logic.
 * Extracted from PromptCanvas component to improve separation of concerns.
 */

import { useCallback, useMemo, type RefObject } from "react";
import {
  getSelectionOffsets,
  selectRange,
} from "@features/prompt-optimizer/utils/textSelection";
import {
  findHighlightNode,
  extractHighlightMetadata,
  createHighlightRange,
  resolveHighlightSpanId,
} from "@features/prompt-optimizer/utils/highlightInteractionHelpers";
import type {
  ParseResult,
  SuggestionPayload,
  SpanClickPayload,
} from "../types";
import { logger } from "@/services/LoggingService";

const log = logger.child("useTextSelection");

export interface UseTextSelectionOptions {
  selectedMode: string;
  editorRef: RefObject<HTMLElement>;
  displayedPrompt: string | null;
  parseResult: ParseResult;
  selectedSpanId?: string | null;
  onFetchSuggestions: ((payload: SuggestionPayload) => void) | undefined;
  onSpanSelect?: ((spanId: string | null) => void) | undefined;
  onIntentRefine?: (() => void) | undefined;
}

export interface UseTextSelectionReturn {
  handleTextSelection: () => void;
  handleHighlightClick: (e: React.MouseEvent) => void;
  handleHighlightMouseDown: (e: React.MouseEvent) => void;
  handleSpanClickFromCategory: (span: SpanClickPayload) => void;
}

export function useTextSelection({
  selectedMode,
  editorRef,
  displayedPrompt,
  parseResult,
  selectedSpanId,
  onFetchSuggestions,
  onSpanSelect,
  onIntentRefine,
}: UseTextSelectionOptions): UseTextSelectionReturn {
  const spanContextSpans = useMemo(
    () => (Array.isArray(parseResult?.spans) ? parseResult.spans : []),
    [parseResult?.spans],
  );

  const handleTextSelection = useCallback((): void => {
    if (selectedMode !== "video") {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }

    const rawText = selection.toString();
    const trimmed = rawText.trim();
    if (!trimmed) {
      return;
    }

    if (onFetchSuggestions && editorRef.current) {
      const cleanedText = trimmed.replace(/^-\s*/, "") || trimmed;
      const range = selection.getRangeAt(0).cloneRange();
      const offsets = getSelectionOffsets(editorRef.current, range);
      onFetchSuggestions({
        highlightedText: cleanedText,
        originalText: trimmed,
        displayedPrompt: displayedPrompt ?? "",
        range,
        offsets,
        metadata: null,
        trigger: "selection",
        allLabeledSpans: spanContextSpans,
      });
    }
  }, [
    selectedMode,
    editorRef,
    displayedPrompt,
    spanContextSpans,
    onFetchSuggestions,
  ]);

  const triggerSuggestionsFromTarget = useCallback(
    (targetElement: EventTarget | null, e: React.MouseEvent | null): void => {
      if (selectedMode !== "video" || !editorRef.current) {
        return;
      }
      // Find the highlighted word element
      const node = findHighlightNode(
        targetElement as HTMLElement | null,
        editorRef.current,
      );
      if (!node) {
        return;
      }

      // Strong intent signal: user clicked a highlighted token → refinement wins.
      if (onIntentRefine) {
        onIntentRefine();
      }

      // Prevent default text selection behavior
      if (e && e.preventDefault) {
        e.preventDefault();
      }

      // Extract metadata from the node
      const metadata = extractHighlightMetadata(node, {
        spans: parseResult.spans,
        displayText: parseResult.displayText,
      });
      const wordText = node.textContent?.trim() ?? "";
      const spanId = resolveHighlightSpanId({
        spanId: metadata?.spanId ?? node.dataset?.spanId ?? null,
        start: metadata?.start ?? node.dataset?.start,
        end: metadata?.end ?? node.dataset?.end,
        category: metadata?.category ?? node.dataset?.category ?? null,
      });

      // Update selected span state
      if (onSpanSelect && spanId) {
        if (selectedSpanId && selectedSpanId === spanId) {
          onSpanSelect(null);
          return;
        }
        onSpanSelect(spanId);
      }

      if (wordText && onFetchSuggestions) {
        // Create range and get offsets
        const { range, rangeClone, offsets } = createHighlightRange(
          node,
          editorRef.current,
          getSelectionOffsets,
        );

        // Update browser selection
        selectRange(range);

        // Trigger suggestions
        if (import.meta.env.DEV) {
          log.debug("Highlight click -> suggestion fetch", {
            trigger: "highlight",
            spanContextCount: spanContextSpans.length,
            hasMetadata: Boolean(metadata),
          });
        }
        onFetchSuggestions({
          highlightedText: wordText,
          originalText: wordText,
          displayedPrompt: displayedPrompt ?? "",
          range: rangeClone,
          offsets,
          metadata: metadata ?? null,
          trigger: "highlight",
          allLabeledSpans: spanContextSpans,
        });
      }
    },
    [
      selectedMode,
      editorRef,
      displayedPrompt,
      parseResult,
      selectedSpanId,
      onFetchSuggestions,
      spanContextSpans,
      onSpanSelect,
      onIntentRefine,
    ],
  );

  const handleHighlightClick = useCallback(
    (e: React.MouseEvent): void => {
      triggerSuggestionsFromTarget(e.target, e);
    },
    [triggerSuggestionsFromTarget],
  );

  const handleHighlightMouseDown = useCallback(
    (e: React.MouseEvent): void => {
      if (selectedMode !== "video" || !editorRef.current) {
        return;
      }
      const node = findHighlightNode(
        e.target as HTMLElement | null,
        editorRef.current,
      );
      if (!node) {
        return;
      }
      // Prevent native selection from interfering with click-based popover.
      e.preventDefault();
    },
    [selectedMode, editorRef],
  );

  const handleSpanClickFromCategory = useCallback(
    (span: SpanClickPayload): void => {
      if (!onFetchSuggestions || selectedMode !== "video") {
        return;
      }
      // Strong intent signal: user clicked a labeled token → refinement wins.
      if (onIntentRefine) {
        onIntentRefine();
      }

      // Update selected span state
      if (onSpanSelect && span.id) {
        if (selectedSpanId && selectedSpanId === span.id) {
          onSpanSelect(null);
          return;
        }
        onSpanSelect(span.id);
      }

      // Create synthetic event matching highlight click behavior
      onFetchSuggestions({
        highlightedText: span.quote,
        originalText: span.quote,
        displayedPrompt: displayedPrompt ?? "",
        range: null, // Not needed for category clicks
        offsets: { start: span.start, end: span.end },
        metadata: {
          category: span.category,
          source: span.source,
          spanId: span.id,
          start: span.start,
          end: span.end,
          startGrapheme: span.startGrapheme,
          endGrapheme: span.endGrapheme,
          validatorPass: span.validatorPass,
          confidence: span.confidence,
          quote: span.quote,
          leftCtx: span.leftCtx,
          rightCtx: span.rightCtx,
          idempotencyKey: span.idempotencyKey,
          span: span, // Full span object
        },
        trigger: "category-accordion",
        allLabeledSpans: spanContextSpans,
      });
    },
    [
      onFetchSuggestions,
      selectedMode,
      displayedPrompt,
      selectedSpanId,
      spanContextSpans,
      onSpanSelect,
      onIntentRefine,
    ],
  );

  return {
    handleTextSelection,
    handleHighlightClick,
    handleHighlightMouseDown,
    handleSpanClickFromCategory,
  };
}
