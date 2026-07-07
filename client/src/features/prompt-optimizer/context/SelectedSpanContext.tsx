import React, { createContext, useContext } from "react";
import type { InlineSuggestion, SuggestionItem } from "../PromptCanvas/types";

/**
 * Selected-span module: everything the canvas knows about the span the
 * creator clicked for click-to-enhance — the selection itself, the inline
 * suggestion session it opens, and the custom-request escape hatch.
 *
 * PromptCanvas owns the state and provides it once; consumers subscribe via
 * useSelectedSpan() instead of threading these fields through the component
 * tree as props.
 */
export interface SelectedSpanContextValue {
  selectedSpanId: string | null;
  selectionLabel: string;
  /** True when the selected span is a motion phrase (camera/action) — ADR-0010 S2. */
  isMotionSelection: boolean;
  suggestionCount: number;
  suggestionsListRef: React.RefObject<HTMLDivElement>;
  inlineSuggestions: InlineSuggestion[];
  activeSuggestionIndex: number;
  onActiveSuggestionChange: (index: number) => void;
  interactionSourceRef: React.MutableRefObject<"keyboard" | "mouse" | "auto">;
  onSuggestionClick: (suggestion: SuggestionItem | string) => void;
  onCloseInlinePopover: () => void;
  onApplyActiveSuggestion: () => void;
  customRequest: string;
  onCustomRequestChange: (value: string) => void;
  customRequestError: string;
  onCustomRequestErrorChange: (value: string) => void;
  onCustomRequestSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  isCustomRequestDisabled: boolean;
  isCustomLoading: boolean;
  responseMetadata: Record<string, unknown> | null;
  onCopyAllDebug?: (() => void) | undefined;
  isBulkCopyLoading?: boolean | undefined;
  isInlineLoading: boolean;
  isInlineError: boolean;
  inlineErrorMessage: string;
  isInlineEmpty: boolean;
}

const SelectedSpanContext = createContext<SelectedSpanContextValue | null>(
  null,
);

export function SelectedSpanProvider({
  value,
  children,
}: {
  value: SelectedSpanContextValue;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <SelectedSpanContext.Provider value={value}>
      {children}
    </SelectedSpanContext.Provider>
  );
}

export function useSelectedSpan(): SelectedSpanContextValue {
  const context = useContext(SelectedSpanContext);
  if (!context) {
    throw new Error(
      "useSelectedSpan must be used within a SelectedSpanProvider",
    );
  }
  return context;
}
