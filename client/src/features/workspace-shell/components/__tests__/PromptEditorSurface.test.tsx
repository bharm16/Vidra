import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { withSelectedSpan } from "@/features/prompt-optimizer/context/__tests__/selectedSpanTestHarness";
import { PromptEditorSurface } from "../PromptEditorSurface";
import type { PromptEditorSurfaceProps } from "../PromptEditorSurface";

const noop = (): void => {};

function makeProps(
  overrides: Partial<PromptEditorSurfaceProps> = {},
): PromptEditorSurfaceProps {
  return {
    editorRef: createRef<HTMLDivElement>(),
    prompt: "",
    onTextSelection: noop,
    onHighlightClick: noop,
    onHighlightMouseDown: noop,
    onHighlightMouseEnter: noop,
    onHighlightMouseLeave: noop,
    onCopyEvent: noop,
    onInput: noop,
    onEditorKeyDown: noop,
    onEditorBlur: noop,
    autocompleteOpen: false,
    autocompleteSuggestions: [],
    autocompleteSelectedIndex: -1,
    autocompletePosition: { top: 0, left: 0 },
    autocompleteLoading: false,
    onAutocompleteSelect: noop,
    onAutocompleteClose: noop,
    onAutocompleteIndexChange: noop,
    ...overrides,
  };
}

describe("PromptEditorSurface", () => {
  it("renders the prompt editor with a placeholder", () => {
    const { container } = render(
      withSelectedSpan(<PromptEditorSurface {...makeProps()} />),
    );
    const editor = container.querySelector("[data-placeholder]");
    expect(editor).not.toBeNull();
    expect(editor?.getAttribute("data-placeholder") ?? "").toMatch(
      /describe your shot/i,
    );
  });

  it("does not render the suggestion tray when no span is selected", () => {
    render(withSelectedSpan(<PromptEditorSurface {...makeProps()} />));
    expect(
      screen.queryByTestId("canvas-suggestion-tray"),
    ).not.toBeInTheDocument();
  });

  it("renders the suggestion tray when a span is selected", () => {
    render(
      withSelectedSpan(<PromptEditorSurface {...makeProps()} />, {
        selectedSpanId: "span-1",
      }),
    );
    expect(screen.getByTestId("canvas-suggestion-tray")).toBeInTheDocument();
  });
});
