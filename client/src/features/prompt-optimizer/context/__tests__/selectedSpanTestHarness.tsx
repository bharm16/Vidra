import React from "react";
import { vi } from "vitest";
import {
  SelectedSpanProvider,
  type SelectedSpanContextValue,
} from "../SelectedSpanContext";

/**
 * Test harness for components that consume useSelectedSpan().
 * Provides an idle selected-span session by default; override the
 * fields a test cares about.
 */
export function makeSelectedSpanValue(
  overrides: Partial<SelectedSpanContextValue> = {},
): SelectedSpanContextValue {
  return {
    selectedSpanId: null,
    selectionLabel: "",
    suggestionCount: 0,
    suggestionsListRef:
      React.createRef<HTMLDivElement>() as React.RefObject<HTMLDivElement>,
    inlineSuggestions: [],
    activeSuggestionIndex: 0,
    onActiveSuggestionChange: vi.fn(),
    interactionSourceRef: { current: "auto" },
    onSuggestionClick: vi.fn(),
    onCloseInlinePopover: vi.fn(),
    onApplyActiveSuggestion: vi.fn(),
    customRequest: "",
    onCustomRequestChange: vi.fn(),
    customRequestError: "",
    onCustomRequestErrorChange: vi.fn(),
    onCustomRequestSubmit: vi.fn(),
    isCustomRequestDisabled: true,
    isCustomLoading: false,
    responseMetadata: null,
    isInlineLoading: false,
    isInlineError: false,
    inlineErrorMessage: "",
    isInlineEmpty: true,
    ...overrides,
  };
}

export function withSelectedSpan(
  ui: React.ReactElement,
  overrides: Partial<SelectedSpanContextValue> = {},
): React.ReactElement {
  return (
    <SelectedSpanProvider value={makeSelectedSpanValue(overrides)}>
      {ui}
    </SelectedSpanProvider>
  );
}
