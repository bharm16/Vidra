import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCustomRequest } from "@components/SuggestionsPanel/hooks/useCustomRequest";
import type { HighlightSpan } from "@features/span-highlighting/hooks/useHighlightRendering";
import type {
  InlineSuggestion,
  PromptCanvasState,
  SuggestionItem,
  SuggestionsData,
} from "../types";
import { buildSuggestionContext } from "../../utils/enhancementSuggestionContext";
import { isMotionCategory } from "@shared/motionCategories";
import { useSuggestionFeedback } from "./useSuggestionFeedback";

interface UseInlineSuggestionStateOptions {
  suggestionsData: SuggestionsData | null;
  selectedSpanId: string | null;
  setSelectedSpanId: (value: string | null) => void;
  parseResultSpans: HighlightSpan[];
  normalizedDisplayedPrompt: string | null;
  onSuggestionClick?: (suggestion: SuggestionItem | string) => void;
  setState: (payload: Partial<PromptCanvasState>) => void;
}

interface UseInlineSuggestionStateResult {
  suggestionCount: number;
  inlineSuggestions: InlineSuggestion[];
  activeSuggestionIndex: number;
  setActiveSuggestionIndex: (value: number) => void;
  suggestionsListRef: React.RefObject<HTMLDivElement>;
  interactionSourceRef: React.MutableRefObject<"keyboard" | "mouse" | "auto">;
  handleSuggestionClickWithFeedback: (
    suggestion: SuggestionItem | string,
  ) => void;
  closeInlinePopover: () => void;
  selectionLabel: string;
  /** True when the selected span is a motion phrase (camera/action) — ADR-0010 S2. */
  isMotionSelection: boolean;
  customRequest: string;
  setCustomRequest: (value: string) => void;
  customRequestError: string;
  setCustomRequestError: (value: string) => void;
  handleCustomRequestSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  isCustomRequestDisabled: boolean;
  isCustomLoading: boolean;
  isInlineLoading: boolean;
  isInlineError: boolean;
  inlineErrorMessage: string;
  isInlineEmpty: boolean;
  handleApplyActiveSuggestion: () => void;
}

