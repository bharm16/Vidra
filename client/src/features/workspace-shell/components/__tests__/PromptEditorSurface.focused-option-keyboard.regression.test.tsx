import { createRef, useMemo, useState, type ReactElement } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useInlineSuggestionState } from "@/features/prompt-optimizer/PromptCanvas/hooks/useInlineSuggestionState";
import type { SuggestionsData } from "@/features/prompt-optimizer/PromptCanvas/types";
import { SelectedSpanProvider } from "@/features/prompt-optimizer/context/SelectedSpanContext";
import { makeSelectedSpanValue } from "@/features/prompt-optimizer/context/__tests__/selectedSpanTestHarness";
import {
  PromptEditorSurface,
  type PromptEditorSurfaceProps,
} from "../PromptEditorSurface";

vi.unmock("@promptstudio/system/components/ui/button");
vi.unmock("@promptstudio/system/components/ui/textarea");

const suggestionsData: SuggestionsData = {
  show: true,
  selectedText: "warm evening light",
  originalText: "warm evening light",
  fullPrompt: "A runner in warm evening light.",
  isLoading: false,
  isPlaceholder: false,
  suggestions: [
    { text: "golden-hour sunlight" },
    { text: "soft amber light" },
    { text: "diffused sunset glow" },
  ],
};

function wiring(): PromptEditorSurfaceProps {
  return {
    editorRef: createRef<HTMLDivElement>(),
    onTextSelection: vi.fn(),
    onHighlightClick: vi.fn(),
    onHighlightMouseDown: vi.fn(),
    onHighlightMouseEnter: vi.fn(),
    onHighlightMouseLeave: vi.fn(),
    onCopyEvent: vi.fn(),
    onInput: vi.fn(),
  };
}

describe("focused replacement keyboard navigation", () => {
  it("applies the highlighted replacement after ArrowDown from a focused option", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollIntoView",
    );
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    const onSuggestionClick = vi.fn();
    function Harness(): ReactElement {
      const [selectedSpanId, setSelectedSpanId] = useState<string | null>(
        "span-1",
      );
      const editorWiring = useMemo(wiring, []);
      const state = useInlineSuggestionState({
        suggestionsData,
        selectedSpanId,
        setSelectedSpanId,
        parseResultSpans: [],
        normalizedDisplayedPrompt: suggestionsData.fullPrompt,
        onSuggestionClick,
        setState: () => {},
      });
      const value = makeSelectedSpanValue({
        selectedSpanId,
        selectionLabel: state.selectionLabel,
        suggestionCount: state.suggestionCount,
        inlineSuggestions: state.inlineSuggestions,
        suggestionsListRef: state.suggestionsListRef,
        activeSuggestionIndex: state.activeSuggestionIndex,
        onActiveSuggestionChange: state.setActiveSuggestionIndex,
        interactionSourceRef: state.interactionSourceRef,
        onSuggestionClick: state.handleSuggestionClickWithFeedback,
        onCloseInlinePopover: state.closeInlinePopover,
        onApplyActiveSuggestion: state.handleApplyActiveSuggestion,
        isInlineEmpty: state.isInlineEmpty,
      });
      return (
        <SelectedSpanProvider value={value}>
          <PromptEditorSurface {...editorWiring} />
        </SelectedSpanProvider>
      );
    }
    try {
      const user = userEvent.setup();
      render(<Harness />);
      const first = screen.getByRole("button", {
        name: "golden-hour sunlight",
      });
      const next = screen.getByRole("button", { name: "soft amber light" });
      act(() => first.focus());
      await user.keyboard("{ArrowDown}");
      expect(next).toHaveAttribute("aria-pressed", "true");
      expect(next).toHaveFocus();
      await user.keyboard("{Enter}");
      expect(onSuggestionClick).toHaveBeenCalledExactlyOnceWith({
        text: "soft amber light",
      });
    } finally {
      if (descriptor)
        Object.defineProperty(
          HTMLElement.prototype,
          "scrollIntoView",
          descriptor,
        );
      else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
  });
});