export function useInlineSuggestionState({
  suggestionsData,
  selectedSpanId,
  setSelectedSpanId,
  parseResultSpans,
  normalizedDisplayedPrompt,
  onSuggestionClick,
  setState,
}: UseInlineSuggestionStateOptions): UseInlineSuggestionStateResult {
  const suggestionsListRef = useRef<HTMLDivElement>(null!);
  const interactionSourceRef = useRef<"keyboard" | "mouse" | "auto">("auto");
  const previousSelectedSpanIdRef = useRef<string | null>(null);
  const previousSuggestionCountRef = useRef(0);

  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [customRequestError, setCustomRequestError] = useState("");

  const { handleSuggestionClickWithFeedback } = useSuggestionFeedback({
    suggestionsData,
    selectedSpanId,
    ...(onSuggestionClick ? { onSuggestionClick } : {}),
    setState,
  });

  const selectedSpan = useMemo(() => {
    if (!selectedSpanId || !Array.isArray(parseResultSpans)) {
      return null;
    }
    return (
      parseResultSpans.find((span) => {
        const candidateId =
          typeof span?.id === "string" && span.id.length > 0
            ? span.id
            : `span_${span.start}_${span.end}`;
        return candidateId === selectedSpanId;
      }) ?? null
    );
  }, [parseResultSpans, selectedSpanId]);

  const selectedSpanText = useMemo(() => {
    if (!selectedSpan) return "";
    const displayQuote =
      typeof selectedSpan.displayQuote === "string" &&
      selectedSpan.displayQuote.trim()
        ? selectedSpan.displayQuote
        : "";
    const quote =
      typeof selectedSpan.quote === "string" && selectedSpan.quote.trim()
        ? selectedSpan.quote
        : "";
    const text =
      typeof selectedSpan.text === "string" && selectedSpan.text.trim()
        ? selectedSpan.text
        : "";
    return (displayQuote || quote || text).trim();
  }, [selectedSpan]);

  const inlineSuggestions = useMemo<InlineSuggestion[]>(() => {
    const rawSuggestions = (suggestionsData?.suggestions ?? []) as Array<
      SuggestionItem | string
    >;
    return rawSuggestions
      .map((item, index) => {
        const rawText =
          typeof item === "string"
            ? item
            : typeof item?.text === "string"
              ? item.text
              : typeof (item as { label?: string } | null)?.label === "string"
                ? (item as { label?: string }).label
                : "";
        const text = (rawText ?? "").trim();

        if (!text) {
          return null;
        }

        // Chip subtitle: compatibility beats explanation. The raw taxonomy
        // category is deliberately NOT shown — every chip in the tray shares
        // the span's category, so it read as noise ("shot.type") to creators.
        const meta =
          typeof item === "object" && item
            ? typeof item.compatibility === "number"
              ? `${Math.round(item.compatibility * 100)}% match`
              : typeof item.explanation === "string"
                ? item.explanation
                : null
            : null;

        return {
          key: (item as { id?: string } | null)?.id ?? `${text}_${index}`,
          text,
          meta,
          item,
        };
      })
      .filter((item): item is InlineSuggestion => item !== null);
  }, [suggestionsData?.suggestions]);

  const suggestionCount = inlineSuggestions.length;

  const selectionMatches = useMemo(() => {
    if (!selectedSpanText || !suggestionsData?.selectedText) {
      return true;
    }
    return suggestionsData.selectedText.trim() === selectedSpanText.trim();
  }, [selectedSpanText, suggestionsData?.selectedText]);

  const isInlineLoading = Boolean(
    selectedSpanId &&
      (suggestionsData?.isLoading || !suggestionsData || !selectionMatches),
  );
  const isInlineError = Boolean(suggestionsData?.isError);
  const inlineErrorMessage =
    typeof suggestionsData?.errorMessage === "string" &&
    suggestionsData.errorMessage.trim()
      ? suggestionsData.errorMessage.trim()
      : "Failed to load suggestions.";
  const isInlineEmpty = Boolean(
    selectedSpanId &&
      !isInlineLoading &&
      !isInlineError &&
      suggestionCount === 0,
  );

  const selectionLabel =
    selectedSpanText || suggestionsData?.selectedText || "";
  const isMotionSelection = isMotionCategory(selectedSpan?.category);
  const customRequestSelection = selectionLabel.trim();
  const customRequestPrompt = (
    suggestionsData?.fullPrompt ||
    normalizedDisplayedPrompt ||
    ""
  ).trim();

  const customRequestPreferIndex = useMemo(() => {
    const preferIndexRaw =
      suggestionsData?.metadata?.span?.start ??
      suggestionsData?.metadata?.start ??
      suggestionsData?.offsets?.start ??
      null;
    return typeof preferIndexRaw === "number" && Number.isFinite(preferIndexRaw)
      ? preferIndexRaw
      : null;
  }, [suggestionsData?.metadata, suggestionsData?.offsets]);

  const customRequestContext = useMemo(() => {
    if (!customRequestSelection || !customRequestPrompt) {
      return null;
    }
    const normalizedPrompt = customRequestPrompt.normalize("NFC");
    const normalizedHighlight = customRequestSelection.normalize("NFC");
    return buildSuggestionContext(
      normalizedPrompt,
      normalizedHighlight,
      customRequestPreferIndex,
      1000,
    );
  }, [customRequestSelection, customRequestPrompt, customRequestPreferIndex]);

  const {
    customRequest,
    setCustomRequest,
    handleCustomRequest,
    isCustomLoading,
  } = useCustomRequest({
    selectedText: customRequestSelection,
    fullPrompt: customRequestPrompt,
    contextBefore: customRequestContext?.contextBefore ?? "",
    contextAfter: customRequestContext?.contextAfter ?? "",
    metadata: suggestionsData?.metadata ?? null,
    setSuggestions: suggestionsData?.setSuggestions ?? (() => {}),
    setError: setCustomRequestError,
  });

  const isCustomRequestReady =
    Boolean(customRequestSelection && customRequestPrompt) && !isInlineLoading;
  const isCustomRequestDisabled =
    !isCustomRequestReady || !customRequest.trim() || isCustomLoading;

  const handleCustomRequestSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>): void => {
      event.preventDefault();
      if (isCustomRequestDisabled) return;
      void handleCustomRequest();
    },
    [handleCustomRequest, isCustomRequestDisabled],
  );

  const closeInlinePopover = useCallback((): void => {
    setSelectedSpanId(null);
    setActiveSuggestionIndex(0);
    suggestionsData?.onClose?.();
  }, [setSelectedSpanId, suggestionsData]);

  useEffect(() => {
    setCustomRequest("");
    setCustomRequestError("");
  }, [selectedSpanId, setCustomRequest]);

  useEffect(() => {
    const justOpened =
      previousSelectedSpanIdRef.current !== selectedSpanId && selectedSpanId;
    const countChanged = suggestionCount !== previousSuggestionCountRef.current;

    if (selectedSpanId && (justOpened || countChanged)) {
      interactionSourceRef.current = "auto";
      setActiveSuggestionIndex(0);
    }

    previousSelectedSpanIdRef.current = selectedSpanId;
    previousSuggestionCountRef.current = suggestionCount;
  }, [selectedSpanId, suggestionCount]);

  useEffect(() => {
    if (!selectedSpanId || !suggestionsListRef.current) return;

    // Skip scrolling if the change came from mouse hover to prevent fighting/looping
    if (interactionSourceRef.current === "mouse") return;

    const list = suggestionsListRef.current;
    const activeItem = list.querySelector(
      `[data-index="${activeSuggestionIndex}"]`,
    ) as HTMLElement | null;
    if (activeItem) {
      activeItem.scrollIntoView({ block: "nearest" });
    }
  }, [selectedSpanId, activeSuggestionIndex]);

  const handleApplyActiveSuggestion = useCallback((): void => {
    const active = inlineSuggestions[activeSuggestionIndex];
    if (!active) return;
    handleSuggestionClickWithFeedback(active.item);
  }, [
    activeSuggestionIndex,
    inlineSuggestions,
    handleSuggestionClickWithFeedback,
  ]);

  useEffect(() => {
    if (!selectedSpanId) return;
    const handleKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const isTextInput =
        !!target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
      const isCustomRequestTarget =
        !!target && Boolean(target.closest?.("[data-suggest-custom]"));

      if (event.key === "Escape") {
        event.preventDefault();
        closeInlinePopover();
        return;
      }

      // Don't hijack navigation while typing into inputs (including the custom request box).
      if (isTextInput || isCustomRequestTarget) {
        return;
      }

      if (!suggestionCount) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        interactionSourceRef.current = "keyboard";
        setActiveSuggestionIndex((prev) => (prev + 1) % suggestionCount);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        interactionSourceRef.current = "keyboard";
        setActiveSuggestionIndex((prev) =>
          prev - 1 < 0 ? suggestionCount - 1 : prev - 1,
        );
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        handleApplyActiveSuggestion();
        closeInlinePopover();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedSpanId,
    suggestionCount,
    closeInlinePopover,
    handleApplyActiveSuggestion,
  ]);

  return {
    suggestionCount,
    inlineSuggestions,
    activeSuggestionIndex,
    setActiveSuggestionIndex,
    suggestionsListRef,
    interactionSourceRef,
    handleSuggestionClickWithFeedback,
    closeInlinePopover,
    selectionLabel,
    isMotionSelection,
    customRequest,
    setCustomRequest,
    customRequestError,
    setCustomRequestError,
    handleCustomRequestSubmit,
    isCustomRequestDisabled,
    isCustomLoading,
    isInlineLoading,
    isInlineError,
    inlineErrorMessage,
    isInlineEmpty,
    handleApplyActiveSuggestion,
  };
}
